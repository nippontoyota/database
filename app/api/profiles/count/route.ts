import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sanitizeProfileFilters, toProfileRpcArgs } from "@/lib/profileFilters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const filters = sanitizeProfileFilters(await request.json().catch(() => ({})));
  const supabase = await createClient();

  const { data, error } = await supabase.rpc("count_profiles", toProfileRpcArgs(filters));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ count: Number(data) });
}
