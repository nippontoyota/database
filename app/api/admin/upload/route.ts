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
  const dataRows = rows.slice(1).filter((r) => r.some((cell) => cell.trim() !== ""));

  const records = dataRows.map((r) => {
    const get = (key: (typeof REQUIRED_COLUMNS)[number]) => r[colIndex[key]]?.trim() ?? "";
    return {
      registration_no: get("registration_no"),
      registration_date: get("registration_date"),
      reg_year: Number(get("reg_year")),
      owner_name: get("owner_name") || null,
      owner_mobile: get("owner_mobile") || null,
      maker: get("maker"),
      model: get("model") || null,
      rto_code: get("rto_code"),
      district: get("district") || null,
      pincode: get("pincode") || null,
      address: get("address") || null,
    };
  });

  const invalid = records.filter(
    (r) => !r.registration_no || !r.registration_date || !r.maker || !r.rto_code || !Number.isInteger(r.reg_year)
  );
  if (invalid.length) {
    return NextResponse.json(
      {
        error: `${invalid.length} row(s) are missing a required value (registration_no, registration_date, reg_year, maker, rto_code).`,
      },
      { status: 400 }
    );
  }

  const admin = createAdminClient();
  let inserted = 0;
  const errors: string[] = [];

  for (let i = 0; i < records.length; i += BATCH_SIZE) {
    const batch = records.slice(i, i + BATCH_SIZE);
    const { error, count } = await admin
      .from("vehicles")
      .insert(batch, { count: "exact" });

    if (error) {
      errors.push(`Rows ${i + 1}-${i + batch.length}: ${error.message}`);
    } else {
      inserted += count ?? batch.length;
    }
  }

  return NextResponse.json({
    totalRows: records.length,
    inserted,
    errors,
  });
}
