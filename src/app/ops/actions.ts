"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OpsActionState = { ok: boolean; message: string; data?: unknown; at: number; okAt?: number } | null;

// Database functions the business app may call. Each one checks the caller's permission itself
// (and the signed-in user could already call them through the API); this list just keeps the
// app from calling anything else.
const ALLOWED = new Set([
  // users & settings
  "ops_update_setting", "ops_set_user_roles", "ops_invite_staff", "ops_set_user_active", "ops_reset_user_sessions",
  "ops_set_role_permissions", "ops_create_role",
  // catalogue
  "cat_save_supplier", "cat_save_product", "cat_save_item", "cat_save_packaging_config", "cat_save_recipe_draft", "cat_activate_recipe",
  "cat_save_quality_parameter", "cat_set_item_price",
  // inventory & procurement
  "inv_receive_opening_stock", "inv_adjust_stock", "inv_set_lot_status", "inv_reverse_movement",
  "proc_record_collection", "proc_cancel_collection",
  // manufacturing
  "prod_create_batch", "prod_issue_material", "prod_return_material", "prod_start_batch", "prod_complete_batch", "prod_correct_output",
  "prod_record_qc", "prod_record_packaging", "prod_reverse_packaging", "prod_complete_packaging", "prod_release_batch", "prod_cancel_batch",
  "prod_close_batch",
  // dispatch & subscriptions (staff)
  "disp_allocate_order", "disp_release_allocation", "disp_set_stage", "disp_hold_order", "disp_dispatch_order", "disp_update_delivery",
  "disp_create_staff_order", "sub_lock_day", "sub_record_bottles",
  // finance
  "fin_post_purchase_invoice", "fin_cancel_purchase_invoice", "fin_supplier_return", "fin_pay_supplier", "fin_receive_customer_payment",
  "fin_credit_note", "fin_record_expense", "fin_decide_expense", "pay_save_employee", "pay_record_advance", "pay_create_run",
  "pay_update_line", "pay_approve_run", "pay_mark_paid", "fin_transfer", "fin_reconcile", "fin_cash_count", "fin_manual_journal",
  "fin_reverse_entry", "fin_retry_postings",
  // customer subscription actions
  "sub_create", "sub_skip", "sub_unskip", "sub_set_extra", "sub_set_addons", "sub_pause", "sub_resume", "sub_cancel",
  "sub_change_quantity", "sub_change_address",
]);

class InputError extends Error {}

/**
 * Turns form fields into function arguments. Field names are "p_name#type"; type is one of
 * text (default), num, int, date, ist (date-time in India time), json, bool, uuid, list (comma-separated text) or intlist.
 * Empty fields are left out so the function's own default applies.
 */
function argsFrom(formData: FormData) {
  const args: Record<string, unknown> = {};
  for (const key of new Set(formData.keys())) {
    if (!(key.startsWith("p_") || key === "p" || key.startsWith("p#"))) continue;
    const [name, type = "text"] = key.split("#");
    const values = formData.getAll(key).map((v) => String(v));
    if (type === "bool") {
      args[name] = values.includes("true") || values.includes("on");
      continue;
    }
    // Lists may come from several checkboxes with the same name.
    const raw = (type === "list" || type === "intlist" ? values.join(",") : (values[values.length - 1] ?? "")).trim();
    if (raw === "") {
      // An empty list (all boxes unticked) is still an answer.
      if (type === "list" || type === "intlist") args[name] = [];
      continue;
    }
    switch (type) {
      case "num": {
        const n = Number(raw.replace(/,/g, ""));
        if (!Number.isFinite(n)) throw new InputError(`Enter a number for ${name.slice(2).replace(/_/g, " ")}`);
        args[name] = n;
        break;
      }
      case "int": {
        const n = Number(raw);
        if (!Number.isInteger(n)) throw new InputError(`Enter a whole number for ${name.slice(2).replace(/_/g, " ")}`);
        args[name] = n;
        break;
      }
      case "json":
        try {
          args[name] = JSON.parse(raw);
        } catch {
          throw new InputError("Some of the rows could not be read; please check them");
        }
        break;
      case "list":
        args[name] = raw.split(",").map((s) => s.trim()).filter(Boolean);
        break;
      case "intlist":
        args[name] = raw.split(",").map((s) => Number(s.trim())).filter((n) => Number.isInteger(n));
        break;
      case "ist":
        // A local date-time from a datetime-local field, in India time.
        if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(raw)) throw new InputError("Enter a valid date and time");
        args[name] = `${raw}:00+05:30`;
        break;
      case "date":
        if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new InputError("Enter a valid date");
        args[name] = raw;
        break;
      default:
        args[name] = raw;
    }
  }
  return args;
}

function friendly(message: string) {
  if (/violates check constraint "stock_lots_(not_negative|reservation)"/.test(message)) return "Not enough stock for that";
  if (/duplicate key value/.test(message)) return "That already exists";
  if (/invalid input syntax for type uuid/.test(message)) return "Please choose an option from the list";
  return message.replace(/^ERROR:\s*/, "");
}

export async function opsAction(prev: OpsActionState, formData: FormData): Promise<OpsActionState> {
  const okAt = prev?.okAt;
  const fn = String(formData.get("_fn") ?? "");
  if (!ALLOWED.has(fn)) return { ok: false, message: "That action is not available", at: Date.now(), okAt };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, message: "Your session has ended. Please sign in again.", at: Date.now(), okAt };

  let args: Record<string, unknown>;
  try {
    args = argsFrom(formData);
  } catch (error) {
    return { ok: false, message: error instanceof InputError ? error.message : "Please check the form", at: Date.now(), okAt };
  }

  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: friendly(error.message), at: Date.now(), okAt };

  const go = String(formData.get("_redirect") ?? "");
  if (go && /^\/(ops|account)(\/|$|\?)/.test(go)) {
    redirect(go.replace("{id}", encodeURIComponent(String(data ?? ""))));
  }
  refresh();
  const at = Date.now();
  return { ok: true, message: String(formData.get("_success") ?? "Saved"), data, at, okAt: at };
}
