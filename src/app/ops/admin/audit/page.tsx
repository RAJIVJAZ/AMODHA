import { Card, Empty, PageHeader, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, label, param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Audit log" };

type Row = { id: number; at: string; actor: string | null; actor_name: string | null; action: string; entity: string; entity_id: string | null; details: unknown; reason: string | null };
type Login = { user_id: string; email: string; signed_in_at: string; last_active_at: string | null; user_agent: string | null; ip: string | null };

function summary(details: unknown) {
  if (!details || typeof details !== "object") return "";
  const text = JSON.stringify(details);
  return text.length > 220 ? `${text.slice(0, 220)}…` : text;
}

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("audit");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "changes";
  const from = param(sp.from) ?? todayIST(-7);
  const to = param(sp.to) ?? todayIST();
  const q = param(sp.q)?.trim() || null;

  const [{ data: rows, error }, { data: logins }] = await Promise.all([
    tab === "changes" ? ops.supabase.rpc("ops_audit_log", { p_from: from, p_to: to, p_search: q, p_limit: 500 }) : Promise.resolve({ data: [], error: null }),
    tab === "logins" ? ops.supabase.rpc("ops_login_history", { p_limit: 300 }) : Promise.resolve({ data: [] }),
  ]);

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every change made through the business app — who, when, what changed and why. Entries cannot be edited or deleted."
        actions={
          tab === "changes" ? (
            <form className="flex flex-wrap items-center gap-2 text-sm">
              <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
              <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
              <input name="q" defaultValue={q ?? ""} placeholder="Search action, person, number…" aria-label="Search" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
              <button className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-ink/15">Show</button>
              {ops.can("audit", "export") ? (
                <a href={`/ops/export/audit-log?from=${from}&to=${to}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 font-semibold text-ink">
                  Export CSV
                </a>
              ) : null}
            </form>
          ) : null
        }
      />
      <Tabs
        current={tab}
        items={[
          { key: "changes", label: "Changes", href: "/ops/admin/audit" },
          { key: "logins", label: "Sign-ins", href: "/ops/admin/audit?tab=logins" },
        ]}
      />
      {tab === "changes" ? (
        <Card>
          {error ? <p className="text-sm text-red-700">{error.message}</p> : null}
          {(rows ?? []).length ? (
            <Table head={["When", "Who", "Action", "Record", "Details", "Reason"]} compact>
              {((rows ?? []) as Row[]).map((r) => (
                <tr key={r.id}>
                  <Td>{dateTime(r.at)}</Td>
                  <Td>{r.actor_name ?? r.actor?.slice(0, 8)}</Td>
                  <Td className="font-semibold">{r.action}</Td>
                  <Td>
                    {label(r.entity)}
                    {r.entity_id ? <div className="max-w-40 truncate text-dark/50">{r.entity_id}</div> : null}
                  </Td>
                  <Td>
                    <code className="block max-w-md whitespace-pre-wrap break-all text-[11px] text-dark/70">{summary(r.details)}</code>
                  </Td>
                  <Td>{r.reason}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No changes in this period.</Empty>
          )}
        </Card>
      ) : (
        <Card description="Current sign-in sessions from Supabase Auth, newest first.">
          {(logins ?? []).length ? (
            <Table head={["Person", "Signed in", "Last active", "Device", "IP"]} compact>
              {((logins ?? []) as Login[]).map((l, i) => (
                <tr key={`${l.user_id}-${i}`}>
                  <Td>{l.email}</Td>
                  <Td>{dateTime(l.signed_in_at)}</Td>
                  <Td>{dateTime(l.last_active_at)}</Td>
                  <Td>
                    <span className="block max-w-xs truncate" title={l.user_agent ?? ""}>
                      {l.user_agent}
                    </span>
                  </Td>
                  <Td>{l.ip}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No sessions.</Empty>
          )}
        </Card>
      )}
    </>
  );
}
