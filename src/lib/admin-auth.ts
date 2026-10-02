import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/** Returns the secret-key client only when the signed-in user is marked as staff (profiles.is_admin). */
export async function getStaffClient() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const admin = createAdminClient();
  if (!user || !admin) return null;

  const { data: profile } = await admin.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
  return profile?.is_admin ? admin : null;
}
