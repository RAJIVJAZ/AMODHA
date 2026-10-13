"use server";

import { refresh } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type B2BResult<T = unknown> = { ok: true; data: T } | { ok: false; message: string };

// Database functions the Sales and Wholesale apps call from interactive screens. Each one checks
// the caller itself (customer, assigned salesperson or staff permission); this list only keeps the
// apps from calling anything else.
const ALLOWED = new Set([
  "b2b_quote", "b2b_place_order", "b2b_reorder_lines", "b2b_confirm_order", "b2b_cancel_order", "b2b_amend_order",
  "b2b_find_matches", "b2b_create_customer", "b2b_register", "b2b_update_customer", "b2b_log_activity", "b2b_record_consent",
  "b2b_save_draft", "b2b_get_draft", "b2b_mark_notifications_read", "b2b_catalogue", "fs_request_price",
]);

function friendly(message: string) {
  if (/invalid input syntax for type uuid/.test(message)) return "Please choose an option from the list";
  if (/invalid input syntax for type (numeric|integer)/.test(message)) return "Please enter numbers only";
  if (/invalid input syntax for type date/.test(message)) return "Please enter a valid date";
  return message.replace(/^ERROR:\s*/, "");
}

/** Calls one B2B database function as the signed-in person. */
export async function b2bCall<T = unknown>(fn: string, args: Record<string, unknown> = {}, options: { refresh?: boolean } = {}): Promise<B2BResult<T>> {
  if (!ALLOWED.has(fn)) return { ok: false, message: "That action is not available" };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session has ended. Please sign in again." };
  const { data, error } = await supabase.rpc(fn, args);
  if (error) {
    await supabase.rpc("staff_log_failure", { p_action: fn, p_message: error.message, p_path: null });
    return { ok: false, message: friendly(error.message) };
  }
  if (options.refresh) refresh();
  return { ok: true, data: data as T };
}
