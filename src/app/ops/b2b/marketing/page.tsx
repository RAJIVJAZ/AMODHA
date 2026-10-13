import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Input, PageHeader, Select, Stat, Table, Td, TextArea } from "@/components/ops/ui";
import { segments } from "@/lib/b2b/labels";
import type { CustomerRow } from "@/lib/b2b/types";
import { requireOps } from "@/lib/ops/context";
import { dateTime } from "@/lib/ops/format";
import type { Campaign } from "../_lib";

export const metadata = { title: "Marketing & consent" };

export default async function MarketingPage() {
  const ops = await requireOps("marketing");
  const [{ data: list }, { data: camps }] = await Promise.all([
    ops.supabase.rpc("b2b_customer_list", { p_search: null, p_filters: {}, p_limit: 2000 }),
    ops.supabase.from("marketing_campaigns").select("*").order("created_at", { ascending: false }).limit(50),
  ]);
  const customers = (list ?? []) as CustomerRow[];
  const counts = new Map<string, number>();
  for (const c of customers) for (const s of c.segments) counts.set(s, (counts.get(s) ?? 0) + 1);
  const campaigns = (camps ?? []) as Campaign[];
  const { data: consentRows } = await ops.supabase
    .from("b2b_customers")
    .select("id, customer_code, shop_name, marketing_consent, consent_channels, consent_source, consent_at, opted_out_at")
    .or("marketing_consent.eq.true,opted_out_at.not.is.null")
    .order("consent_at", { ascending: false })
    .limit(200);
  const register = (consentRows ?? []) as { id: string; customer_code: string; shop_name: string; marketing_consent: boolean; consent_channels: string[]; consent_source: string | null; consent_at: string | null; opted_out_at: string | null }[];
  const segmentOptions = [{ value: "marketing_consent", label: "Everyone who agreed to marketing" }, { value: "all", label: "All customers (consent still required)" }, ...Object.entries(segments).map(([value, label]) => ({ value, label }))];

  return (
    <>
      <PageHeader
        title="Marketing & consent"
        description="Only customers who agreed to a channel and have not opted out ever become recipients. Consent is checked again when recipients are exported. Messages are sent through an approved WhatsApp / SMS / email provider — there is no bulk-send button here."
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Object.entries(segments).map(([k, l]) => (
          <Stat key={k} label={l} value={counts.get(k) ?? 0} href={`/ops/b2b/customers?segment=${k}`} />
        ))}
      </div>
      <div className="flex flex-col gap-4">
        <Card title="Campaigns">
          {campaigns.length ? (
            <Table head={["Campaign", "Channel / segment", "Status", "Excluded", ""]}>
              {campaigns.map((c) => (
                <tr key={c.id}>
                  <Td>
                    {c.name}
                    <div className="max-w-md text-xs text-dark/60">{c.message}</div>
                  </Td>
                  <Td>{c.channel} · {segments[c.segment] ?? c.segment}</Td>
                  <Td>
                    <Badge tone={c.status === "sent" ? "good" : c.status === "approved" ? "info" : "muted"}>{c.status}</Badge>
                    <div className="text-xs text-dark/55">{c.sent_at ? `sent ${dateTime(c.sent_at)}` : c.approved_at ? `approved ${dateTime(c.approved_at)}` : ""}</div>
                  </Td>
                  <Td>{c.status === "draft" ? "—" : `${c.excluded_no_consent} no consent · ${c.excluded_opted_out} opted out`}</Td>
                  <Td>
                    <div className="flex flex-col gap-2">
                      {c.status === "draft" && ops.can("marketing", "approve") ? (
                        <OpsForm fn="mkt_approve_campaign" submitLabel="Approve" success="Approved — recipients fixed" variant="secondary" inline>
                          <input type="hidden" name="p_campaign_id" value={c.id} />
                        </OpsForm>
                      ) : null}
                      {c.status !== "draft" && ops.can("marketing", "export") ? (
                        <a href={`/ops/b2b/export/campaign?id=${c.id}`} className="text-sm font-semibold text-primary-dark">Export recipients</a>
                      ) : null}
                      {c.status === "approved" && ops.can("marketing", "approve") ? (
                        <OpsForm fn="mkt_mark_sent" submitLabel="Mark sent" success="Marked sent" variant="secondary" inline>
                          <input type="hidden" name="p_campaign_id" value={c.id} />
                          <Input label="Provider reference" name="p_provider_reference" />
                        </OpsForm>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No campaigns yet.</Empty>
          )}
        </Card>
        {ops.can("marketing", "create") ? (
          <Card title="New campaign (draft)">
            <OpsForm fn="mkt_save_campaign" submitLabel="Save draft" success="Draft saved">
              <Input label="Name" name="p.name" required />
              <Select label="Channel" name="p.channel" options={[{ value: "whatsapp", label: "WhatsApp" }, { value: "sms", label: "SMS" }, { value: "email", label: "Email" }]} />
              <Select label="Segment" name="p.segment" options={segmentOptions} />
              <TextArea label="Message" name="p.message" required rows={3} />
            </OpsForm>
          </Card>
        ) : null}
        <Card title="Consent register" description="Latest consent or opt-out per customer. Full history is on each customer's page.">
          {register.length ? (
            <Table head={["Customer", "Status", "Channels", "Source", "When"]} compact>
              {register.map((r) => (
                <tr key={r.id}>
                  <Td>
                    <a href={`/ops/b2b/customers/${r.id}`} className="font-semibold text-primary-dark">{r.shop_name}</a>
                    <div className="text-xs text-dark/55">{r.customer_code}</div>
                  </Td>
                  <Td>{r.opted_out_at ? <Badge tone="bad">opted out</Badge> : <Badge tone="good">agreed</Badge>}</Td>
                  <Td>{r.consent_channels.join(", ") || "—"}</Td>
                  <Td>{r.consent_source}</Td>
                  <Td>{dateTime(r.opted_out_at ?? r.consent_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No consent recorded yet.</Empty>
          )}
        </Card>
      </div>
    </>
  );
}
