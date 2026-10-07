import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import SetPasswordForm from "@/components/SetPasswordForm";

export const dynamic = "force-dynamic";

export default async function SetPasswordPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return (
    <div className="login-wrap">
      <div className="panel login-card">
        <h1>Set your password</h1>
        <p>Signed in as {user.email}. Choose a password to finish setting up your account.</p>
        <SetPasswordForm />
      </div>
    </div>
  );
}
