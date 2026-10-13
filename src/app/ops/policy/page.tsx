import { MonitoringNotice } from "@/components/staff/monitoring-notice";
import { Card, Empty, Table, Td } from "@/components/ops/ui";
import { getOps } from "@/lib/ops/context";
import { dateTime } from "@/lib/ops/format";
import { monitoringSettings } from "@/lib/staff/settings";
import { redirect } from "next/navigation";

export const metadata = { title: "Monitoring notice" };

type Mine = {
  sessions: { started_at: string; ended_at: string | null; end_reason: string | null; portal: string; device: string | null; business_actions: number;
    interrupted: boolean; save_status: string | null; logged_in_seconds: number; active_seconds: number }[];
  acknowledgements: { version: string; at: string }[];
};

const hm = (s: number) => `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`;

export default async function PolicyPage() {
  const ops = await getOps();
  if (!ops) redirect("/login?next=/ops/policy");
  const s = ops.session;
  const [{ retentionDays }, { data }] = await Promise.all([monitoringSettings(ops.supabase), ops.supabase.rpc("staff_my_activity")]);
  const mine = (data ?? { sessions: [], acknowledgements: [] }) as Mine;
  return (
    <div className="flex flex-col gap-4">
      <MonitoringNotice version={s.policy_version ?? "1"} timeoutMinutes={Math.round((s.timeout_seconds ?? 300) / 60)} retentionDays={retentionDays} acknowledged={Boolean(s.acknowledged)} />
      <Card title="Your recent sessions" description="Exactly what is recorded about your sign-ins.">
        {mine.sessions.length ? (
          <Table head={["Signed in", "App", "Device", "Ended", "How", "Signed-in time", "Active time", "Business actions", "Drafts"]} compact>
            {mine.sessions.map((x, i) => (
              <tr key={i}>
                <Td>{dateTime(x.started_at)}</Td>
                <Td>{x.portal}</Td>
                <Td>{x.device ?? "—"}</Td>
                <Td>{x.ended_at ? dateTime(x.ended_at) : x.end_reason ? "no sign-out recorded" : "open"}</Td>
                <Td>{x.end_reason ? `${x.end_reason.replace(/_/g, " ")}${x.interrupted ? " (browser stopped reporting)" : ""}` : "—"}</Td>
                <Td>{hm(x.logged_in_seconds)}</Td>
                <Td>{hm(x.active_seconds)}</Td>
                <Td right>{x.business_actions}</Td>
                <Td>{x.save_status ?? "—"}</Td>
              </tr>
            ))}
          </Table>
        ) : (
          <Empty>No sessions yet.</Empty>
        )}
      </Card>
    </div>
  );
}
