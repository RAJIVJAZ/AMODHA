import type { SupabaseClient } from "@supabase/supabase-js";

/** Monitoring settings shown in the notice (fallbacks are the defaults in the migration). */
export async function monitoringSettings(supabase: SupabaseClient) {
  const { data } = await supabase.rpc("setting_num", { p_key: "monitoring.retention_days", p_default: 365 });
  return { retentionDays: Number(data ?? 365) };
}
