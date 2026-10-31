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
  | "audit"
  | "b2b_customers"
  | "field_sales"
  | "pricing"
  | "sales_team"
  | "marketing"
  | "staff_monitoring"
  | "compliance"
  | "equipment";
export type StaffSession = {
  state: "active" | "ended" | "not_staff" | "signed_out";
  reason?: string;
  session_ref?: string;
  timeout_seconds?: number;
  warning_seconds?: number;
  policy_version?: string;
  acknowledged?: boolean;
};

export type OpsAction = "view" | "create" | "edit" | "approve" | "export" | "delete";

type Profile = { full_name: string | null; email: string | null; is_admin: boolean; ops_active: boolean; job_title: string | null };
type Perm = { module: string; action: string };

/**
 * Session start, permissions and profile in one round trip (ops_bootstrap). Until the database has that
 * function, falls back to the three separate calls, so the app works either way.
 */
export async function bootstrap(supabase: Awaited<ReturnType<typeof createClient>>, userId: string, portal: "ops" | "sales") {
  const { data, error } = await supabase.rpc("ops_bootstrap", { p_portal: portal });
  if (!error && data) {
    const d = data as { session: StaffSession | null; permissions: Perm[] | null; profile: Profile | null };
    return { session: d.session ?? ({ state: "not_staff" } as StaffSession), perms: d.permissions ?? [], profile: d.profile };
  }
  const { data: started } = await supabase.rpc("staff_session_start", { p_portal: portal });
  const session = (started ?? { state: "not_staff" }) as StaffSession;
  if (session.state === "ended") return { session, perms: [] as Perm[], profile: null };
  const [{ data: perms }, { data: profile }] = await Promise.all([
    supabase.rpc("my_permissions"),
    supabase.from("profiles").select("full_name, email, is_admin, ops_active, job_title").eq("id", userId).maybeSingle(),
  ]);
  return { session, perms: (perms ?? []) as Perm[], profile: profile as Profile | null };
}

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

  // Start (or check) this sign-in's staff session before anything else: an ended session — inactivity,
  // revocation, account switched off — is signed out here and never revived. Not counted as interaction.
  const { session, perms, profile } = await bootstrap(supabase, user.id, "ops");
  if (session.state === "ended") redirect(`/auth/session-ended?reason=${encodeURIComponent(session.reason ?? "expired")}`);
  const granted = new Set(perms.map((p) => `${p.module}.${p.action}`));
  return {
    supabase,
    user,
    profile,
    granted,
    session,
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
