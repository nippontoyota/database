import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import Portal from "@/components/Portal";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  return <Portal email={user.email ?? ""} />;
}
