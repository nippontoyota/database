import { createClient } from "@/lib/supabase/server";
import { sanitizeFilters, toRpcArgs } from "@/lib/filters";

export const dynamic = "force-dynamic";
export const maxDuration = 300; // seconds; the full 299k-row file streams in well under this

const PAGE_SIZE = Math.max(100, Number(process.env.EXPORT_PAGE_SIZE) || 1000);

const COLUMNS: { key: string; header: string }[] = [
  { key: "registration_no", header: "Registration No" },
  { key: "registration_date", header: "Registration Date" },
  { key: "reg_year", header: "Year" },
  { key: "owner_name", header: "Owner Name" },
  { key: "owner_mobile", header: "Owner Mobile" },
  { key: "maker", header: "Maker" },
  { key: "model", header: "Model" },
  { key: "rto_code", header: "RTO" },
  { key: "district", header: "District" },
  { key: "pincode", header: "PIN Code" },
  { key: "address", header: "Address" },
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function POST(request: Request) {
  // The page submits a plain HTML form so the browser handles the download natively
  // (no memory limits, real progress bar, no URL-length limit on the filters).
  const form = await request.formData();
  let rawFilters: unknown = {};
  try {
    rawFilters = JSON.parse(String(form.get("filters") ?? "{}"));
  } catch {
    return new Response("Invalid filters.", { status: 400 });
  }
  const args = toRpcArgs(sanitizeFilters(rawFilters));

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new Response("Please sign in.", { status: 401 });

  const encoder = new TextEncoder();
  let afterId = 0;
  let headerSent = false;

  const stream = new ReadableStream<Uint8Array>({
    async pull(controller) {
      if (!headerSent) {
        headerSent = true;
        // BOM so Excel opens the file as UTF-8.
        controller.enqueue(
          encoder.encode("﻿" + COLUMNS.map((c) => c.header).join(",") + "\r\n")
        );
        return;
      }

      const { data, error } = await supabase.rpc("search_vehicles", {
        ...args,
        p_after: afterId,
        p_limit: PAGE_SIZE,
      });

      if (error) {
        controller.error(new Error(error.message));
        return;
      }
      if (!data || data.length === 0) {
        controller.close();
        return;
      }

      let chunk = "";
      for (const row of data as Record<string, unknown>[]) {
        chunk += COLUMNS.map((c) => csvCell(row[c.key])).join(",") + "\r\n";
      }
      afterId = Number((data as { id: number }[])[data.length - 1].id);
      controller.enqueue(encoder.encode(chunk));
    },
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(stream, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="vehicle-registrations-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
