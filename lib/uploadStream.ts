import { parseCsv, stringifyCsv } from "@/lib/csv";

export type RowIssue = { row: number; label: string; reason: string };
export type UploadResult = {
  totalRows: number;
  inserted: number;
  skippedCount: number;
  failedCount: number;
  skipped: RowIssue[];
  failed: RowIssue[];
};
export type UploadProgress = {
  percent: number;
  rowsDone: number;
  rowsTotal: number;
  part: number;
  parts: number;
  inserted: number;
  skipped: number;
  failed: number;
};

type StreamEvent =
  | { event: "start"; totalRows: number; skippedCount: number; skipped: RowIssue[] }
  | { event: "progress"; inserted: number; failedCount: number; failed: RowIssue[]; doneRows: number; totalRows: number }
  | { event: "done" };

// Vercel's serverless functions reject request bodies past a platform-level size
// limit (a few MB) that no app config can raise. Large files are split into
// chunks under that limit and uploaded as separate sequential requests instead.
const CHUNK_CHAR_LIMIT = 3_000_000;
export const MAX_DISPLAYED = 200;
const CHUNK_TIMEOUT_MS = 55_000; // a chunk should never legitimately take this long

function rowSize(row: string[]): number {
  return row.reduce((sum, cell) => sum + cell.length + 1, 0);
}

function buildChunks(header: string[], dataRows: string[][]): string[][][] {
  const chunks: string[][][] = [];
  let current: string[][] = [];
  let size = rowSize(header);

  for (const row of dataRows) {
    const size1 = rowSize(row);
    if (current.length > 0 && size + size1 > CHUNK_CHAR_LIMIT) {
      chunks.push(current);
      current = [];
      size = rowSize(header);
    }
    current.push(row);
    size += size1;
  }
  if (current.length > 0) chunks.push(current);
  return chunks;
}

/** Reads an NDJSON response body, calling onEvent for each line as it arrives.
 *  Aborts via `controller` if no new data arrives for `idleTimeoutMs`. */
async function readNdjson(
  res: Response,
  controller: AbortController,
  idleTimeoutMs: number,
  onEvent: (e: StreamEvent) => void
) {
  const reader = res.body?.getReader();
  if (!reader) throw new Error("No response stream.");
  const decoder = new TextDecoder();
  let buffer = "";

  let idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  const resetIdleTimer = () => {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => controller.abort(), idleTimeoutMs);
  };

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      resetIdleTimer();

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) onEvent(JSON.parse(line) as StreamEvent);
      }
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as StreamEvent);
  } finally {
    clearTimeout(idleTimer);
  }
}

/** Parses a CSV file, splits it into upload-sized chunks, and POSTs each chunk
 *  sequentially to `endpoint` as multipart form data under the "file" field,
 *  reading each response as an NDJSON progress stream. Calls `onProgress` live
 *  as each chunk's batches complete, and returns the combined result. */
export async function runChunkedCsvUpload(
  file: File,
  endpoint: string,
  onProgress: (p: UploadProgress) => void
): Promise<UploadResult> {
  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error("File has no data rows.");

  const header = rows[0];
  const dataRows = rows.slice(1);
  const chunks = buildChunks(header, dataRows);
  const rowsTotal = dataRows.length;

  const agg: UploadResult = {
    totalRows: 0,
    inserted: 0,
    skippedCount: 0,
    failedCount: 0,
    skipped: [],
    failed: [],
  };
  let rowOffset = 0;
  onProgress({ percent: 0, rowsDone: 0, rowsTotal, part: 1, parts: chunks.length, inserted: 0, skipped: 0, failed: 0 });

  for (let i = 0; i < chunks.length; i++) {
    const csvText = stringifyCsv([header, ...chunks[i]]);
    const fd = new FormData();
    fd.append("file", new Blob([csvText], { type: "text/csv" }), "chunk.csv");

    const controller = new AbortController();
    let chunkTotalRows = chunks[i].length;
    let chunkInserted = 0;
    let chunkFailedCount = 0;

    try {
      const res = await fetch(endpoint, { method: "POST", body: fd, signal: controller.signal });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error ?? `Upload failed (${res.status}).`);
      }

      await readNdjson(res, controller, CHUNK_TIMEOUT_MS, (ev) => {
        if (ev.event === "start") {
          chunkTotalRows = ev.totalRows;
          agg.totalRows += ev.totalRows;
          agg.skippedCount += ev.skippedCount;
          for (const r of ev.skipped) {
            if (agg.skipped.length < MAX_DISPLAYED) agg.skipped.push({ ...r, row: r.row + rowOffset });
          }
          onProgress({
            percent: Math.round(((rowOffset + ev.skippedCount) / rowsTotal) * 100),
            rowsDone: rowOffset + ev.skippedCount,
            rowsTotal,
            part: i + 1,
            parts: chunks.length,
            inserted: agg.inserted,
            skipped: agg.skippedCount,
            failed: agg.failedCount,
          });
        } else if (ev.event === "progress") {
          chunkInserted = ev.inserted;
          chunkFailedCount = ev.failedCount;
          for (const r of ev.failed) {
            if (agg.failed.length < MAX_DISPLAYED) agg.failed.push({ ...r, row: r.row + rowOffset });
          }
          onProgress({
            percent: Math.round(((rowOffset + ev.doneRows) / rowsTotal) * 100),
            rowsDone: rowOffset + ev.doneRows,
            rowsTotal,
            part: i + 1,
            parts: chunks.length,
            inserted: agg.inserted + chunkInserted,
            skipped: agg.skippedCount,
            failed: agg.failedCount + chunkFailedCount,
          });
        }
      });
    } catch (e) {
      const part = chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : "";
      throw new Error((e instanceof Error ? e.message : "Upload failed.") + part);
    }

    agg.inserted += chunkInserted;
    agg.failedCount += chunkFailedCount;
    rowOffset += chunkTotalRows;
  }

  return agg;
}
