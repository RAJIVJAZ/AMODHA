import { OpsForm } from "@/components/ops/ops-form";
import { PermissionMatrix } from "@/components/ops/permission-matrix";
import { Badge, Card, Empty, Grid, Input, Notice, PageHeader, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, param } from "@/lib/ops/format";

export const metadata = { title: "Users & roles" };

type Staff = { user_id: string; email: string | null; full_name: string | null; job_title: string | null; is_owner: boolean; active: boolean; roles: string[]; last_sign_in_at: string | null; active_sessions: number };
type Role = { key: string; label: string; description: string | null; is_system: boolean };
type Invite = { email: string; role_keys: string[]; invited_at: string; accepted_at: string | null };

function RoleBoxes({ roles, selected }: { roles: Role[]; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      <input type="hidden" name="p_role_keys#list" value="" />
      {roles.map((r) => (
        <label key={r.key} className="flex items-center gap-1.5 text-sm">
          <input type="checkbox" name="p_role_keys#list" value={r.key} defaultChecked={selected.includes(r.key)} className="h-4 w-4 accent-ink" />
          {r.label}
        </label>
      ))}
    </div>
  );
}

export default async function UsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("users");
  const tab = param((await searchParams).tab) ?? "staff";

  const [{ data: staffData }, { data: roleData }, { data: inviteData }, { data: modData }, { data: actData }, { data: permData }] = await Promise.all([
    ops.supabase.rpc("ops_staff_directory"),
    ops.supabase.from("ops_roles").select("key, label, description, is_system").order("is_system", { ascending: false }).order("label"),
    ops.supabase.from("ops_staff_invites").select("email, role_keys, invited_at, accepted_at").is("accepted_at", null).order("invited_at", { ascending: false }),
    ops.supabase.from("ops_modules").select("key, label").order("sort_order"),
    ops.supabase.from("ops_actions").select("key, label").order("sort_order"),
    tab === "roles" ? ops.supabase.from("ops_role_permissions").select("role_key, module, action") : Promise.resolve({ data: [] }),
  ]);
  const staff = (staffData ?? []) as Staff[];
  const roles = (roleData ?? []) as Role[];
  const invites = (inviteData ?? []) as Invite[];
  const roleLabel = new Map(roles.map((r) => [r.key, r.label]));
  const perms = (permData ?? []) as { role_key: string; module: string; action: string }[];
  const canEdit = ops.can("users", "edit");

  return (
    <>
      <PageHeader title="Users & roles" description="Who can use the business app and what each role may do. Every change is recorded in the audit log." />
      <Tabs
        current={tab}
        items={[
          { key: "staff", label: `Staff (${staff.length})`, href: "/ops/admin/users" },
          { key: "invite", label: `Add staff${invites.length ? ` (${invites.length} pending)` : ""}`, href: "/ops/admin/users?tab=invite" },
          { key: "roles", label: "Roles & permissions", href: "/ops/admin/users?tab=roles" },
        ]}
      />

      {tab === "staff" ? (
        <Card>
          {staff.length ? (
            <div className="flex flex-col divide-y divide-ink/10">
              {staff.map((s) => (
                <div key={s.user_id} className="flex flex-col gap-2 py-3">
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <div>
                      <p className="font-semibold text-ink">
                        {s.full_name || s.email} {s.is_owner ? <Badge tone="info">owner</Badge> : null} {!s.active ? <Badge tone="bad">switched off</Badge> : null}
                      </p>
                      <p className="text-xs text-dark/60">
                        {s.email}
                        {s.job_title ? ` · ${s.job_title}` : ""} · last sign-in {dateTime(s.last_sign_in_at)} · {s.active_sessions} active session(s)
                      </p>
                      <p className="mt-1 flex flex-wrap gap-1">
                        {s.roles.length ? s.roles.map((r) => <Badge key={r}>{roleLabel.get(r) ?? r}</Badge>) : <span className="text-xs text-dark/55">no roles</span>}
                      </p>
                    </div>
                  </div>
                  {canEdit && s.user_id !== ops.user.id ? (
                    <details className="rounded-xl bg-ink/[0.03] p-3">
                      <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Change access</summary>
                      <div className="mt-3 flex flex-col gap-4">
                        <OpsForm fn="ops_set_user_roles" submitLabel="Save roles" variant="secondary" success="Roles updated" resetOnSuccess={false}>
                          <input type="hidden" name="p_user_id" value={s.user_id} />
                          <RoleBoxes roles={roles} selected={s.roles} />
                          <Input label="Reason" name="p_reason" />
                        </OpsForm>
                        <div className="flex flex-wrap gap-4">
                          <OpsForm
                            fn="ops_set_user_active"
                            submitLabel={s.active ? "Switch off access" : "Switch access back on"}
                            variant={s.active ? "danger" : "secondary"}
                            inline
                            confirm={s.active ? "Switch off this person's access? They are signed out everywhere." : undefined}
                            success="Updated"
                          >
                            <input type="hidden" name="p_user_id" value={s.user_id} />
                            <input type="hidden" name="p_active#bool" value={s.active ? "false" : "true"} />
                            <Input label="Reason" name="p_reason" required className="w-48" />
                          </OpsForm>
                          {s.active_sessions > 0 ? (
                            <OpsForm fn="ops_reset_user_sessions" submitLabel="Sign out everywhere" variant="quiet" inline success="Signed out — they need a new sign-in code">
                              <input type="hidden" name="p_user_id" value={s.user_id} />
                              <Input label="Reason" name="p_reason" required className="w-48" />
                            </OpsForm>
                          ) : null}
                        </div>
                      </div>
                    </details>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>No staff yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "invite" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {ops.can("users", "create") ? (
            <Card
              title="Add a staff member"
              description="Enter the email they sign in with. If they already have an account the roles apply now; otherwise when they first sign in with a code."
            >
              <OpsForm fn="ops_invite_staff" submitLabel="Add staff member" success="Done">
                <Grid cols={2}>
                  <Input label="Email" name="p_email" type="email" required />
                  <Input label="Job title" name="p_job_title" />
                </Grid>
                <RoleBoxes roles={roles} selected={[]} />
              </OpsForm>
            </Card>
          ) : null}
          <Card title="Waiting to sign in">
            {invites.length ? (
              <Table head={["Email", "Roles", "Added"]} compact>
                {invites.map((i) => (
                  <tr key={i.email}>
                    <Td>{i.email}</Td>
                    <Td>{i.role_keys.map((r) => roleLabel.get(r) ?? r).join(", ")}</Td>
                    <Td>{dateTime(i.invited_at)}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nobody pending.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "roles" ? (
        <div className="flex flex-col gap-4">
          {!ops.can("users", "approve") ? <Notice>Only people allowed to approve user changes can edit role permissions.</Notice> : null}
          {roles.map((r) => (
            <Card key={r.key} title={r.label} description={r.description ?? undefined}>
              {r.key === "admin" ? (
                <p className="text-sm text-dark/65">The administrator role always has every permission.</p>
              ) : (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold text-primary-dark">
                    {perms.filter((p) => p.role_key === r.key).length} permissions — view{ops.can("users", "approve") ? " / change" : ""}
                  </summary>
                  <div className="mt-3">
                    <OpsForm fn="ops_set_role_permissions" submitLabel="Save permissions" success="Permissions saved" resetOnSuccess={false} confirm={`Change what "${r.label}" can do?`}>
                      <input type="hidden" name="p_role_key" value={r.key} />
                      <PermissionMatrix
                        modules={(modData ?? []) as { key: string; label: string }[]}
                        actions={(actData ?? []) as { key: string; label: string }[]}
                        initial={perms.filter((p) => p.role_key === r.key).map((p) => `${p.module}.${p.action}`)}
                        disabled={!ops.can("users", "approve")}
                      />
                      <Input label="Reason" name="p_reason" />
                    </OpsForm>
                  </div>
                </details>
              )}
            </Card>
          ))}
          {ops.can("users", "create") ? (
            <Card title="New role" description="Create it, then set its permissions above.">
              <OpsForm fn="ops_create_role" submitLabel="Create role" success="Role created">
                <Grid cols={3}>
                  <Input label="Key" name="p_key" required placeholder="e.g. store_keeper" pattern="[a-z][a-z0-9_]{1,40}" />
                  <Input label="Name" name="p_label" required />
                  <Input label="Description" name="p_description" />
                </Grid>
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
