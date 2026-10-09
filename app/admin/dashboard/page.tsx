import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/supabase/admin";
import DashboardClient from "@/components/DashboardClient";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");
  if (!isAdminEmail(user.email)) redirect("/");

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <span className="brand">Registration Data Portal — Admin</span>
          <div className="who">
            <span>{user.email}</span>
            <a className="link-btn" href="/admin">
              Admin home
            </a>
            <a className="link-btn" href="/">
              Back to portal
            </a>
            <form action="/auth/signout" method="post">
              <button className="link-btn" type="submit">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>

      <main className="page">
        <DashboardClient />
      </main>
    </>
  );
}
