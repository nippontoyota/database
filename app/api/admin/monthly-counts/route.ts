import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/supabase/admin";
import { sanitizeFilters, toRpcArgs } from "@/lib/filters";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !isAdminEmail(user.email)) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const filters = sanitizeFilters(await request.json().catch(() => ({})));
  const { data, error } = await supabase.rpc("monthly_counts", toRpcArgs(filters));

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ rows: data as { month: number; count: number }[] });
}
