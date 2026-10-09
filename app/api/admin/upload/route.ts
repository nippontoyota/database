import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient, isAdminEmail } from "@/lib/supabase/admin";
import { parseCsv } from "@/lib/csv";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const REQUIRED_COLUMNS = [
  "registration_no",
  "registration_date",
  "reg_year",
  "owner_name",
  "owner_mobile",
  "maker",
  "model",
  "rto_code",
  "district",
  "pincode",
  "address",
] as const;

const BATCH_SIZE = 200; // small enough that progress updates feel live
const MAX_DETAILS = 200; // cap how many skipped/failed rows we report individually

type Row = { row: number; registration_no: string; reason: string };

/** Accepts YYYY-MM-DD (passes through) or DD-MM-YYYY / DD/MM/YYYY (converted). Returns null if unparseable. */
function normalizeDate(raw: string): string | null {
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return raw;

  const dmy = raw.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    const year = Number(dmy[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  return null;
}

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
      { error: `Missing column(s): ${missing.join(", ")}. Header must be: ${REQUIRED_COLUMNS.join(", ")}` },
      { status: 400 }
    );
  }

  const colIndex = Object.fromEntries(REQUIRED_COLUMNS.map((c) => [c, header.indexOf(c)]));
  const dataRows = rows.slice(1);

  // --- Validate every row up front; rows missing a required value never get an insert attempt. ---
  const skipped: Row[] = [];
  const toInsert: { rowNum: number; record: Record<string, unknown> }[] = [];
  const seenInFile = new Map<string, number>(); // registration_no -> first row it appeared at

  dataRows.forEach((r, i) => {
    const rowNum = i + 2; // +1 for 0-index, +1 for the header row
    const get = (key: (typeof REQUIRED_COLUMNS)[number]) => r[colIndex[key]]?.trim() ?? "";

    if (r.every((cell) => cell.trim() === "")) {
      return; // fully blank line — not counted as skipped, just ignored
    }

    const registration_no = get("registration_no");
    const registration_date_raw = get("registration_date");
    const reg_year = get("reg_year");
    const maker = get("maker");
    const rto_code = get("rto_code");

    const missingFields: string[] = [];
    if (!registration_no) missingFields.push("registration_no");
    if (!registration_date_raw) missingFields.push("registration_date");
    if (!Number.isInteger(Number(reg_year)) || reg_year === "") missingFields.push("reg_year");
    if (!maker) missingFields.push("maker");
    if (!rto_code) missingFields.push("rto_code");

    if (missingFields.length) {
      skipped.push({
        row: rowNum,
        registration_no: registration_no || "(blank)",
        reason: `Missing ${missingFields.join(", ")}`,
      });
      return;
    }

    const registration_date = normalizeDate(registration_date_raw);
    if (!registration_date) {
      skipped.push({
        row: rowNum,
        registration_no,
        reason: `Unparseable registration_date "${registration_date_raw}" (expected YYYY-MM-DD or DD-MM-YYYY)`,
      });
      return;
    }

    const firstRow = seenInFile.get(registration_no);
    if (firstRow !== undefined) {
      skipped.push({
        row: rowNum,
        registration_no,
        reason: `Duplicate registration_no within this file (first seen at row ${firstRow})`,
      });
      return;
    }
    seenInFile.set(registration_no, rowNum);

    toInsert.push({
      rowNum,
      record: {
        registration_no,
        registration_date,
        reg_year: Number(reg_year),
        owner_name: get("owner_name") || null,
        owner_mobile: get("owner_mobile") || null,
        maker,
        model: get("model") || null,
        rto_code,
        district: get("district") || null,
        pincode: get("pincode") || null,
        address: get("address") || null,
      },
    });
  });

  function reasonFor(error: { code?: string; message: string }): string {
    if (error.code === "23505") return "Duplicate registration_no (already in the database)";
    if (error.code === "22007" || error.code === "22008") return "Invalid date in registration_date";
    if (error.code === "22P02") return "Invalid value for a numeric field (reg_year)";
    return error.message;
  }

  // --- Stream one NDJSON line per small batch, so the client can show live progress
  // instead of waiting for the whole file to finish. Batches use upsert(ignoreDuplicates),
  // which absorbs registration_no conflicts with existing DB rows in the same round-trip
  // instead of a per-row retry loop — a file with many duplicates previously meant
  // thousands of sequential single-row inserts, slow enough to hang past the function's
  // execution limit. ---
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

        const { data, error } = await admin
          .from("vehicles")
          .upsert(
            batch.map((b) => b.record),
            { onConflict: "registration_no", ignoreDuplicates: true }
          )
          .select("registration_no");

        if (!error) {
          const insertedNos = new Set((data ?? []).map((r) => r.registration_no as string));
          batchInserted = insertedNos.size;
          for (const b of batch) {
            if (!insertedNos.has(String(b.record.registration_no))) {
              batchFailed.push({
                row: b.rowNum,
                registration_no: String(b.record.registration_no),
                reason: "Duplicate registration_no (already in the database)",
              });
            }
          }
        } else {
          // The batch itself errored for a reason other than a duplicate key — fall back
          // to one-by-one for just this batch (at most BATCH_SIZE rows) to pin the cause.
          for (const b of batch) {
            const { error: rowError } = await admin.from("vehicles").insert(b.record);
            if (rowError) {
              batchFailed.push({
                row: b.rowNum,
                registration_no: String(b.record.registration_no),
                reason: reasonFor(rowError),
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
          failed: batchFailed, // this batch's failures only; client appends up to its own cap
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
