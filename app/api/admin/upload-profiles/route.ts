import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminEmail } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const COLUMNS = [
  "rto_no",
  "district",
  "firm_name",
  "contact_person",
  "mobile",
  "email",
  "address",
  "city",
  "pincode",
  "profile",
  "state_orig",
  "phone2",
] as const;

const REQUIRED_COLUMNS = ["rto_no", "firm_name"] as const;
const BATCH_SIZE = 200;
const MAX_DETAILS = 200;

type Row = { row: number; label: string; reason: string };

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file uploaded." }, { status: 400 });
  }

  const text = await file.text();
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return NextResponse.json({ error: "File has no data rows." }, { status: 400 });
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const missing = REQUIRED_COLUMNS.filter((c) => !header.includes(c));
  if (missing.length) {
    return NextResponse.json(
      { error: `Missing column(s): ${missing.join(", ")}. Header must include: ${COLUMNS.join(", ")}` },
      { status: 400 }
    );
  }

  const colIndex = Object.fromEntries(COLUMNS.map((c) => [c, header.indexOf(c)]));
  const dataRows = rows.slice(1);

  const skipped: Row[] = [];
  const toInsert: { rowNum: number; record: Record<string, unknown> }[] = [];

  dataRows.forEach((r, i) => {
    const rowNum = i + 2;
    const get = (key: (typeof COLUMNS)[number]) => {
      const idx = colIndex[key];
      return idx === -1 ? "" : r[idx]?.trim() ?? "";
    };

    if (r.every((cell) => cell.trim() === "")) {
      return; // fully blank line — ignored, not counted as skipped
    }

    const rtoNo = get("rto_no");
    const firmName = get("firm_name");

    const missingFields: string[] = [];
    if (!rtoNo) missingFields.push("rto_no");
    if (!firmName) missingFields.push("firm_name");

    if (missingFields.length) {
      skipped.push({
        row: rowNum,
        label: firmName || rtoNo || "(blank)",
        reason: `Missing ${missingFields.join(", ")}`,
      });
      return;
    }

    const record: Record<string, unknown> = {};
    for (const c of COLUMNS) {
      record[c] = get(c) || null;
    }

    toInsert.push({ rowNum, record });
  });

  const admin = createAdminClient();
  const encoder = new TextEncoder();
  const totalRows = dataRows.length;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (obj: unknown) => controller.enqueue(encoder.encode(JSON.stringify(obj) + "\n"));

      send({
        event: "start",
        totalRows,
        skippedCount: skipped.length,
        skipped: skipped.slice(0, MAX_DETAILS),
      });

      let inserted = 0;
      let failedCount = 0;
      let doneInsertRows = 0;

      for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
        const batch = toInsert.slice(i, i + BATCH_SIZE);
        const batchFailed: Row[] = [];
        let batchInserted = 0;

        const { error } = await admin.from("rto_profiles").insert(batch.map((b) => b.record));

        if (!error) {
          batchInserted = batch.length;
        } else {
          // Something in this batch errored — fall back to one-by-one for just this
          // batch (at most BATCH_SIZE rows) to pin down which row and why.
          for (const b of batch) {
            const { error: rowError } = await admin.from("rto_profiles").insert(b.record);
            if (rowError) {
              batchFailed.push({
                row: b.rowNum,
                label: String(b.record.firm_name ?? b.record.rto_no ?? ""),
                reason: rowError.message,
              });
            } else {
              batchInserted += 1;
            }
          }
        }

        inserted += batchInserted;
        failedCount += batchFailed.length;
        doneInsertRows += batch.length;

        send({
          event: "progress",
          inserted,
          failedCount,
          failed: batchFailed,
          doneRows: skipped.length + doneInsertRows,
          totalRows,
        });
      }

      send({ event: "done" });
      controller.close();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson", "Cache-Control": "no-store" },
  });
}
