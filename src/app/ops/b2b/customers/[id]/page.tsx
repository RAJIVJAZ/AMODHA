import Link from "next/link";
import { notFound } from "next/navigation";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, Notice, NumberInput, PageHeader, Select, Stat, Table, Tabs, Td, TextArea } from "@/components/ops/ui";
import { activityKinds, channels, customerStatuses, customerTypes, outcomes, paymentMethods as orderPaymentMethods, paymentTerms, segments, statusTone } from "@/lib/b2b/labels";
import type { CustomerProfile, Statement } from "@/lib/b2b/types";
import { requireOps } from "@/lib/ops/context";
import { moneyAccounts, paymentMethods } from "@/lib/ops/finance";
import { date, dateTime, inr, label, param, qty, todayIST } from "@/lib/ops/format";
import { consentChannels, num, UUID, type SearchParams } from "../../_lib";

export const metadata = { title: "B2B customer" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const statusToneMap: Record<string, "good" | "warn" | "bad" | "muted"> = { lead: "warn", approved: "good", rejected: "bad", suspended: "bad", inactive: "muted" };
const preferredChannels = [
  { value: "phone", label: "Phone call" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "sms", label: "SMS" },
  { value: "email", label: "Email" },
  { value: "visit", label: "Visit" },
];

function Detail({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-dark/55">{k}</dt>
      <dd className="text-sm">{children || "—"}</dd>
    </div>
  );
}

export default async function CustomerRecordPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SearchParams> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const ops = await requireOps("b2b_customers");
  const sp = await searchParams;
  const tab = ["overview", "crm", "account", "products"].includes(param(sp.tab) ?? "") ? (param(sp.tab) as string) : "overview";

  const { data: profileData, error } = await ops.supabase.rpc("b2b_customer_profile", { p_customer_id: id });
  if (error || !profileData) notFound();
  const p = profileData as CustomerProfile;
  const c = p.customer;

  const canEdit = ops.can("b2b_customers", "edit");
  const canApprove = ops.can("b2b_customers", "approve");
  const canPriceCategory = ops.can("pricing", "approve") || canApprove;
  const canCredit = ops.can("sales", "approve");
  const canAssign = canEdit || ops.can("sales_team", "edit");
  const canAccess = ops.can("pricing", "edit") || canEdit;
  const canConsent = ops.can("marketing", "create") || canEdit;
  const canStatement = ops.can("sales");
  const canReceive = ops.can("sales", "create");
  const from = DATE.test(param(sp.from) ?? "") ? (param(sp.from) as string) : todayIST(-90);
  const to = DATE.test(param(sp.to) ?? "") ? (param(sp.to) as string) : todayIST();

  const [{ data: catData }, { data: spData }, { data: itemData }, statementRes, accounts] = await Promise.all([
    tab === "overview" ? ops.supabase.from("price_categories").select("code, label, is_active").order("sort_order") : Promise.resolve({ data: [] }),
    tab === "overview" ? ops.supabase.from("salespeople").select("id, full_name, is_active").order("full_name") : Promise.resolve({ data: [] }),
    tab === "products"
      ? ops.supabase
          .from("items")
          .select("id, code, name, b2b_enabled, b2b_restricted, is_active")
          .in("item_type", ["finished_good", "purchased_good"])
          .eq("is_active", true)
          .order("name")
      : Promise.resolve({ data: [] }),
    tab === "account" && canStatement ? ops.supabase.rpc("b2b_statement", { p_customer_id: id, p_from: from, p_to: to }) : Promise.resolve({ data: null, error: null }),
    tab === "account" && canReceive ? moneyAccounts(ops) : Promise.resolve([]),
  ]);
  const categories = (catData ?? []) as { code: string; label: string; is_active: boolean }[];
  const salespeople = (spData ?? []) as { id: string; full_name: string; is_active: boolean }[];
  const items = (itemData ?? []) as { id: string; code: string; name: string; b2b_enabled: boolean; b2b_restricted: boolean }[];
  const statement = (statementRes.data ?? null) as Statement | null;
  const access = new Map((p.item_access ?? []).map((a) => [a.item_id, a.allowed]));
  const credit = p.credit;
  const isCustomer = ["approved", "suspended", "inactive"].includes(c.status);
  const base = `/ops/b2b/customers/${c.id}`;

  return (
    <>
      <Link href="/ops/b2b/customers" className="text-sm font-semibold text-primary-dark">
        ← B2B customers
      </Link>
      <PageHeader
        title={c.shop_name}
        description={
          <>
            <span className="font-mono">{c.customer_code}</span> · {customerTypes[c.customer_type] ?? label(c.customer_type)} · {c.locality ? `${c.locality}, ` : ""}
            {c.city} · added {date(c.acquired_at)} ({label(c.source)})
          </>
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusToneMap[c.status] ?? "muted"}>{customerStatuses[c.status] ?? c.status}</Badge>
            {p.salesperson ? <Badge tone="info">{p.salesperson.name}</Badge> : <Badge>no salesperson</Badge>}
          </div>
        }
      />

      {p.segments.length ? (
        <div className="mb-4 flex flex-wrap gap-1">
          {p.segments.map((s) => (
            <Badge key={s} tone={s === "needs_follow_up" || s === "outstanding_payment" ? "warn" : "info"}>
              {segments[s] ?? label(s)}
            </Badge>
          ))}
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Orders" value={p.stats.orders} hint={`${p.stats.open_orders} open · ${p.stats.orders_per_month}/month`} />
        <Stat label="Total purchases" value={inr(p.stats.total_value, 0)} hint={p.stats.avg_order_value ? `avg ${inr(p.stats.avg_order_value, 0)}` : undefined} />
        <Stat label="Last order" value={p.stats.last_order_at ? date(p.stats.last_order_at) : "never"} hint={p.stats.first_order_at ? `first ${date(p.stats.first_order_at)}` : undefined} />
        <Stat
          label="Balance due"
          value={credit?.balance !== undefined ? inr(credit.balance, 0) : "—"}
          tone={num(credit?.overdue) > 0 ? "bad" : "default"}
          hint={credit ? `${paymentTerms[credit.payment_terms] ?? credit.payment_terms}${num(credit.overdue) > 0 ? ` · overdue ${inr(credit.overdue, 0)}` : ""}` : undefined}
        />
      </div>

      <Tabs
        current={tab}
        items={[
          { key: "overview", label: "Details & terms", href: base },
          { key: "crm", label: `CRM & consent${p.activities?.length ? ` (${p.activities.length})` : ""}`, href: `${base}?tab=crm` },
          { key: "account", label: `Orders & account (${p.orders.length})`, href: `${base}?tab=account` },
          { key: "products", label: "Products & prices", href: `${base}?tab=products` },
        ]}
      />

      {tab === "overview" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            {c.status === "lead" ? (
              <Card title="Approve this lead?" description="Check the shop is genuine (visit, phone call, GSTIN). Approval gives wholesale prices and app access to people who registered it.">
                {canApprove ? (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <OpsForm fn="b2b_decide_customer" submitLabel="Approve customer" success="Customer approved">
                      <input type="hidden" name="p_customer_id" value={c.id} />
                      <input type="hidden" name="p_approve#bool" value="true" />
                      <Input label="Note (optional)" name="p_note" placeholder="Verified by visit" />
                    </OpsForm>
                    <OpsForm fn="b2b_decide_customer" submitLabel="Reject" variant="danger" success="Lead rejected" confirm="Reject this lead?">
                      <input type="hidden" name="p_customer_id" value={c.id} />
                      <input type="hidden" name="p_approve#bool" value="false" />
                      <Input label="Reason" name="p_note" required />
                    </OpsForm>
                  </div>
                ) : (
                  <Notice tone="warn">Waiting for a customer approver.</Notice>
                )}
              </Card>
            ) : c.decision_note ? (
              <Notice tone={c.status === "rejected" ? "bad" : "info"}>
                Decision note ({date(c.approved_at)}): {c.decision_note}
              </Notice>
            ) : null}

            <Card title="Customer details">
              {canEdit ? (
                <OpsForm fn="b2b_update_customer" submitLabel="Save details" success="Details saved" resetOnSuccess={false}>
                  <input type="hidden" name="p_customer_id" value={c.id} />
                  <Grid>
                    <Input label="Shop name" name="p.shop_name" defaultValue={c.shop_name} required />
                    <Input label="Owner / contact person" name="p.owner_name" defaultValue={c.owner_name} required />
                    <Input label="Mobile" name="p.mobile" defaultValue={c.mobile} required hint={c.mobile_verified ? "Verified" : "Not verified"} />
                    <Input label="WhatsApp" name="p.whatsapp" defaultValue={c.whatsapp ?? ""} />
                    <Input label="Email" name="p.email" type="email" defaultValue={c.email ?? ""} />
                    <Input label="Alternate contact" name="p.alternate_contact" defaultValue={c.alternate_contact ?? ""} />
                    <TextArea label="Business address" name="p.business_address" defaultValue={c.business_address ?? ""} />
                    <TextArea label="Delivery address" name="p.delivery_address" defaultValue={c.delivery_address ?? ""} />
                    <Input label="Locality" name="p.locality" defaultValue={c.locality ?? ""} />
                    <Input label="City" name="p.city" defaultValue={c.city} />
                    <Input label="Pincode" name="p.pincode" inputMode="numeric" maxLength={6} defaultValue={c.pincode ?? ""} />
                    <Input label="GSTIN" name="p.gstin" defaultValue={c.gstin ?? ""} className="uppercase" maxLength={15} />
                    <Select label="Customer type" name="p.customer_type" defaultValue={c.customer_type} options={Object.entries(customerTypes).map(([value, l]) => ({ value, label: l }))} />
                    <NumberInput label="Expected monthly purchase (₹)" name="p.expected_monthly_value#num" defaultValue={c.expected_monthly_value ?? ""} />
                    <Input label="Products they want" name="p.preferred_products" defaultValue={c.preferred_products ?? ""} />
                    <Select label="Preferred contact" name="p.preferred_channel" defaultValue={c.preferred_channel} options={preferredChannels} />
                    <Input label="Next follow-up" name="p.next_follow_up#date" type="date" defaultValue={c.next_follow_up ?? ""} />
                    <TextArea label="Business notes" name="p.business_notes" defaultValue={c.business_notes ?? ""} />
                  </Grid>
                  <Input label="Reason for the change (kept in the audit log)" name="p_reason" />
                </OpsForm>
              ) : (
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Detail k="Owner">{c.owner_name}</Detail>
                  <Detail k="Mobile">
                    {c.mobile} {c.mobile_verified ? "(verified)" : ""}
                  </Detail>
                  <Detail k="WhatsApp">{c.whatsapp}</Detail>
                  <Detail k="Email">{c.email}</Detail>
                  <Detail k="Business address">{c.business_address}</Detail>
                  <Detail k="Delivery address">{c.delivery_address}</Detail>
                  <Detail k="Pincode">{c.pincode}</Detail>
                  <Detail k="GSTIN">{c.gstin}</Detail>
                  <Detail k="Expected monthly">{c.expected_monthly_value ? inr(c.expected_monthly_value, 0) : ""}</Detail>
                  <Detail k="Products they want">{c.preferred_products}</Detail>
                  <Detail k="Next follow-up">{c.next_follow_up ? date(c.next_follow_up) : ""}</Detail>
                  <Detail k="Notes">{c.business_notes}</Detail>
                </dl>
              )}
            </Card>

            <Card title="App logins" description="People who can use the Mithai Wallah Wholesale app for this shop.">
              {p.logins?.length ? (
                <Table head={["Person", "Status", "Since", ""]}>
                  {p.logins.map((l) => (
                    <tr key={l.user_id}>
                      <Td>
                        {l.name ?? "—"}
                        <div className="text-xs text-dark/55">{[l.email, l.phone].filter(Boolean).join(" · ")}</div>
                        {l.request_note ? <div className="text-xs text-amber-800">Asked: {l.request_note}</div> : null}
                      </Td>
                      <Td>
                        <Badge tone={l.status === "active" ? "good" : l.status === "pending" ? "warn" : "muted"}>{l.status}</Badge>
                      </Td>
                      <Td>{date(l.created_at)}</Td>
                      <Td>
                        {canApprove ? (
                          <div className="flex flex-col gap-2">
                            {l.status !== "active" && isCustomer && c.status !== "inactive" ? (
                              <OpsForm fn="b2b_decide_login" submitLabel={l.status === "pending" ? "Approve" : "Restore"} inline success="Login approved">
                                <input type="hidden" name="p_user_id" value={l.user_id} />
                                <input type="hidden" name="p_customer_id" value={c.id} />
                                <input type="hidden" name="p_approve#bool" value="true" />
                              </OpsForm>
                            ) : null}
                            {l.status !== "revoked" ? (
                              <OpsForm fn="b2b_decide_login" submitLabel={l.status === "pending" ? "Decline" : "Revoke"} variant="secondary" inline success="Done">
                                <input type="hidden" name="p_user_id" value={l.user_id} />
                                <input type="hidden" name="p_customer_id" value={c.id} />
                                <input type="hidden" name="p_approve#bool" value="false" />
                                <Input label="Reason" name="p_note" required className="w-40" />
                              </OpsForm>
                            ) : null}
                          </div>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>Nobody uses the Wholesale app for this shop yet.</Empty>
              )}
              {p.invites?.length ? (
                <div className="mt-3 text-sm">
                  <p className="font-semibold">Invitations</p>
                  <ul className="text-dark/70">
                    {p.invites.map((i) => (
                      <li key={i.contact}>
                        {i.contact} · invited {date(i.invited_at)} · {i.accepted_at ? `signed in ${date(i.accepted_at)}` : "not signed in yet"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {canApprove && (c.status === "approved" || c.status === "suspended") ? (
                <div className="mt-3 border-t border-ink/10 pt-3">
                  <OpsForm fn="b2b_grant_login" submitLabel="Give app access" success="Access given (or invitation saved for their first sign-in)" inline>
                    <input type="hidden" name="p_customer_id" value={c.id} />
                    <Input label="Email or 10-digit mobile" name="p_contact" required className="w-64" />
                  </OpsForm>
                </div>
              ) : null}
            </Card>
          </div>

          <div className="flex flex-col gap-4">
            <Card title="Commercial terms">
              <dl className="mb-3 grid grid-cols-2 gap-2">
                <Detail k="Price category">{c.price_category}</Detail>
                <Detail k="Payment terms">{paymentTerms[c.payment_terms] ?? c.payment_terms}</Detail>
                <Detail k="Credit days">{String(c.credit_days)}</Detail>
                <Detail k="Credit limit">{c.credit_limit !== undefined ? inr(c.credit_limit, 0) : "hidden"}</Detail>
                <Detail k="Credit status">{label(c.credit_status)}</Detail>
                {credit?.available !== undefined ? <Detail k="Credit available">{inr(credit.available, 0)}</Detail> : null}
              </dl>
              {canPriceCategory ? (
                <OpsForm fn="b2b_set_terms" submitLabel="Change price category" variant="secondary" success="Price category saved" resetOnSuccess={false}>
                  <input type="hidden" name="p_customer_id" value={c.id} />
                  <Select label="Price category" name="p.price_category" defaultValue={c.price_category} options={categories.filter((x) => x.is_active || x.code === c.price_category).map((x) => ({ value: x.code, label: x.label }))} />
                  <Input label="Reason" name="p_reason" required />
                </OpsForm>
              ) : null}
              <div className="mt-3 border-t border-ink/10 pt-3">
                <p className="mb-2 text-xs font-semibold uppercase text-dark/55">Payment terms and credit — finance only</p>
                {canCredit ? (
                  <OpsForm fn="b2b_set_terms" submitLabel="Save credit terms" variant="secondary" success="Credit terms saved" resetOnSuccess={false}>
                    <input type="hidden" name="p_customer_id" value={c.id} />
                    <Select label="Payment terms" name="p.payment_terms" defaultValue={c.payment_terms} options={Object.entries(paymentTerms).map(([value, l]) => ({ value, label: l }))} />
                    <Grid>
                      <NumberInput label="Credit days" name="p.credit_days#int" step="1" defaultValue={c.credit_days} />
                      <NumberInput label="Credit limit (₹)" name="p.credit_limit#num" defaultValue={c.credit_limit ?? 0} />
                    </Grid>
                    <Select
                      label="Credit status"
                      name="p.credit_status"
                      defaultValue={c.credit_status}
                      options={[
                        { value: "none", label: "No credit" },
                        { value: "approved", label: "Approved" },
                        { value: "on_hold", label: "On hold" },
                      ]}
                    />
                    <Input label="Reason" name="p_reason" required />
                  </OpsForm>
                ) : (
                  <p className="text-sm text-dark/60">Only finance (sales approval) can change payment terms or credit. Salespeople can never raise a credit limit.</p>
                )}
              </div>
            </Card>

            {canAssign ? (
              <Card title="Salesperson">
                <OpsForm fn="b2b_assign_customers" submitLabel="Assign" variant="secondary" success="Assigned">
                  <input type="hidden" name="p_customer_ids#list" value={c.id} />
                  <Select
                    label="Assigned salesperson"
                    name="p_salesperson_id#json"
                    defaultValue={c.assigned_salesperson ? JSON.stringify(c.assigned_salesperson) : "null"}
                    options={[
                      { value: "null", label: "— not assigned —" },
                      ...salespeople.filter((s) => s.is_active || s.id === c.assigned_salesperson).map((s) => ({ value: JSON.stringify(s.id), label: s.full_name })),
                    ]}
                  />
                  <Input label="Reason (optional)" name="p_reason" />
                </OpsForm>
              </Card>
            ) : null}

            {canApprove && isCustomer ? (
              <Card title="Account status" description="Suspended shops cannot order; inactive shops are kept for history.">
                <OpsForm fn="b2b_set_status" submitLabel="Change status" variant="secondary" success="Status changed" confirm="Change this customer's status?">
                  <input type="hidden" name="p_customer_id" value={c.id} />
                  <Select
                    label="Status"
                    name="p_status"
                    defaultValue={c.status}
                    options={[
                      { value: "approved", label: "Active (approved)" },
                      { value: "suspended", label: "Suspended" },
                      { value: "inactive", label: "Inactive" },
                    ]}
                  />
                  <Input label="Reason" name="p_reason" required />
                </OpsForm>
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === "crm" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="flex flex-col gap-4 xl:col-span-2">
            <Card title="Timeline" description="Visits, calls, notes and complaints.">
              {p.activities?.length ? (
                <ol className="flex flex-col gap-3">
                  {p.activities.map((a) => (
                    <li key={a.id} className="border-l-2 border-ink/15 pl-3 text-sm">
                      <p className="font-semibold text-ink">
                        {activityKinds[a.kind] ?? label(a.kind)}
                        {a.outcome ? <span className="font-normal text-dark/70"> · {outcomes[a.outcome] ?? label(a.outcome)}</span> : null}
                      </p>
                      <p className="text-xs text-dark/55">
                        {dateTime(a.occurred_at)} · {a.by ?? "—"}
                        {a.has_location ? " · location saved" : ""}
                      </p>
                      {a.notes ? <p className="whitespace-pre-line">{a.notes}</p> : null}
                      {a.products_discussed ? <p className="text-dark/70">Products: {a.products_discussed}</p> : null}
                      {a.requirements ? <p className="text-dark/70">Needs: {a.requirements}</p> : null}
                      {a.price_enquiry ? <p className="text-dark/70">Price enquiry: {a.price_enquiry}</p> : null}
                      {a.sample_request ? <p className="text-dark/70">Sample: {a.sample_request}</p> : null}
                      {a.objections ? <p className="text-dark/70">Objections: {a.objections}</p> : null}
                      {a.opportunity_value ? <p className="text-dark/70">Opportunity: {inr(a.opportunity_value, 0)}</p> : null}
                      {a.next_action || a.follow_up_date ? (
                        <p className="text-dark/70">
                          Next: {a.next_action ?? ""} {a.follow_up_date ? `(${date(a.follow_up_date)})` : ""}
                        </p>
                      ) : null}
                    </li>
                  ))}
                </ol>
              ) : (
                <Empty>No activity recorded yet.</Empty>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            {canEdit || ops.can("field_sales", "create") ? (
              <Card title="Log activity">
                <OpsForm fn="b2b_log_activity" submitLabel="Save" success="Saved to the timeline">
                  <input type="hidden" name="p_customer_id" value={c.id} />
                  <Select label="What" name="p.kind" defaultValue="call" options={Object.entries(activityKinds).map(([value, l]) => ({ value, label: l }))} />
                  <Select label="Outcome" name="p.outcome" placeholder="—" options={Object.entries(outcomes).map(([value, l]) => ({ value, label: l }))} />
                  <TextArea label="Notes" name="p.notes" />
                  <Input label="Products discussed" name="p.products_discussed" />
                  <NumberInput label="Opportunity value (₹)" name="p.opportunity_value#num" />
                  <Input label="Next action" name="p.next_action" />
                  <Input label="Follow-up date" name="p.follow_up_date#date" type="date" min={todayIST()} />
                </OpsForm>
              </Card>
            ) : null}

            <Card title="Marketing consent" description="Only customers who agreed to a channel, and have not opted out, ever receive campaigns.">
              <p className="text-sm">
                {c.opted_out_at ? (
                  <Badge tone="bad">Opted out {date(c.opted_out_at)}</Badge>
                ) : c.marketing_consent ? (
                  <Badge tone="good">Agreed: {c.consent_channels.join(", ")}</Badge>
                ) : (
                  <Badge>No consent</Badge>
                )}
              </p>
              {c.consent_source ? (
                <p className="mt-1 text-xs text-dark/60">
                  Source: {c.consent_source} · {dateTime(c.consent_at)}
                </p>
              ) : null}
              {canConsent ? (
                <div className="mt-3 flex flex-col gap-4 border-t border-ink/10 pt-3">
                  <OpsForm fn="b2b_record_consent" submitLabel="Record consent" variant="secondary" success="Consent recorded">
                    <input type="hidden" name="p_customer_id" value={c.id} />
                    <input type="hidden" name="p_consent#bool" value="true" />
                    <input type="hidden" name="p_channels#list" value="" />
                    <fieldset className="flex flex-wrap gap-3 text-sm">
                      <legend className="mb-1 font-semibold text-ink">Channels the customer agreed to</legend>
                      {consentChannels.map((ch) => (
                        <label key={ch.value} className="flex items-center gap-2">
                          <input type="checkbox" name="p_channels#list" value={ch.value} defaultChecked={c.consent_channels.includes(ch.value)} className="h-4 w-4 accent-ink" />
                          {ch.label}
                        </label>
                      ))}
                    </fieldset>
                    <Input label="How did they agree?" name="p_source" required placeholder="Asked by phone, 12 Oct, owner said yes" />
                    <Input label="Note (optional)" name="p_note" />
                  </OpsForm>
                  {c.marketing_consent && !c.opted_out_at ? (
                    <OpsForm fn="b2b_record_consent" submitLabel="Record opt-out" variant="danger" success="Opt-out recorded" confirm="Record that this customer does not want marketing messages?">
                      <input type="hidden" name="p_customer_id" value={c.id} />
                      <input type="hidden" name="p_consent#bool" value="false" />
                      <Input label="How did they opt out?" name="p_source" required placeholder="WhatsApp STOP reply" />
                    </OpsForm>
                  ) : null}
                </div>
              ) : null}
              {p.consent_log?.length ? (
                <div className="mt-3 border-t border-ink/10 pt-3">
                  <p className="mb-1 text-xs font-semibold uppercase text-dark/55">History</p>
                  <ul className="flex flex-col gap-1 text-xs">
                    {p.consent_log.map((l, i) => (
                      <li key={i}>
                        {dateTime(l.at)} · {l.consent ? `agreed (${l.channels.join(", ")})` : "opted out"} · {l.source}
                        {l.note ? ` · ${l.note}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </Card>
          </div>
        </div>
      ) : null}

      {tab === "account" ? (
        <div className="flex flex-col gap-4">
          <Card title="Orders" description="Latest 50 orders.">
            {p.orders.length ? (
              <Table head={["Order", "Placed", "Channel", "Items", "Total", "Payment", "Status", "Invoice"]}>
                {p.orders.map((o) => (
                  <tr key={o.id}>
                    <Td>
                      <Link href={`/ops/b2b/orders/${o.id}`} className="font-semibold text-primary-dark hover:underline">
                        {o.order_no}
                      </Link>
                    </Td>
                    <Td>{dateTime(o.created_at)}</Td>
                    <Td>{channels[o.source]?.label ?? label(o.source)}</Td>
                    <Td right>{o.items}</Td>
                    <Td right>{inr(o.total, 0)}</Td>
                    <Td>{orderPaymentMethods[o.payment_method]?.split(" (")[0] ?? label(o.payment_method)}</Td>
                    <Td>
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(o.status)}`}>{o.status}</span>
                    </Td>
                    <Td>
                      {o.invoice_number ? (
                        <a href={`/invoice/${o.id}`} target="_blank" rel="noopener" className="text-primary-dark hover:underline">
                          {o.invoice_number}
                        </a>
                      ) : (
                        "—"
                      )}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No orders yet.</Empty>
            )}
          </Card>

          {canStatement ? (
            <Card
              title="Statement"
              description="From the ledger: invoices, receipts, credit notes and the running balance."
              actions={
                <form className="flex flex-wrap items-end gap-2">
                  <input type="hidden" name="tab" value="account" />
                  <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1.5 text-sm" />
                  <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1.5 text-sm" />
                  <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">Show</button>
                </form>
              }
            >
              {statement ? (
                <div className="flex flex-col gap-4">
                  <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                    <Stat label={`Opening ${date(statement.from)}`} value={inr(statement.opening, 0)} />
                    <Stat label={`Closing ${date(statement.to)}`} value={inr(statement.closing, 0)} />
                    <Stat label="Overdue" value={inr(statement.credit.overdue ?? 0, 0)} tone={num(statement.credit.overdue) > 0 ? "bad" : "default"} />
                    <Stat label="Credit available" value={statement.credit.available !== undefined ? inr(statement.credit.available, 0) : "—"} />
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold text-ink">Open invoices</h3>
                    {statement.open_invoices.length ? (
                      <Table head={["Invoice", "Order", "Date", "Due", "Total", "Outstanding"]} compact>
                        {statement.open_invoices.map((i) => (
                          <tr key={i.invoice_number}>
                            <Td>
                              <a href={`/invoice/${i.order_id}`} target="_blank" rel="noopener" className="text-primary-dark hover:underline">
                                {i.invoice_number}
                              </a>
                            </Td>
                            <Td>{i.order_no ?? "—"}</Td>
                            <Td>{date(i.invoice_date)}</Td>
                            <Td className={i.overdue ? "font-semibold text-accent-dark" : ""}>
                              {date(i.due_date)}
                              {i.overdue ? " · overdue" : ""}
                            </Td>
                            <Td right>{inr(i.total, 0)}</Td>
                            <Td right>{inr(i.outstanding, 0)}</Td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>No open invoices.</Empty>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold text-ink">Ledger</h3>
                    {statement.lines.length ? (
                      <Table head={["Date", "Entry", "What", "Debit", "Credit", "Balance"]} compact>
                        {statement.lines.map((l) => (
                          <tr key={`${l.entry_no}-${l.debit}-${l.credit}`}>
                            <Td>{date(l.date)}</Td>
                            <Td>
                              <span className="font-mono text-xs">{l.entry_no}</span>
                            </Td>
                            <Td>
                              {label(l.kind)}
                              <div className="text-xs text-dark/55">{l.memo}</div>
                            </Td>
                            <Td right>{num(l.debit) ? inr(l.debit, 0) : ""}</Td>
                            <Td right>{num(l.credit) ? inr(l.credit, 0) : ""}</Td>
                            <Td right>{inr(l.balance, 0)}</Td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>No ledger entries in this period.</Empty>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 font-semibold text-ink">Payments received</h3>
                    {statement.payments.length ? (
                      <Table head={["Receipt", "Date", "Amount", "Method", "Reference"]} compact>
                        {statement.payments.map((x) => (
                          <tr key={x.payment_no}>
                            <Td>{x.payment_no}</Td>
                            <Td>{date(x.paid_on)}</Td>
                            <Td right>{inr(x.amount, 0)}</Td>
                            <Td>{label(x.method)}</Td>
                            <Td>{x.reference}</Td>
                          </tr>
                        ))}
                      </Table>
                    ) : (
                      <Empty>No payments yet.</Empty>
                    )}
                  </div>
                </div>
              ) : (
                <Empty>The statement could not be loaded{statementRes.error ? `: ${statementRes.error.message}` : ""}.</Empty>
              )}
            </Card>
          ) : null}

          {canReceive ? (
            <Card title="Receive payment" description="Posts a receipt to the ledger. Without an order it settles the oldest open invoices first. Name an order for an advance payment.">
              <OpsForm fn="b2b_receive_payment" submitLabel="Record payment" idempotent success="Payment recorded" confirm="Record this payment?">
                <input type="hidden" name="p_customer_id" value={c.id} />
                <Grid cols={3}>
                  <NumberInput label="Amount (₹)" name="p_amount#num" required min="1" />
                  <Input label="Received on" name="p_paid_on#date" type="date" defaultValue={todayIST()} max={todayIST()} required />
                  <Select label="How" name="p_method" options={paymentMethods} defaultValue="upi" />
                  <Select label="Into account" name="p_account_code" options={accounts} required />
                  <Input label="Reference (UTR / cheque no.)" name="p_reference" />
                  <Select
                    label="Against order (advance)"
                    name="p_order_id"
                    placeholder="— oldest open invoices —"
                    options={p.orders.filter((o) => o.stage !== "cancelled").map((o) => ({ value: o.id, label: `${o.order_no} · ${inr(o.total, 0)} · ${o.status}` }))}
                  />
                </Grid>
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "products" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card
              title="Product availability for this customer"
              description="Default follows the product setting: open products are shown to everyone; restricted products only to customers allowed here. Hide removes a product just for this shop."
            >
              {items.length ? (
                <Table head={["Product", "Wholesale", "For this shop", ""]} compact>
                  {items.map((i) => {
                    const a = access.get(i.id);
                    const visible = i.b2b_enabled && (a === true || (a === undefined && !i.b2b_restricted));
                    return (
                      <tr key={i.id}>
                        <Td>
                          {i.name}
                          <div className="font-mono text-xs text-dark/55">{i.code}</div>
                        </Td>
                        <Td>{!i.b2b_enabled ? <Badge>not sold wholesale</Badge> : i.b2b_restricted ? <Badge tone="warn">restricted</Badge> : <Badge tone="good">open</Badge>}</Td>
                        <Td>
                          {a === true ? <Badge tone="good">allowed</Badge> : a === false ? <Badge tone="bad">hidden</Badge> : <Badge>default</Badge>}
                          <div className="text-xs text-dark/55">{visible ? "shown" : "not shown"}</div>
                        </Td>
                        <Td>
                          {canAccess ? (
                            <div className="flex flex-wrap gap-1">
                              {a !== true ? (
                                <OpsForm fn="pr_set_item_access" submitLabel="Allow" variant="secondary" inline success="Allowed">
                                  <input type="hidden" name="p_customer_id" value={c.id} />
                                  <input type="hidden" name="p_item_id" value={i.id} />
                                  <input type="hidden" name="p_allowed#bool" value="true" />
                                </OpsForm>
                              ) : null}
                              {a !== false ? (
                                <OpsForm fn="pr_set_item_access" submitLabel="Hide" variant="secondary" inline success="Hidden">
                                  <input type="hidden" name="p_customer_id" value={c.id} />
                                  <input type="hidden" name="p_item_id" value={i.id} />
                                  <input type="hidden" name="p_allowed#bool" value="false" />
                                </OpsForm>
                              ) : null}
                              {a !== undefined ? (
                                <OpsForm fn="pr_set_item_access" submitLabel="Default" variant="quiet" inline success="Back to default">
                                  <input type="hidden" name="p_customer_id" value={c.id} />
                                  <input type="hidden" name="p_item_id" value={i.id} />
                                </OpsForm>
                              ) : null}
                            </div>
                          ) : null}
                        </Td>
                      </tr>
                    );
                  })}
                </Table>
              ) : (
                <Empty>No sellable products.</Empty>
              )}
            </Card>
          </div>
          <div className="flex flex-col gap-4">
            <Card title="Favourite products">
              {p.favourites.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {p.favourites.map((f) => (
                    <li key={f.item_id}>
                      {f.name} · {qty(f.qty)} in {f.times} order(s) · last {date(f.last_at)}
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No orders yet.</Empty>
              )}
            </Card>
            <Card title="Special price requests" actions={ops.can("pricing") ? <Link href="/ops/b2b/pricing?tab=requests" className="text-sm font-semibold text-primary-dark hover:underline">Decide requests →</Link> : null}>
              {p.price_requests?.length ? (
                <ul className="flex flex-col gap-2 text-sm">
                  {p.price_requests.map((r) => (
                    <li key={r.id}>
                      <span className="font-semibold">{r.item}</span>: asked {inr(r.requested_price, 0)}
                      {r.current_price !== null ? ` (was ${inr(r.current_price, 0)})` : ""} ·{" "}
                      <Badge tone={r.status === "approved" ? "good" : r.status === "pending" ? "warn" : "muted"}>{r.status}</Badge>
                      {r.approved_price !== null ? ` at ${inr(r.approved_price, 0)}` : ""}
                      <div className="text-xs text-dark/55">
                        {dateTime(r.requested_at)}
                        {r.decision_note ? ` · ${r.decision_note}` : ""}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No price requests.</Empty>
              )}
            </Card>
          </div>
        </div>
      ) : null}
    </>
  );
}
