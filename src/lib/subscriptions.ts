import { createAdminClient } from "@/lib/supabase/admin";

/** Whether customers can start a milk subscription in the app (Settings → "Milk subscriptions open to customers"). */
export async function subscriptionsOpen() {
  const admin = createAdminClient();
  if (!admin) return false;
  const { data, error } = await admin.from("business_settings").select("value").eq("key", "subscriptions.enabled").maybeSingle();
  return !error && data?.value === true;
}
