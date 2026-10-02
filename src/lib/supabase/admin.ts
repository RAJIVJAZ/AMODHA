import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Server-only client with the secret key. It bypasses row-level security, so it is used
 * only in route handlers and server components, after the caller has been checked.
 * Returns null when neither SUPABASE_SECRET_KEY nor SUPABASE_SERVICE_ROLE_KEY is set, so the shop keeps working without it.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secretKey) return null;
  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
