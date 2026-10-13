import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Input, PageHeader, Notice, Stat, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, param, todayIST } from "@/lib/ops/format";
import { endReasons, hm, statusLabels, type AttendanceRow, type GapRow, type ReportRow, type SessionRow, type TimelineRow } from "@/lib/staff/types";

export const metadata = { title: "Staff activity & audit" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function timelineText(e: TimelineRow) {
  switch (e.kind) {
    case "login":
      return `Signed in (${e.module ?? "ops"})`;
    case "portal":
      return `Opened the ${e.module} app`;
    case "navigation":
      return `Opened ${e.module ?? "a page"}${e.path ? ` — ${e.path}` : ""}`;
    case "business_action":
      return `${e.action}${e.entity_id ? ` · ${e.entity} ${e.entity_id.slice(0, 8)}` : ""}${e.reason ? ` — “${e.reason}”` : ""}`;
    case "action_failed":
      return `Refused: ${e.action ?? (e.detail as { action?: string } | null)?.action ?? "action"} (${e.error_code ?? (e.detail as { error?: string } | null)?.error ?? "error"})`;
    case "no_interaction":
      return `No application interaction detected for ${e.minutes} min`;
    case "last_interaction":
      return `Last recorded interaction — ${(e.detail as { then?: string } | null)?.then ?? ""}`;
    case "logout":
      return "Logged out (manual)";
    case "idle_timeout":
      return `Automatically logged out after inactivity (drafts: ${(e.detail as { save_status?: string } | null)?.save_status ?? "—"})`;
    case "expired":
      return "Session expired on the server (no sign-out from the browser)";
    case "revoked":
      return `Session revoked by an administrator${(e.detail as { note?: string } | null)?.note ? ` — ${(e.detail as { note?: string }).note}` : ""}`;
    case "policy_acknowledged":
      return "Acknowledged the monitoring notice";
    default:
      return e.kind.replace(/_/g, " ");
  }
}

export default async function ActivityCenter({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("staff_monitoring");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "live";
  const today = todayIST();
  const from = DATE.test(param(sp.from) ?? "") ? (param(sp.from) as string) : tab === "timeline" ? today : todayIST(-6);
  const to = DATE.test(param(sp.to) ?? "") ? (param(sp.to) as string) : today;
  const day = DATE.test(param(sp.day) ?? "") ? (param(sp.day) as string) : today;
  const user = UUID.test(param(sp.user) ?? "") ? (param(sp.user) as string) : null;
  const idleMin = Number(param(sp.idle) ?? 5) || 5;
  const noActMin = Number(param(sp.noact) ?? 60) || 60;
  const reason = param(sp.reason) ?? "";
  const canExport = ops.can("staff_monitoring", "export");
  const canRevoke = ops.can("staff_monitoring", "edit");

  const { data: peopleData } = await ops.supabase.rpc("staff_activity_report", { p_from: from, p_to: to });
  const people = (peopleData ?? []) as ReportRow[];
  const qs = (extra: Record<string, string>) => `?${new URLSearchParams({ tab, from, to, ...(user ? { user } : {}), ...extra })}`;

  const tabs = [
    { key: "live", label: "Live sessions" },
    { key: "report", label: "Employee report" },
    { key: "timeline", label: "Daily timeline" },
    { key: "inactivity", label: "Inactivity" },
    { key: "sessions", label: "Session history" },
    { key: "attendance", label: "Attendance" },
    { key: "roles", label: "Role history" },
  ];

  const personPicker = (withDay: boolean) => (
    <form className="mb-4 flex flex-wrap items-end gap-2 text-sm">
      <input type="hidden" name="tab" value={tab} />
      <label className="flex flex-col gap-1 font-semibold text-ink">
        Employee
        <select name="user" defaultValue={user ?? ""} className="rounded-lg border-2 border-ink/15 px-2 py-1.5">
          <option value="">Everyone</option>
          {people.map((p) => (
            <option key={p.user_id} value={p.user_id}>
              {p.name}
            </option>
          ))}
        </select>
      </label>
      {withDay ? (
        <label className="flex flex-col gap-1 font-semibold text-ink">
          Day
          <input type="date" name="day" defaultValue={day} className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
        </label>
      ) : (
        <>
          <label className="flex flex-col gap-1 font-semibold text-ink">
            From
            <input type="date" name="from" defaultValue={from} className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
          </label>
          <label className="flex flex-col gap-1 font-semibold text-ink">
            To
            <input type="date" name="to" defaultValue={to} className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
          </label>
        </>
      )}
      {tab === "inactivity" ? (
        <>
          <label className="flex flex-col gap-1 font-semibold text-ink">
            No interaction for (min)
            <select name="idle" defaultValue={String(idleMin)} className="rounded-lg border-2 border-ink/15 px-2 py-1.5">
              {[5, 15, 30, 60].map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 font-semibold text-ink">
            No business action for (min)
            <input name="noact" type="number" min={5} defaultValue={noActMin} className="w-24 rounded-lg border-2 border-ink/15 px-2 py-1.5" />
          </label>
        </>
      ) : null}
      {tab === "sessions" ? (
        <label className="flex flex-col gap-1 font-semibold text-ink">
          Ended by
          <select name="reason" defaultValue={reason} className="rounded-lg border-2 border-ink/15 px-2 py-1.5">
            <option value="">Any</option>
            <option value="active">Still open</option>
            <option value="interrupted">Interrupted (no sign-out)</option>
            {Object.entries(endReasons).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <button className="rounded-lg bg-ink px-3 py-2 font-semibold text-white">Show</button>
    </form>
  );

  let body: React.ReactNode = null;

  if (tab === "live") {
    const { data } = await ops.supabase.rpc("staff_live_sessions");
    const rows = (data ?? []) as SessionRow[];
    const open = rows.filter((r) => r.status === "active");
    body = (
      <>
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="Signed in now" value={open.length} />
          <Stat label="Active interaction" value={open.filter((r) => r.status_label === "active_interaction").length} tone="good" />
          <Stat label="No recent interaction" value={open.filter((r) => r.status_label !== "active_interaction").length} tone="warn" />
          <Stat label="Sessions today" value={rows.length} />
        </div>
        <Card title="Sessions" description="Status comes from the server's last recorded interaction; it does not say whether someone is working away from the screen.">
          {rows.length ? (
            <Table head={["Employee", "Role", "App", "Signed in", "Last interaction", "Last business action", "Duration", "Status", ""]}>
              {rows.map((r) => {
                const st = statusLabels[r.status_label] ?? { label: r.status_label, tone: "muted" as const };
                return (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/ops/admin/activity?tab=timeline&user=${r.user_id}&day=${today}`} className="font-semibold text-primary-dark">
                        {r.name}
                      </Link>
                      <div className="text-xs text-dark/55">{r.ref}</div>
                    </Td>
                    <Td>{r.owner ? "owner" : r.roles.join(", ")}</Td>
                    <Td>
                      {r.portal}
                      <div className="text-xs text-dark/55">{r.device ?? ""}</div>
                    </Td>
                    <Td>{dateTime(r.started_at)}</Td>
                    <Td>
                      {dateTime(r.last_interaction_at)}
                      {r.idle_seconds_now !== null ? <div className="text-xs text-dark/55">{hm(r.idle_seconds_now)} ago</div> : null}
                    </Td>
                    <Td>
                      {r.last_business_action ? `${r.last_business_action} · ${dateTime(r.last_business_action_at)}` : "None recorded"}
                    </Td>
                    <Td>
                      {hm(r.logged_in_seconds)}
                      <div className="text-xs text-dark/55">{hm(r.active_seconds)} active</div>
                    </Td>
                    <Td>
                      <Badge tone={st.tone}>{st.label}</Badge>
                      {r.end_reason ? <div className="text-xs text-dark/55">{endReasons[r.end_reason] ?? r.end_reason}</div> : null}
                    </Td>
                    <Td>
                      {r.status === "active" && canRevoke ? (
                        <OpsForm fn="staff_revoke_session" submitLabel="End session" variant="danger" inline confirm={`End ${r.name}'s session now?`} success="Session ended" autosave={false}>
                          <input type="hidden" name="p_session_id" value={r.id} />
                          <Input label="Reason" name="p_reason" required />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>No sessions today.</Empty>
          )}
        </Card>
      </>
    );
  } else if (tab === "report") {
    const rows = user ? people.filter((p) => p.user_id === user) : people;
    body = (
      <Card
        title="Employee activity"
        description="Measured application activity only. Production, deliveries, calls and stock checks happen away from the screen — compare people against their own duties, not by clicks."
        actions={canExport ? <a href={`/ops/admin/activity/export/report${qs({})}`} className="text-sm font-semibold text-primary-dark">Export CSV</a> : null}
      >
        <Table head={["Employee", "Sessions", "Signed in", "Active interaction", "Idle (no interaction)", "Sessions with no business action", "Ended by", "Business actions", "Refused", "Work done"]}>
          {rows.map((r) => (
            <tr key={r.user_id}>
              <Td>
                {r.name}
                <div className="text-xs text-dark/55">{r.current_roles.join(", ")}{r.department ? ` · ${r.department}` : ""}</div>
              </Td>
              <Td right>{r.sessions}</Td>
              <Td right>{hm(r.logged_in_seconds)}</Td>
              <Td right>{hm(r.active_seconds)}</Td>
              <Td right>{hm(r.idle_seconds)}</Td>
              <Td right>{hm(r.no_business_seconds)}</Td>
              <Td>
                <span className="text-xs">
                  {r.manual_logouts} manual · {r.timeouts} timeout · {r.interrupted} interrupted{r.revoked ? ` · ${r.revoked} revoked` : ""}
                </span>
              </Td>
              <Td right>{r.business_actions}</Td>
              <Td right className={r.failed_actions ? "text-accent-dark" : ""}>{r.failed_actions}</Td>
              <Td>
                <span className="text-xs">
                  {[
                    r.orders_processed ? `${r.orders_processed} orders` : "",
                    r.batches_updated ? `${r.batches_updated} batches` : "",
                    r.dispatches_completed ? `${r.dispatches_completed} dispatches` : "",
                    r.finance_entries ? `${r.finance_entries} finance entries` : "",
                  ]
                    .filter(Boolean)
                    .join(" · ") || Object.entries(r.by_module).map(([m, n]) => `${m} ${n}`).join(" · ") || "—"}
                </span>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    );
  } else if (tab === "timeline") {
    if (!user) {
      body = <Empty>Choose an employee and a day.</Empty>;
    } else {
      const { data } = await ops.supabase.rpc("staff_timeline", { p_user_id: user, p_date: day });
      const rows = (data ?? []) as TimelineRow[];
      body = (
        <Card title={`${people.find((p) => p.user_id === user)?.name ?? "Employee"} — ${date(day)}`} description="Built only from recorded events. Gaps are shown as recorded; they are not proof that no work was done.">
          {rows.length ? (
            <ol className="relative ml-2 border-l-2 border-ink/10 pl-4 text-sm">
              {rows.map((e, i) => (
                <li key={i} className="mb-2">
                  <span
                    className={`absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full ${
                      e.kind === "business_action" ? "bg-emerald-500" : e.kind === "action_failed" ? "bg-accent" : e.kind === "no_interaction" ? "bg-amber-400" : "bg-primary"
                    }`}
                    aria-hidden="true"
                  />
                  <span className="font-mono text-xs text-dark/60">{new Date(e.at).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", timeZone: "Asia/Kolkata" })}</span>{" "}
                  <span className={e.kind === "no_interaction" ? "text-amber-800" : "text-ink"}>{timelineText(e)}</span>
                  {e.session ? <span className="ml-1 text-xs text-dark/45">{e.session}</span> : null}
                </li>
              ))}
            </ol>
          ) : (
            <Empty>Nothing recorded for this day.</Empty>
          )}
        </Card>
      );
    }
  } else if (tab === "inactivity") {
    const { data } = await ops.supabase.rpc("staff_inactivity_report", { p_from: from, p_to: to, p_min_idle_minutes: idleMin, p_min_no_action_minutes: noActMin, p_user_id: user });
    const rows = (data ?? []) as GapRow[];
    body = (
      <Card
        title="Periods without recorded activity"
        description="Evidence with timestamps for a manager to look into — not a finding of misconduct. Work away from the screen is not recorded."
        actions={canExport ? <a href={`/ops/admin/activity/export/inactivity${qs({ idle: String(idleMin), noact: String(noActMin) })}`} className="text-sm font-semibold text-primary-dark">Export CSV</a> : null}
      >
        {rows.length ? (
          <Table head={["Employee", "Type", "From", "To", "Minutes", "Session", "Module"]} compact>
            {rows.map((r, i) => (
              <tr key={i}>
                <Td>
                  {r.name}
                  <div className="text-xs text-dark/55">{r.roles.join(", ")}</div>
                </Td>
                <Td>{r.type === "no_interaction" ? "No application interaction detected" : "No recorded business action"}</Td>
                <Td>{dateTime(r.from)}</Td>
                <Td>{dateTime(r.to)}</Td>
                <Td right>{r.minutes}</Td>
                <Td>{r.session}</Td>
                <Td>{r.module ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No periods that long.</Empty>
        )}
      </Card>
    );
  } else if (tab === "sessions") {
    const { data } = await ops.supabase.rpc("staff_session_history", { p_from: from, p_to: to, p_user_id: user, p_reason: reason || null });
    const rows = (data ?? []) as SessionRow[];
    body = (
      <Card
        title="Sign-ins and sign-outs"
        description="“No sign-out recorded” means the browser stopped reporting (closed, asleep, offline) and the server ended the session; no sign-out time is invented."
        actions={canExport ? <a href={`/ops/admin/activity/export/sessions${qs({ reason })}`} className="text-sm font-semibold text-primary-dark">Export CSV</a> : null}
      >
        {rows.length ? (
          <Table head={["Employee", "Session", "Role at sign-in", "App / device", "Signed in", "Signed out", "How it ended", "Signed in for", "Active", "Idle", "Actions", "Drafts at sign-out"]} compact>
            {rows.map((r) => (
              <tr key={r.id}>
                <Td>{r.name}</Td>
                <Td>{r.ref}</Td>
                <Td>{r.owner ? "owner" : r.roles.join(", ")}</Td>
                <Td>
                  {r.portal}
                  <div className="text-xs text-dark/55">{r.device ?? ""} {r.ip ?? ""}</div>
                </Td>
                <Td>{dateTime(r.started_at)}</Td>
                <Td>{r.ended_at ? dateTime(r.ended_at) : r.status === "active" ? "open" : "no sign-out recorded"}</Td>
                <Td>{r.end_reason ? endReasons[r.end_reason] ?? r.end_reason : "—"}</Td>
                <Td right>{hm(r.logged_in_seconds)}</Td>
                <Td right>{hm(r.active_seconds)}</Td>
                <Td right>{hm(r.idle_seconds)}</Td>
                <Td right>
                  {r.business_actions}
                  {r.failed_actions ? <div className="text-xs text-accent-dark">{r.failed_actions} refused</div> : null}
                </Td>
                <Td>{r.save_status ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No sessions in this period.</Empty>
        )}
      </Card>
    );
  } else if (tab === "attendance") {
    const { data } = await ops.supabase.rpc("staff_attendance", { p_from: from, p_to: to });
    const rows = ((data ?? []) as AttendanceRow[]).filter((r) => !user || r.user_id === user);
    body = (
      <>
        <Notice tone="info">
          Attendance is shown next to application use, not derived from it: signed-in time is not working time, and inactivity never changes attendance on its own.
        </Notice>
        <div className="mt-4" />
        <Card title="By day" actions={canExport ? <a href={`/ops/admin/activity/export/attendance${qs({})}`} className="text-sm font-semibold text-primary-dark">Export CSV</a> : null}>
          {rows.length ? (
            <Table head={["Day", "Employee", "Shift", "First sign-in", "Last session end", "Signed-in time", "Active", "Idle", "Interrupted", "Manual / timeout"]} compact>
              {rows.map((r, i) => (
                <tr key={i}>
                  <Td>{date(r.day)}</Td>
                  <Td>
                    {r.name}
                    {r.department ? <div className="text-xs text-dark/55">{r.department}</div> : null}
                  </Td>
                  <Td>{r.shift_start ? `${r.shift_start.slice(0, 5)}–${r.shift_end?.slice(0, 5) ?? ""}` : "—"}</Td>
                  <Td>{dateTime(r.first_login)}</Td>
                  <Td>{dateTime(r.last_end)}</Td>
                  <Td right>{hm(r.logged_in_seconds)}</Td>
                  <Td right>{hm(r.active_seconds)}</Td>
                  <Td right>{hm(r.idle_seconds)}</Td>
                  <Td right>{r.interrupted}</Td>
                  <Td right>
                    {r.manual_logouts} / {r.timeouts}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No sessions in this period.</Empty>
          )}
        </Card>
        {ops.can("users", "edit") ? (
          <Card title="Department and shift" className="mt-4">
            <OpsForm fn="staff_set_shift" submitLabel="Save shift" success="Saved" autosave={false}>
              <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
                Employee
                <select name="p_user_id" required className="rounded-lg border-2 border-ink/15 px-3 py-2">
                  {people.map((p) => (
                    <option key={p.user_id} value={p.user_id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
              <Input label="Department" name="p_department" />
              <Input label="Shift start" name="p_shift_start" type="time" />
              <Input label="Shift end" name="p_shift_end" type="time" />
            </OpsForm>
          </Card>
        ) : null}
      </>
    );
  } else if (tab === "roles") {
    if (!user) {
      body = <Empty>Choose an employee.</Empty>;
    } else {
      const { data } = await ops.supabase.rpc("staff_role_history_for", { p_user_id: user });
      const rows = (data ?? []) as { effective_from: string; roles: string[]; permissions: string[]; change: string; reason: string | null; changed_by: string | null }[];
      body = (
        <Card title="Roles held over time" description="Sessions keep the role held when they started; this shows every change since.">
          {rows.length ? (
            <Table head={["From", "Change", "Roles", "Permissions", "By", "Reason"]} compact>
              {rows.map((r, i) => (
                <tr key={i}>
                  <Td>{dateTime(r.effective_from)}</Td>
                  <Td>{r.change}</Td>
                  <Td>{r.roles.join(", ") || "none"}</Td>
                  <Td>
                    <span className="text-xs">{r.permissions.length} permissions</span>
                  </Td>
                  <Td>{r.changed_by ?? "—"}</Td>
                  <Td>{r.reason ?? "—"}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No role changes recorded.</Empty>
          )}
        </Card>
      );
    }
  }

  return (
    <>
      <PageHeader
        title="Staff activity & audit"
        description="Sign-ins, roles held, business actions, interaction and inactivity — measured application activity, not total working time. Staff can read what is recorded in the monitoring notice."
        actions={<Link href="/ops/policy" className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">Monitoring notice</Link>}
      />
      <Tabs current={tab} items={tabs.map((t) => ({ ...t, href: `/ops/admin/activity?tab=${t.key}${user ? `&user=${user}` : ""}` }))} />
      {tab !== "live" ? personPicker(tab === "timeline") : null}
      {body}
    </>
  );
}
