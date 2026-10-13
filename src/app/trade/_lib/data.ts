import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Me } from "@/lib/b2b/types";

export type CustomerMe = Extract<Me, { state: "active" | "suspended" }>;

/** The signed-in shop's account context, fetched once per request (layout and page share it). */
export const getMe = cache(async (): Promise<Me | { state: "error"; message: string }> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("b2b_me");
  if (error || !data) return { state: "error", message: error?.message ?? "Could not load your account" };
  return data as Me;
});

/** For pages that need an approved (or suspended, read-only) wholesale account. */
export async function requireCustomer(): Promise<CustomerMe> {
  const me = await getMe();
  if (me.state === "signed_out") redirect("/trade/login");
  if (me.state !== "active" && me.state !== "suspended") redirect("/trade");
  return me;
}

export async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<{ data: T | null; error: string | null }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { data: null, error: error.message.replace(/^ERROR:\s*/, "") };
  return { data: data as T, error: null };
}

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Orders still moving through fulfilment. */
export function isOpenOrder(stage: string) {
  return !["delivered", "cancelled", "returned"].includes(stage);
}
