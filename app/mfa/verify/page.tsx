import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MfaVerify from "@/components/MfaVerify";

export const dynamic = "force-dynamic";

export default async function MfaVerifyPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: aal } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!aal || aal.nextLevel !== "aal2" || aal.currentLevel === aal.nextLevel) redirect("/");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  const factor = factors?.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/mfa/enroll");

  return (
    <div className="login-wrap">
      <div className="panel login-card mfa-card">
        <h1>Enter your code</h1>
        <p>Open your authenticator app and enter the current 6-digit code.</p>
        <MfaVerify factorId={factor.id} />
      </div>
    </div>
  );
}
