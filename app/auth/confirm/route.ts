import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type OtpType = "signup" | "invite" | "magiclink" | "recovery" | "email_change" | "email";

// POST-only and reached via the /accept-invite button, not a bare link — a GET
// here would let email/chat link-preview bots burn the single-use token before
// the person ever clicks it.
export async function POST(request: NextRequest) {
  const form = await request.formData();
  const token_hash = form.get("token_hash")?.toString();
  const type = form.get("type")?.toString() as OtpType | undefined;
  const next = form.get("next")?.toString() || "/";

  if (token_hash && type) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      const redirectTo = request.nextUrl.clone();
      redirectTo.pathname = next;
      redirectTo.search = "";
      return NextResponse.redirect(redirectTo, { status: 303 });
    }
  }

  const redirectTo = request.nextUrl.clone();
  redirectTo.pathname = "/login";
  redirectTo.search = "?error=" + encodeURIComponent("That link is invalid or has expired.");
  return NextResponse.redirect(redirectTo, { status: 303 });
}
