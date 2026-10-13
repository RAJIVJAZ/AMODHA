import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, ButtonLink, Card, Empty, Input, Notice, PageHeader, Select, Table, Tabs, Td } from "@/components/ops/ui";
import { customerStatuses, customerTypes, segments } from "@/lib/b2b/labels";
import type { CustomerProfile, CustomerRow } from "@/lib/b2b/types";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, param } from "@/lib/ops/format";
import { customerFilters, fromSearchParams, qs, type SearchParams } from "../_lib";

export const metadata = { title: "B2B customers" };

type LinkRequest = {
  user_id: string;
  customer_id: string;
  status: string;
  request_note: string | null;
  created_at: string;
  b2b_customers: { id: string; customer_code: string; shop_name: string; status: string; mobile: string; city: string } | null;
};

const statusToneMap: Record<string, "good" | "warn" | "bad" | "muted" | "info"> = { lead: "warn", approved: "good", rejected: "bad", suspended: "bad", inactive: "muted" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ops = await requireOps("b2b_customers");
  const sp = await searchParams;
  const tab = ["all", "pending", "links", "followups"].includes(param(sp.tab) ?? "") ? (param(sp.tab) as string) : "all";
  const { search, filters } = customerFilters(fromSearchParams(sp));
  const listFilters: Record<string, string> = tab === "pending" ? { status: "lead" } : tab === "followups" ? { segment: "needs_follow_up" } : filters;

  const [listRes, { data: spData }, { data: itemData }, { data: linkData }, { count: pendingCount }] = await Promise.all([
    tab === "links" ? Promise.resolve({ data: [], error: null }) : ops.supabase.rpc("b2b_customer_list", { p_search: tab === "all" ? search || null : null, p_filters: listFilters, p_limit: 500 }),
    ops.supabase.from("salespeople").select("id, full_name, is_active").order("full_name"),
    tab === "all"
      ? ops.supabase.from("items").select("id, name, code").in("item_type", ["finished_good", "purchased_good"]).eq("b2b_enabled", true).order("name")
      : Promise.resolve({ data: [] }),
    ops.supabase
      .from("b2b_customer_users")
      .select("user_id, customer_id, status, request_note, created_at, b2b_customers(id, customer_code, shop_name, status, mobile, city)")
      .eq("status", "pending")
      .order("created_at"),
    ops.supabase.from("b2b_customers").select("id", { count: "exact", head: true }).eq("status", "lead"),
  ]);
  const rows = (listRes.data ?? []) as CustomerRow[];
  const salespeople = (spData ?? []) as { id: string; full_name: string; is_active: boolean }[];
  const items = (itemData ?? []) as { id: string; name: string; code: string }[];
  const links = (linkData ?? []) as unknown as LinkRequest[];

  // Contact details of people asking for a login come from each customer's record.
  const contacts = new Map<string, { email: string | null; phone: string | null; name: string | null }>();
  if (tab === "links" && links.length) {
    const ids = [...new Set(links.map((l) => l.customer_id))].slice(0, 40);
    const profiles = await Promise.all(ids.map((id) => ops.supabase.rpc("b2b_customer_profile", { p_customer_id: id })));
    for (const p of profiles) {
      for (const login of ((p.data as CustomerProfile | null)?.logins ?? [])) contacts.set(`${login.user_id}:${(p.data as CustomerProfile).customer.id}`, login);
    }
  }

  const canAssign = ops.can("b2b_customers", "edit") || ops.can("sales_team", "edit");
  const canApprove = ops.can("b2b_customers", "approve");
  const filterQs = qs({ q: search, ...filters });
  const salespersonOptions = salespeople.filter((s) => s.is_active).map((s) => ({ value: JSON.stringify(s.id), label: s.full_name }));
  const hasFilters = Boolean(search) || Object.keys(filters).length > 0;

  const table = (
    <Table head={[...(canAssign && tab !== "pending" ? [""] : []), "Customer", "Contact", "Area", "Type", "Status", "Salesperson", "Orders", "Last order", "Balance", "Follow-up", "Segments"]} compact>
      {rows.map((c) => (
        <tr key={c.id} className="hover:bg-blush/40">
          {canAssign && tab !== "pending" ? (
            <Td>
              <input type="checkbox" name="p_customer_ids#list" value={c.id} aria-label={`Select ${c.shop_name}`} className="h-4 w-4 accent-ink" />
            </Td>
          ) : null}
          <Td>
            <Link href={`/ops/b2b/customers/${c.id}`} className="font-semibold text-primary-dark hover:underline">
              {c.shop_name}
            </Link>
            <div className="font-mono text-xs text-dark/55">{c.customer_code}</div>
          </Td>
          <Td>
            {c.owner_name}
            <div className="text-xs text-dark/55">{c.mobile}</div>
          </Td>
          <Td>
            {c.locality ?? "—"}
            <div className="text-xs text-dark/55">{c.city}</div>
          </Td>
          <Td>{customerTypes[c.customer_type] ?? label(c.customer_type)}</Td>
          <Td>
            <Badge tone={statusToneMap[c.status] ?? "muted"}>{c.status === "lead" ? "lead · pending" : c.status}</Badge>
          </Td>
          <Td>{c.salesperson_name ?? <span className="text-dark/45">unassigned</span>}</Td>
          <Td right>
            {c.orders}
            <div className="text-xs text-dark/55">{inr(c.total_value, 0)}</div>
          </Td>
          <Td>{c.last_order_at ? date(c.last_order_at) : "never"}</Td>
          <Td right>{c.balance === null ? "—" : inr(c.balance, 0)}</Td>
          <Td>{c.next_follow_up ? date(c.next_follow_up) : "—"}</Td>
          <Td>
            <div className="flex max-w-56 flex-wrap gap-1">
              {c.segments
                .filter((s) => s !== "new_lead")
                .map((s) => (
                  <Badge key={s} tone={s === "needs_follow_up" || s === "outstanding_payment" ? "warn" : s === "inactive" ? "muted" : "info"}>
                    {segments[s] ?? label(s)}
                  </Badge>
                ))}
            </div>
          </Td>
        </tr>
      ))}
    </Table>
  );

  return (
    <>
      <PageHeader
        title="B2B customers"
        description="One customer master for the Sales app, the Wholesale app and the business app. Each shop keeps a stable customer code."
        actions={
          <>
            {ops.can("b2b_customers", "export") ? (
              <a href={`/ops/b2b/export/customers${tab === "all" ? filterQs : qs(listFilters)}`} className="inline-flex items-center rounded-lg border-2 border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink">
                Export CSV
              </a>
            ) : null}
            {ops.can("b2b_customers", "create") ? <ButtonLink href="/ops/b2b/customers/new">+ Add customer</ButtonLink> : null}
          </>
        }
      />
      <Tabs
        current={tab}
        items={[
          { key: "all", label: "All customers", href: "/ops/b2b/customers" },
          { key: "pending", label: `Pending approval${pendingCount ? ` (${pendingCount})` : ""}`, href: "/ops/b2b/customers?tab=pending" },
          { key: "links", label: `Login requests${links.length ? ` (${links.length})` : ""}`, href: "/ops/b2b/customers?tab=links" },
          { key: "followups", label: "Follow-ups due", href: "/ops/b2b/customers?tab=followups" },
        ]}
      />

      {listRes.error ? (
        <div className="mb-4">
          <Notice tone="bad">The customer list could not be loaded: {listRes.error.message}</Notice>
        </div>
      ) : null}

      {tab === "all" ? (
        <Card className="mb-4">
          <form className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" role="search">
            <Input label="Search" name="q" defaultValue={search} placeholder="Shop, owner, mobile, code, locality" />
            <Select label="Status" name="status" defaultValue={filters.status ?? ""} placeholder="Any" options={Object.entries(customerStatuses).map(([value, l]) => ({ value, label: l }))} />
            <Select label="Segment" name="segment" defaultValue={filters.segment ?? ""} placeholder="Any" options={Object.entries(segments).map(([value, l]) => ({ value, label: l }))} />
            <Select
              label="Salesperson"
              name="salesperson"
              defaultValue={filters.salesperson ?? ""}
              placeholder="Any"
              options={[{ value: "none", label: "— not assigned —" }, ...salespeople.map((s) => ({ value: s.id, label: s.full_name }))]}
            />
            <Input label="City" name="city" defaultValue={filters.city ?? ""} />
            <Input label="Locality" name="locality" defaultValue={filters.locality ?? ""} />
            <Select label="Customer type" name="customer_type" defaultValue={filters.customer_type ?? ""} placeholder="Any" options={Object.entries(customerTypes).map(([value, l]) => ({ value, label: l }))} />
            <Select label="Has bought product" name="product" defaultValue={filters.product ?? ""} placeholder="Any" options={items.map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }))} />
            <Input label="Last order before" name="last_order_before" type="date" defaultValue={filters.last_order_before ?? ""} hint="Includes shops that never ordered" />
            <Input label="Total purchases at least (₹)" name="min_value" inputMode="numeric" defaultValue={filters.min_value ?? ""} />
            <div className="flex items-end gap-2">
              <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Apply</button>
              {hasFilters ? (
                <Link href="/ops/b2b/customers" className="px-2 py-2 text-sm font-semibold text-primary-dark hover:underline">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </Card>
      ) : null}

      {tab === "links" ? (
        <Card title="Login requests" description="People who signed in to the Wholesale app and asked to use it for a shop. Approve only after checking with the shop owner.">
          {links.length ? (
            <Table head={["Customer", "Person", "Asked", "Note", ""]}>
              {links.map((l) => {
                const who = contacts.get(`${l.user_id}:${l.customer_id}`);
                return (
                  <tr key={`${l.user_id}:${l.customer_id}`}>
                    <Td>
                      <Link href={`/ops/b2b/customers/${l.customer_id}`} className="font-semibold text-primary-dark hover:underline">
                        {l.b2b_customers?.shop_name ?? "Customer"}
                      </Link>
                      <div className="text-xs text-dark/55">
                        {l.b2b_customers?.customer_code} · {l.b2b_customers?.status} · {l.b2b_customers?.mobile}
                      </div>
                    </Td>
                    <Td>
                      {who?.name ?? "—"}
                      <div className="text-xs text-dark/55">{[who?.email, who?.phone].filter(Boolean).join(" · ") || "contact not shown"}</div>
                    </Td>
                    <Td>{dateTime(l.created_at)}</Td>
                    <Td>{l.request_note ?? (l.b2b_customers?.status === "lead" ? "Registered the shop (approved with the shop)" : "")}</Td>
                    <Td>
                      {canApprove ? (
                        <div className="flex flex-col gap-2">
                          {l.b2b_customers?.status === "approved" || l.b2b_customers?.status === "suspended" ? (
                            <OpsForm fn="b2b_decide_login" submitLabel="Approve login" inline success="Login approved">
                              <input type="hidden" name="p_user_id" value={l.user_id} />
                              <input type="hidden" name="p_customer_id" value={l.customer_id} />
                              <input type="hidden" name="p_approve#bool" value="true" />
                            </OpsForm>
                          ) : (
                            <span className="text-xs text-dark/55">Approve the customer first</span>
                          )}
                          <OpsForm fn="b2b_decide_login" submitLabel="Decline" variant="secondary" inline success="Declined">
                            <input type="hidden" name="p_user_id" value={l.user_id} />
                            <input type="hidden" name="p_customer_id" value={l.customer_id} />
                            <input type="hidden" name="p_approve#bool" value="false" />
                            <Input label="Reason" name="p_note" required className="w-40" />
                          </OpsForm>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                );
              })}
            </Table>
          ) : (
            <Empty>No login requests waiting.</Empty>
          )}
        </Card>
      ) : (
        <Card
          title={`${tab === "pending" ? "Leads waiting for approval" : tab === "followups" ? "Follow-ups due today or earlier" : "Customers"} (${rows.length}${rows.length >= 500 ? "+" : ""})`}
          description={tab === "pending" ? "Open a lead to check the details, then approve or reject it." : undefined}
        >
          {rows.length ? (
            canAssign && tab !== "pending" ? (
              <OpsForm fn="b2b_assign_customers" submitLabel="Assign selected" success="Customers assigned" variant="secondary">
                <p className="text-sm text-dark/65">Tick customers, choose a salesperson and assign them in one go.</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Select
                    label="Assign to"
                    name="p_salesperson_id#json"
                    required
                    placeholder="Choose…"
                    options={[...salespersonOptions, { value: "null", label: "— remove salesperson —" }]}
                  />
                  <Input label="Reason (optional)" name="p_reason" />
                </div>
                {table}
              </OpsForm>
            ) : (
              table
            )
          ) : (
            <Empty>{tab === "pending" ? "No leads waiting." : tab === "followups" ? "No follow-ups due." : "No customers match."}</Empty>
          )}
        </Card>
      )}
    </>
  );
}
