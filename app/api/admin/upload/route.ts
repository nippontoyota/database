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

const BATCH_SIZE = 500;
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

  // --- Insert in batches; on a batch failure, retry row-by-row to pin down which rows failed and why. ---
  const admin = createAdminClient();
  let inserted = 0;
  const failed: Row[] = [];

  function reasonFor(error: { code?: string; message: string }): string {
    if (error.code === "23505") return "Duplicate registration_no (already in the database or repeated in this file)";
    if (error.code === "22007" || error.code === "22008") return "Invalid date in registration_date";
    if (error.code === "22P02") return "Invalid value for a numeric field (reg_year)";
    return error.message;
  }

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from("vehicles")
      .insert(batch.map((b) => b.record), { count: "exact" });

    if (!error) {
      inserted += count ?? batch.length;
      continue;
    }

    // Something in this batch failed — fall back to one-by-one so we can report the exact row(s).
    for (const b of batch) {
      const { error: rowError } = await admin.from("vehicles").insert(b.record);
      if (rowError) {
        failed.push({
          row: b.rowNum,
          registration_no: String(b.record.registration_no),
          reason: reasonFor(rowError),
        });
      } else {
        inserted += 1;
      }
    }
  }

  return NextResponse.json({
    totalRows: dataRows.length,
    inserted,
    skippedCount: skipped.length,
    failedCount: failed.length,
    skipped: skipped.slice(0, MAX_DETAILS),
    failed: failed.slice(0, MAX_DETAILS),
    truncated: skipped.length > MAX_DETAILS || failed.length > MAX_DETAILS,
  });
}
