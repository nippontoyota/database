"use client";

import { useState } from "react";
import { parseCsv, stringifyCsv } from "@/lib/csv";

type RowIssue = { row: number; registration_no: string; reason: string };
type Result = {
  totalRows: number;
  inserted: number;
  skippedCount: number;
  failedCount: number;
  skipped: RowIssue[];
  failed: RowIssue[];
};

// Vercel's serverless functions reject request bodies past a platform-level size
// limit (a few MB) that no app config can raise. Large files are split into
// chunks under that limit and uploaded as separate sequential requests instead.
const CHUNK_CHAR_LIMIT = 3_000_000;
const MAX_DISPLAYED = 200;

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

function groupByReason(rows: RowIssue[]) {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(r.reason, (counts.get(r.reason) ?? 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]);
}

function IssueList({ title, count, rows }: { title: string; count: number; rows: RowIssue[] }) {
  if (count === 0) return null;
  const byReason = groupByReason(rows);

  return (
    <details className="issue-list">
      <summary>
        {title} ({count.toLocaleString("en-IN")})
      </summary>
      <ul className="issue-reasons">
        {byReason.map(([reason, c]) => (
          <li key={reason}>
            {c.toLocaleString("en-IN")} × {reason}
          </li>
        ))}
      </ul>
      <div className="issue-table-wrap">
        <table className="issue-table">
          <thead>
            <tr>
              <th>Row</th>
              <th>Registration No</th>
              <th>Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.row}>
                <td>{r.row}</td>
                <td>{r.registration_no}</td>
                <td>{r.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {count > rows.length && (
        <p className="hint">Showing the first {rows.length.toLocaleString("en-IN")} of {count.toLocaleString("en-IN")}.</p>
      )}
    </details>
  );
}

type Progress = { percent: number; rowsDone: number; rowsTotal: number; part: number; parts: number };

export default function UploadDataForm() {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return;
    setBusy(true);
    setError(null);
    setResult(null);

    const text = await file.text();
    const rows = parseCsv(text);
    if (rows.length < 2) {
      setError("File has no data rows.");
      setBusy(false);
      return;
    }
    const header = rows[0];
    const dataRows = rows.slice(1);
    const chunks = buildChunks(header, dataRows);
    const rowsTotal = dataRows.length;

    const agg: Result = {
      totalRows: 0,
      inserted: 0,
      skippedCount: 0,
      failedCount: 0,
      skipped: [],
      failed: [],
    };
    let rowOffset = 0;
    setProgress({ percent: 0, rowsDone: 0, rowsTotal, part: 1, parts: chunks.length });

    for (let i = 0; i < chunks.length; i++) {
      const csvText = stringifyCsv([header, ...chunks[i]]);
      const fd = new FormData();
      fd.append("file", new Blob([csvText], { type: "text/csv" }), "chunk.csv");

      const res = await fetch("/api/admin/upload", { method: "POST", body: fd });
      const body = await res.json().catch(() => null);

      if (!res.ok) {
        const part = chunks.length > 1 ? ` (part ${i + 1} of ${chunks.length})` : "";
        setError((body?.error ?? "Upload failed.") + part);
        setBusy(false);
        setProgress(null);
        return;
      }

      agg.totalRows += body.totalRows;
      agg.inserted += body.inserted;
      agg.skippedCount += body.skippedCount;
      agg.failedCount += body.failedCount;
      for (const r of body.skipped as RowIssue[]) {
        if (agg.skipped.length < MAX_DISPLAYED) agg.skipped.push({ ...r, row: r.row + rowOffset });
      }
      for (const r of body.failed as RowIssue[]) {
        if (agg.failed.length < MAX_DISPLAYED) agg.failed.push({ ...r, row: r.row + rowOffset });
      }

      rowOffset += chunks[i].length;
      setProgress({
        percent: Math.round((rowOffset / rowsTotal) * 100),
        rowsDone: rowOffset,
        rowsTotal,
        part: i + 1,
        parts: chunks.length,
      });
    }

    setResult(agg);
    setFile(null);
    setBusy(false);
    setProgress(null);
  }

  return (
    <form className="panel admin-form" onSubmit={onSubmit}>
      <h2>Upload data</h2>
      <p className="lead">
        CSV with header: registration_no, registration_date, reg_year, owner_name, owner_mobile,
        maker, model, rto_code, district, pincode, address.
      </p>

      <a className="link-btn" href="/sample-vehicles.csv" download>
        Download sample CSV
      </a>

      <label htmlFor="data-file">CSV file</label>
      <input
        id="data-file"
        type="file"
        accept=".csv,text/csv"
        required
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
      />

      <button className="btn" type="submit" disabled={busy || !file}>
        {busy ? "Uploading…" : "Upload"}
      </button>

      {progress && (
        <div className="upload-progress">
          <div className="upload-progress-bar">
            <div className="upload-progress-fill" style={{ width: `${progress.percent}%` }} />
          </div>
          <p className="hint">
            {progress.percent}% — {progress.rowsDone.toLocaleString("en-IN")} of{" "}
            {progress.rowsTotal.toLocaleString("en-IN")} rows
            {progress.parts > 1 && ` (part ${progress.part} of ${progress.parts})`}
          </p>
        </div>
      )}

      {error && (
        <div className="error" role="alert">
          {error}
        </div>
      )}

      {result && (
        <div className="success">
          <p>
            Inserted {result.inserted.toLocaleString("en-IN")} of{" "}
            {result.totalRows.toLocaleString("en-IN")} rows.
            {result.skippedCount > 0 && ` Skipped ${result.skippedCount.toLocaleString("en-IN")}.`}
            {result.failedCount > 0 && ` Failed ${result.failedCount.toLocaleString("en-IN")}.`}
          </p>

          <IssueList
            title="Skipped — missing required values, never attempted"
            count={result.skippedCount}
            rows={result.skipped}
          />
          <IssueList title="Failed — rejected by the database" count={result.failedCount} rows={result.failed} />
        </div>
      )}
    </form>
  );
}
