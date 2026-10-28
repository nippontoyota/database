import { createClient } from "@/lib/supabase/server";
import { sanitizeProfileFilters, toProfileRpcArgs } from "@/lib/profileFilters";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PAGE_SIZE = Math.max(100, Number(process.env.EXPORT_PAGE_SIZE) || 1000);

const COLUMNS: { key: string; header: string }[] = [
  { key: "rto_no", header: "RTO No." },
  { key: "district", header: "District" },
  { key: "firm_name", header: "Firm Name" },
  { key: "contact_person", header: "Contact Person" },
  { key: "mobile", header: "Mobile" },
  { key: "email", header: "Email" },
  { key: "address", header: "Address" },
  { key: "city", header: "City" },
  { key: "pincode", header: "Pincode" },
  { key: "profile", header: "Profile" },
  { key: "state_orig", header: "State (orig)" },
  { key: "phone2", header: "Phone 2" },
];

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function POST(request: Request) {
  const form = await request.formData();
  let rawFilters: unknown = {};
  try {
    rawFilters = JSON.parse(String(form.get("filters") ?? "{}"));
  } catch {
    return new Response("Invalid filters.", { status: 400 });
  }
  const args = toProfileRpcArgs(sanitizeProfileFilters(rawFilters));

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
        controller.enqueue(
          encoder.encode("﻿" + COLUMNS.map((c) => c.header).join(",") + "\r\n")
        );
        return;
      }

      const { data, error } = await supabase.rpc("search_profiles", {
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
      "Content-Disposition": `attachment; filename="profile-database-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
