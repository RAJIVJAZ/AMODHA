import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, Notice, NumberInput, PageHeader, Select, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, param, todayIST } from "@/lib/ops/format";
import { qs, UUID, type SearchParams } from "../_lib";

export const metadata = { title: "Wholesale pricing" };

type Item = {
  id: string; code: string; name: string; item_type: string; unit: string; is_active: boolean; sale_price: number | null; mrp: number | null;
  b2b_enabled: boolean; b2b_restricted: boolean; b2b_min_qty: number; b2b_qty_multiple: number; b2b_lead_days: number; b2b_stock_display: string;
  products: { name: string } | null; packaging_configs: { name: string } | null;
};
type Rule = {
  id: string; item_id: string; scope: string; price_category: string | null; customer_id: string | null; min_qty: number; price: number; valid_from: string; valid_to: string | null;
  note: string | null; source: string; approved_at: string | null; created_at: string;
  items: { name: string; code: string } | null; b2b_customers: { shop_name: string; customer_code: string } | null; price_categories: { label: string } | null;
};
type Category = { code: string; label: string; description: string | null; is_active: boolean; sort_order: number };
type PriceRequest = {
  id: string; customer_id: string; item_id: string; requested_price: number; current_price: number | null; min_qty: number; valid_to: string | null; reason: string;
  requested_by: string | null; requested_at: string; status: string; approved_price: number | null; decided_at: string | null; decision_note: string | null;
  items: { name: string; code: string } | null; b2b_customers: { shop_name: string; customer_code: string } | null;
};

const scopes = [
  { value: "standard", label: "Standard (all wholesale customers)" },
  { value: "category", label: "Price category" },
  { value: "customer", label: "One customer (approval)" },
  { value: "promotion", label: "Promotion (approval, needs end date)" },
];
const stockDisplay = [
  { value: "level", label: "In stock / limited" },
  { value: "exact", label: "Exact quantity" },
  { value: "hidden", label: "Hidden" },
];

export default async function PricingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ops = await requireOps("pricing");
  const sp = await searchParams;
  const tab = ["products", "rules", "categories", "requests"].includes(param(sp.tab) ?? "") ? (param(sp.tab) as string) : "products";
  const itemFilter = UUID.test(param(sp.item) ?? "") ? (param(sp.item) as string) : undefined;
  const today = todayIST();
  const canEdit = ops.can("pricing", "edit");
  const canWholesale = canEdit || ops.can("catalog", "edit");
  const canApprove = ops.can("pricing", "approve");

  let rulesQuery = ops.supabase
    .from("wholesale_prices")
    .select("id, item_id, scope, price_category, customer_id, min_qty, price, valid_from, valid_to, note, source, approved_at, created_at, items(name, code), b2b_customers(shop_name, customer_code), price_categories(label)")
    .is("ended_at", null)
    .or(`valid_to.is.null,valid_to.gte.${today}`)
    .order("item_id")
    .order("scope")
    .order("min_qty");
  if (itemFilter) rulesQuery = rulesQuery.eq("item_id", itemFilter);

  const [{ data: itemData }, { data: ruleData }, { data: catData }, { data: reqData }, { data: custData }, { data: spData }] = await Promise.all([
    ops.supabase
      .from("items")
      .select("id, code, name, item_type, unit, is_active, sale_price, mrp, b2b_enabled, b2b_restricted, b2b_min_qty, b2b_qty_multiple, b2b_lead_days, b2b_stock_display, products(name), packaging_configs(name)")
      .in("item_type", ["finished_good", "purchased_good"])
      .order("is_active", { ascending: false })
      .order("name"),
    tab === "products" || tab === "rules" ? rulesQuery : Promise.resolve({ data: [] }),
    ops.supabase.from("price_categories").select("code, label, description, is_active, sort_order").order("sort_order").order("code"),
    tab === "requests"
      ? ops.supabase
          .from("price_requests")
          .select("id, customer_id, item_id, requested_price, current_price, min_qty, valid_to, reason, requested_by, requested_at, status, approved_price, decided_at, decision_note, items(name, code), b2b_customers(shop_name, customer_code)")
          .order("requested_at", { ascending: false })
          .limit(100)
      : Promise.resolve({ data: [] }),
    tab === "rules" && canApprove
      ? ops.supabase.from("b2b_customers").select("id, shop_name, customer_code").in("status", ["approved", "suspended"]).order("shop_name").limit(1000)
      : Promise.resolve({ data: [] }),
    tab === "requests" ? ops.supabase.from("salespeople").select("user_id, full_name") : Promise.resolve({ data: [] }),
  ]);
  const items = (itemData ?? []) as unknown as Item[];
  const rules = (ruleData ?? []) as unknown as Rule[];
  const categories = (catData ?? []) as Category[];
  const requests = (reqData ?? []) as unknown as PriceRequest[];
  const customers = (custData ?? []) as { id: string; shop_name: string; customer_code: string }[];
  const reps = new Map(((spData ?? []) as { user_id: string | null; full_name: string }[]).filter((s) => s.user_id).map((s) => [s.user_id as string, s.full_name]));
  const pending = requests.filter((r) => r.status === "pending");

  const standard = new Map<string, number>();
  for (const r of rules) if (r.scope === "standard" && r.min_qty === 1 && r.valid_from <= today && !standard.has(r.item_id)) standard.set(r.item_id, Number(r.price));
  const ruleCount = new Map<string, number>();
  for (const r of rules) ruleCount.set(r.item_id, (ruleCount.get(r.item_id) ?? 0) + 1);
  const itemOptions = items.filter((i) => i.is_active).map((i) => ({ value: i.id, label: `${i.name} (${i.code})` }));
  const categoryOptions = categories.filter((c) => c.is_active).map((c) => ({ value: c.code, label: c.label }));

  return (
    <>
      <PageHeader
        title="Wholesale pricing"
        description="Prices are worked out only on the server: a customer pays the lowest rule that applies on the day for that quantity (standard, their category, their own price or a promotion). Prices are in whole rupees, GST included. Rules are never edited — a new rule replaces the old one."
      />
      <Tabs
        current={tab}
        items={[
          { key: "products", label: "Products", href: "/ops/b2b/pricing" },
          { key: "rules", label: "Price rules", href: "/ops/b2b/pricing?tab=rules" },
          { key: "categories", label: "Price categories", href: "/ops/b2b/pricing?tab=categories" },
          { key: "requests", label: `Special price requests${tab === "requests" && pending.length ? ` (${pending.length})` : ""}`, href: "/ops/b2b/pricing?tab=requests" },
        ]}
      />

      {tab === "products" ? (
        <Card title="Wholesale settings per product" description="Only products switched on for wholesale, with a standard price, appear in the Sales and Wholesale apps.">
          {items.length ? (
            <Table head={["Product", "Standard price", "Settings"]}>
              {items.map((i) => (
                <tr key={i.id} className={i.is_active ? "" : "opacity-60"}>
                  <Td>
                    <span className="font-semibold">{i.name}</span>
                    <div className="font-mono text-xs text-dark/55">{i.code}</div>
                    <div className="text-xs text-dark/55">
                      {i.products?.name}
                      {i.packaging_configs ? ` · ${i.packaging_configs.name}` : ""} · {label(i.item_type)}
                      {i.is_active ? "" : " · inactive"}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {i.b2b_enabled ? <Badge tone="good">wholesale on</Badge> : <Badge>wholesale off</Badge>}
                      {i.b2b_restricted ? <Badge tone="warn">restricted</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    {standard.has(i.id) ? <span className="font-semibold">{inr(standard.get(i.id), 0)}</span> : <Badge tone={i.b2b_enabled ? "bad" : "muted"}>no standard price</Badge>}
                    {i.sale_price ? <div className="text-xs text-dark/55">retail {inr(i.sale_price, 0)}</div> : null}
                    <div>
                      <Link href={`/ops/b2b/pricing${qs({ tab: "rules", item: i.id })}`} className="text-xs font-semibold text-primary-dark hover:underline">
                        {ruleCount.get(i.id) ?? 0} rule(s) →
                      </Link>
                    </div>
                  </Td>
                  <Td>
                    {canWholesale ? (
                      <OpsForm fn="pr_save_item_wholesale" submitLabel="Save" variant="secondary" inline success="Saved" resetOnSuccess={false}>
                        <input type="hidden" name="p_item_id" value={i.id} />
                        <Checkbox name="p.b2b_enabled#bool" label="Sell wholesale" defaultChecked={i.b2b_enabled} />
                        <Checkbox name="p.b2b_restricted#bool" label="Restricted" defaultChecked={i.b2b_restricted} />
                        <NumberInput label="Min qty" name="p.b2b_min_qty#int" step="1" min="1" defaultValue={i.b2b_min_qty} className="w-20" />
                        <NumberInput label="Multiple" name="p.b2b_qty_multiple#int" step="1" min="1" defaultValue={i.b2b_qty_multiple} className="w-20" />
                        <NumberInput label="Lead days" name="p.b2b_lead_days#int" step="1" min="0" defaultValue={i.b2b_lead_days} className="w-20" />
                        <Select label="Stock shown" name="p.b2b_stock_display" defaultValue={i.b2b_stock_display} options={stockDisplay} />
                      </OpsForm>
                    ) : (
                      <span className="text-xs text-dark/65">
                        Min {i.b2b_min_qty} · multiple {i.b2b_qty_multiple} · {i.b2b_lead_days} lead day(s) · stock {label(i.b2b_stock_display)}
                      </span>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No sellable products in the catalogue.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "rules" ? (
        <div className="flex flex-col gap-4">
          {canEdit ? (
            <Card title="Add a price rule" description="Standard and category prices: pricing editors. Customer prices and promotions need a pricing approver and are recorded as approved by you. A rule for the same product, target and quantity break replaces the current one.">
              <OpsForm fn="pr_save_price" submitLabel="Save price rule" success="Price rule saved">
                <Grid cols={3}>
                  <Select label="Product" name="p.item_id" required placeholder="Choose…" options={itemOptions} defaultValue={itemFilter ?? ""} />
                  <Select label="Applies to" name="p.scope" options={canApprove ? scopes : scopes.slice(0, 2)} defaultValue="standard" />
                  <Select label="Price category (for category / promotion)" name="p.price_category" placeholder="—" options={categoryOptions} />
                  {canApprove ? (
                    <Select label="Customer (for one customer)" name="p.customer_id" placeholder="—" options={customers.map((c) => ({ value: c.id, label: `${c.shop_name} (${c.customer_code})` }))} />
                  ) : null}
                  <NumberInput label="From quantity" name="p.min_qty#int" step="1" min="1" defaultValue={1} hint="1 for the base price; higher for a quantity break" />
                  <NumberInput label="Price per unit (₹, GST incl.)" name="p.price#num" step="1" min="0" required />
                  <Input label="Valid from" name="p.valid_from#date" type="date" defaultValue={today} />
                  <Input label="Valid to" name="p.valid_to#date" type="date" hint="Leave empty for no end (promotions need one)" />
                  <Input label="Note" name="p.note" />
                </Grid>
              </OpsForm>
            </Card>
          ) : null}
          <Card
            title={`Current and upcoming price rules (${rules.length})`}
            actions={
              <form className="flex items-end gap-2">
                <input type="hidden" name="tab" value="rules" />
                <select name="item" defaultValue={itemFilter ?? ""} aria-label="Product" className="max-w-64 rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm">
                  <option value="">All products</option>
                  {itemOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">Show</button>
              </form>
            }
          >
            {rules.length ? (
              <Table head={["Product", "Applies to", "From qty", "Price", "Valid", "Approved", "Note", ""]} compact>
                {rules.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      {r.items?.name}
                      <div className="font-mono text-xs text-dark/55">{r.items?.code}</div>
                    </Td>
                    <Td>
                      <Badge tone={r.scope === "promotion" ? "warn" : r.scope === "customer" ? "info" : "muted"}>{r.scope}</Badge>
                      <div className="text-xs">
                        {r.scope === "customer" ? `${r.b2b_customers?.shop_name ?? "customer"} (${r.b2b_customers?.customer_code ?? ""})` : null}
                        {r.price_category ? r.price_categories?.label ?? r.price_category : null}
                      </div>
                    </Td>
                    <Td right>{r.min_qty}</Td>
                    <Td right>{inr(r.price, 0)}</Td>
                    <Td>
                      {date(r.valid_from)} – {r.valid_to ? date(r.valid_to) : "no end"}
                      {r.valid_from > today ? <div><Badge tone="info">upcoming</Badge></div> : null}
                    </Td>
                    <Td>
                      {r.approved_at ? dateTime(r.approved_at) : "—"}
                      {r.source === "special_approval" ? <div className="text-xs text-dark/55">special request</div> : null}
                    </Td>
                    <Td>{r.note}</Td>
                    <Td>
                      {canEdit && (canApprove || !["customer", "promotion"].includes(r.scope)) ? (
                        <OpsForm fn="pr_end_price" submitLabel="End" variant="secondary" inline success="Rule ended" confirm="End this price rule today?">
                          <input type="hidden" name="p_price_id" value={r.id} />
                          <Input label="Reason" name="p_reason" required className="w-36" />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No price rules{itemFilter ? " for this product" : ""}.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "categories" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card title="Price categories" description="Customers are put in one category; category rules apply to everyone in it.">
              {categories.length ? (
                <Table head={["Category", "Edit"]}>
                  {categories.map((c) => (
                    <tr key={c.code}>
                      <Td>
                        <span className="font-semibold">{c.label}</span>
                        <div className="font-mono text-xs text-dark/55">{c.code}</div>
                        {c.is_active ? null : <Badge>inactive</Badge>}
                      </Td>
                      <Td>
                        {canEdit ? (
                          <OpsForm fn="pr_save_category" submitLabel="Save" variant="secondary" inline success="Saved" resetOnSuccess={false}>
                            <input type="hidden" name="p_code" value={c.code} />
                            <Input label="Name" name="p_label" defaultValue={c.label} required className="w-44" />
                            <Input label="Description" name="p_description" defaultValue={c.description ?? ""} className="w-56" />
                            <Checkbox name="p_active#bool" label="Active" defaultChecked={c.is_active} />
                          </OpsForm>
                        ) : (
                          <span className="text-sm text-dark/65">{c.description}</span>
                        )}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No categories.</Empty>
              )}
            </Card>
          </div>
          {canEdit ? (
            <Card title="New category">
              <OpsForm fn="pr_save_category" submitLabel="Add category" success="Category added">
                <Input label="Code" name="p_code" required pattern="[a-z][a-z0-9_]{1,30}" hint="Lower case, e.g. festive_bulk" />
                <Input label="Name" name="p_label" required />
                <Input label="Description" name="p_description" />
                <input type="hidden" name="p_active#bool" value="true" />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "requests" ? (
        <div className="flex flex-col gap-4">
          {!canApprove ? <Notice tone="info">Only pricing approvers can decide special price requests.</Notice> : null}
          <Card title="Waiting for a decision" description="Approving creates a customer price rule (whole rupees). Declining needs a reason the salesperson will see.">
            {pending.length ? (
              <Table head={["Customer", "Product", "Current", "Requested", "From qty", "Reason", "Requested by", "Decide"]}>
                {pending.map((r) => (
                  <tr key={r.id}>
                    <Td>
                      <Link href={`/ops/b2b/customers/${r.customer_id}?tab=products`} className="font-semibold text-primary-dark hover:underline">
                        {r.b2b_customers?.shop_name ?? "Customer"}
                      </Link>
                      <div className="text-xs text-dark/55">{r.b2b_customers?.customer_code}</div>
                    </Td>
                    <Td>
                      {r.items?.name}
                      <div className="font-mono text-xs text-dark/55">{r.items?.code}</div>
                    </Td>
                    <Td right>{r.current_price !== null ? inr(r.current_price, 0) : "—"}</Td>
                    <Td right>
                      <span className="font-semibold">{inr(r.requested_price, 0)}</span>
                      {r.current_price ? (
                        <div className="text-xs text-dark/55">{(((Number(r.requested_price) - Number(r.current_price)) / Number(r.current_price)) * 100).toFixed(1)}%</div>
                      ) : null}
                    </Td>
                    <Td right>{r.min_qty}</Td>
                    <Td>
                      {r.reason}
                      {r.valid_to ? <div className="text-xs text-dark/55">until {date(r.valid_to)}</div> : null}
                    </Td>
                    <Td>
                      {(r.requested_by && reps.get(r.requested_by)) || "Staff"}
                      <div className="text-xs text-dark/55">{dateTime(r.requested_at)}</div>
                    </Td>
                    <Td>
                      {canApprove ? (
                        <div className="flex flex-col gap-2">
                          <OpsForm fn="pr_decide_price_request" submitLabel="Approve" inline success="Approved — customer price saved">
                            <input type="hidden" name="p_request_id" value={r.id} />
                            <input type="hidden" name="p_approve#bool" value="true" />
                            <NumberInput label="Price ₹" name="p_price#num" step="1" defaultValue={r.requested_price} className="w-24" />
                            <Input label="From" name="p_valid_from#date" type="date" defaultValue={today} className="w-36" />
                            <Input label="Until" name="p_valid_to#date" type="date" defaultValue={r.valid_to ?? ""} className="w-36" />
                          </OpsForm>
                          <OpsForm fn="pr_decide_price_request" submitLabel="Decline" variant="secondary" inline success="Declined">
                            <input type="hidden" name="p_request_id" value={r.id} />
                            <input type="hidden" name="p_approve#bool" value="false" />
                            <Input label="Reason" name="p_note" required className="w-44" />
                          </OpsForm>
                        </div>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No requests waiting.</Empty>
            )}
          </Card>
          <Card title="Recently decided">
            {requests.filter((r) => r.status !== "pending").length ? (
              <Table head={["Customer", "Product", "Requested", "Decision", "When", "Note"]} compact>
                {requests
                  .filter((r) => r.status !== "pending")
                  .map((r) => (
                    <tr key={r.id}>
                      <Td>{r.b2b_customers?.shop_name}</Td>
                      <Td>{r.items?.name}</Td>
                      <Td right>{inr(r.requested_price, 0)}</Td>
                      <Td>
                        <Badge tone={r.status === "approved" ? "good" : "muted"}>{r.status}</Badge>
                        {r.approved_price !== null ? ` ${inr(r.approved_price, 0)}` : ""}
                      </Td>
                      <Td>{dateTime(r.decided_at)}</Td>
                      <Td>{r.decision_note}</Td>
                    </tr>
                  ))}
              </Table>
            ) : (
              <Empty>Nothing decided yet.</Empty>
            )}
          </Card>
        </div>
      ) : null}
    </>
  );
}
