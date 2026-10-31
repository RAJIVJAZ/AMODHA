import { cache } from "react";
import { redirect } from "next/navigation";
import { bootstrap } from "@/lib/ops/context";
import { createClient } from "@/lib/supabase/server";

export type Salesperson = {
  id: string;
  full_name: string;
  employee_code: string;
  territories: string[];
  can_view_outstanding: boolean;
  can_view_credit: boolean;
  is_active: boolean;
};

/** The signed-in person, and their salesperson record if they have one. */
export const getSales = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  // Same staff session rules as the Ops app (inactivity timeout, revocation); never revives an ended one.
  // The salesperson record is read at the same time as the session check, to save a round trip.
  const [{ session, perms }, { data: sp }] = await Promise.all([
    bootstrap(supabase, user.id, "sales"),
    supabase
      .from("salespeople")
      .select("id, full_name, employee_code, territories, can_view_outstanding, can_view_credit, is_active")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  if (session.state === "ended") redirect(`/auth/session-ended?reason=${encodeURIComponent(session.reason ?? "expired")}&next=/sales`);
  const canUse = perms.some((p) => p.module === "field_sales" && p.action === "view");
  return { supabase, user, session, salesperson: canUse && sp?.is_active ? (sp as Salesperson) : null };
});

/** For Sales app pages: a signed-in, active salesperson. */
export async function requireSales() {
  const s = await getSales();
  if (!s) redirect("/sales/login");
  if (!s.salesperson) redirect("/sales/not-set-up");
  return { ...s, salesperson: s.salesperson };
}

/** Calls a read function and returns its data, or throws a readable error for the page. */
export async function rpc<T>(supabase: Awaited<ReturnType<typeof createClient>>, fn: string, args: Record<string, unknown> = {}) {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
