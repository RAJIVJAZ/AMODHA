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

/** Owner, or a staff member allowed to see sales or dispatch in the business app (checked by the database). */
export async function canViewAllInvoices() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;
  if (await getStaffClient()) return true;
  const [{ data: sales }, { data: dispatch }] = await Promise.all([
    supabase.rpc("has_permission", { p_module: "sales", p_action: "view" }),
    supabase.rpc("has_permission", { p_module: "dispatch", p_action: "view" }),
  ]);
  return sales === true || dispatch === true;
}
