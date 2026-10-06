import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeFilters, toRpcArgs } from "@/lib/filters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const filters = sanitizeFilters(await request.json().catch(() => ({})));
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("count_vehicles", toRpcArgs(filters));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ count: Number(data) });
}
