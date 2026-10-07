import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MfaEnroll from "@/components/MfaEnroll";

export const dynamic = "force-dynamic";

export default async function MfaEnrollPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: factors } = await supabase.auth.mfa.listFactors();
  if (factors?.totp.some((f) => f.status === "verified")) redirect("/");

  return (
    <div className="login-wrap">
      <div className="panel login-card mfa-card">
        <h1>Set up an authenticator app</h1>
        <p>
          Scan this with Google Authenticator, Authy, or similar. You&rsquo;ll need a code from it
          every time you sign in from now on.
        </p>
        <MfaEnroll />
      </div>
    </div>
  );
}
