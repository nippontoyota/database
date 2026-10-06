import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// The dropdown values change only when you re-import data, so keep them in memory for a while.
let cache: { at: number; body: unknown } | null = null;
const TTL_MS = 10 * 60 * 1000;

export async function GET() {
  if (cache && Date.now() - cache.at < TTL_MS) {
    return NextResponse.json(cache.body);
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("get_filter_options");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  cache = { at: Date.now(), body: data };
  return NextResponse.json(data);
}
