import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type OpsModule =
  | "dashboard"
  | "users"
  | "settings"
  | "catalog"
  | "inventory"
  | "procurement"
  | "production"
  | "quality"
  | "dispatch"
  | "subscriptions"
  | "purchases"
  | "sales"
  | "expenses"
  | "payroll"
  | "banking"
  | "reports"
  | "audit";
export type OpsAction = "view" | "create" | "edit" | "approve" | "export" | "delete";

/**
 * The signed-in staff member, their Supabase client (row-level security applies) and their permissions.
 * Permissions here only shape the screens; every read and write is checked again by the database.
 */
export const getOps = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [{ data: perms }, { data: profile }] = await Promise.all([
    supabase.rpc("my_permissions"),
    supabase.from("profiles").select("full_name, email, is_admin, ops_active, job_title").eq("id", user.id).maybeSingle(),
  ]);
  const granted = new Set(((perms ?? []) as { module: string; action: string }[]).map((p) => `${p.module}.${p.action}`));
  return {
    supabase,
    user,
    profile: profile as { full_name: string | null; email: string | null; is_admin: boolean; ops_active: boolean; job_title: string | null } | null,
    granted,
    can: (module: OpsModule, action: OpsAction = "view") => granted.has(`${module}.${action}`),
  };
});

export type Ops = NonNullable<Awaited<ReturnType<typeof getOps>>>;

/** For pages: sign-in and the given permission are required. */
export async function requireOps(module?: OpsModule, action: OpsAction = "view"): Promise<Ops> {
  const ops = await getOps();
  if (!ops) redirect("/login?next=/ops");
  if (ops.granted.size === 0) redirect("/ops/no-access");
  if (module && !ops.can(module, action)) redirect(`/ops?denied=${module}`);
  return ops;
}
