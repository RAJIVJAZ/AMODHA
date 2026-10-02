import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { supabaseUrl } from "./config";

/**
 * Server-only client with the secret key. It bypasses row-level security, so it is used
 * only in route handlers and server components, after the caller has been checked.
 * Returns null when SUPABASE_SECRET_KEY is not set, so the shop keeps working without it.
 */
export function createAdminClient() {
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) return null;
  return createSupabaseClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
