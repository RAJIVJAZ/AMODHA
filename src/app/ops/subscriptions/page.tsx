import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Notice, NumberInput, PageHeader, Select, Stat, StatusBadge, Table, Tabs, Td, Input } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, label, param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Milk subscriptions" };

type Demand = {
  date: string; locked: boolean; deliveries: number; skipped: number; paused: number;
  items: { item: string; code: string; qty: number; regular: number | null; extra: number | null; addon: number | null }[];
  by_area: { pincode: string; slot: string; deliveries: number }[];
};
type Sub = { id: string; user_id: string; status: string; qty_units: number; frequency: string; slot: string; customer_name: string; phone: string; address: string; pincode: string;
  start_date: string; pause_from: string | null; pause_until: string | null; payment_preference: string; bottle_arrangement: string; items: { name: string } | null };
type Interest = { id: string; name: string; phone: string; area: string; daily_litres: number | null; timing: string | null; status: string; created_at: string };

export default async function SubscriptionsAdminPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("subscriptions");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "demand";
  const day = param(sp.date) ?? todayIST(1);

  const [{ data: demandData }, { data: subs }, { data: interest }, { data: bottles }, { data: enabledSetting }, { data: milkProducts }, { data: catalogue }] = await Promise.all([
    tab === "demand" ? ops.supabase.rpc("sub_daily_demand", { p_date: day }) : Promise.resolve({ data: null }),
    ops.supabase
      .from("subscriptions")
      .select("id, user_id, status, qty_units, frequency, slot, customer_name, phone, address, pincode, start_date, pause_from, pause_until, payment_preference, bottle_arrangement, items(name)")
      .order("status")
      .order("created_at", { ascending: false })
      .limit(500),
    ops.supabase.from("milk_interest").select("id, name, phone, area, daily_litres, timing, status, created_at").neq("status", "cancelled").order("created_at", { ascending: false }).limit(500),
    tab === "bottles" ? ops.supabase.from("bottle_ledger").select("user_id, issued, returned, damaged") : Promise.resolve({ data: [] }),
    ops.supabase.rpc("setting", { p_key: "subscriptions.enabled" }),
    ops.supabase.from("products").select("id, name").eq("is_subscribable", true).eq("is_active", true).order("sort_order"),
    ops.supabase.rpc("sub_catalogue"),
  ]);
  const milkPacks = ((catalogue as { milk?: unknown[] } | null)?.milk ?? []).length;
  const milkProductList = (milkProducts ?? []) as { id: string; name: string }[];
  const demand = demandData as Demand | null;
  const subscriptions = (subs ?? []) as unknown as Sub[];
  const activeCount = subscriptions.filter((s) => s.status === "active").length;
  const bottleTotals = new Map<string, number>();
  for (const b of (bottles ?? []) as { user_id: string; issued: number; returned: number; damaged: number }[]) {
    bottleTotals.set(b.user_id, (bottleTotals.get(b.user_id) ?? 0) + b.issued - b.returned - b.damaged);
  }

  return (
    <>
      <PageHeader title="Milk subscriptions" description="Tomorrow's milk demand, subscribers, the interest list and glass bottles." />
      {enabledSetting !== true ? (
        <div className="mb-4">
          <Notice tone="warn">Subscriptions are not open to customers yet (Settings → &ldquo;Milk subscriptions open to customers&rdquo;). Staff can still test them.</Notice>
        </div>
      ) : null}
      {catalogue && milkPacks === 0 ? (
        <div className="mb-4">
          <Notice tone="warn">
            Customers can&apos;t subscribe or see a milk price yet: there is no active milk pack size with a price.{" "}
            {milkProductList.length ? (
              <>
                Open{" "}
                {milkProductList.map((p, i) => (
                  <span key={p.id}>
                    {i ? ", " : ""}
                    <a href={`/ops/catalog/products/${p.id}`} className="font-semibold underline">
                      {p.name}
                    </a>
                  </span>
                ))}{" "}
                and add a pack size (e.g. 1 L glass bottle) with its selling price. Made-by-us products need a packaging configuration for the pack first.
              </>
            ) : (
              <>Add the milk product under Products &amp; recipes, tick &ldquo;Milk subscription product&rdquo;, then add a 1 L pack size with its price.</>
            )}
          </Notice>
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Active subscriptions" value={activeCount} />
        <Stat label="Interest registrations" value={(interest ?? []).length} hint="Launch target: 50 households" tone={(interest ?? []).length >= 50 ? "good" : "default"} />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "demand", label: "Daily demand", href: `/ops/subscriptions?date=${day}` },
          { key: "subscribers", label: "Subscribers", href: "/ops/subscriptions?tab=subscribers" },
          { key: "interest", label: "Interest list", href: "/ops/subscriptions?tab=interest" },
          { key: "bottles", label: "Bottles", href: "/ops/subscriptions?tab=bottles" },
        ]}
      />

      {tab === "demand" && demand ? (
        <div className="flex flex-col gap-4">
          <Card
            title={`Deliveries for ${date(day)}`}
            description={demand.locked ? "Changes for this day are closed. Lock it to create the delivery orders." : "Customers can still change this day until the cut-off."}
            actions={
              <form className="flex items-center gap-2">
                <input type="date" name="date" defaultValue={day} aria-label="Delivery date" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
                <button className="rounded-lg bg-white px-3 py-1 text-sm font-semibold ring-1 ring-ink/15">Show</button>
              </form>
            }
          >
            <div className="mb-3 grid grid-cols-3 gap-3">
              <Stat label="Deliveries" value={demand.deliveries} />
              <Stat label="Skipped" value={demand.skipped} />
              <Stat label="Paused" value={demand.paused} />
            </div>
            {demand.items.length ? (
              <Table head={["Product", "Total", "Regular", "Extra", "Add-on"]}>
                {demand.items.map((i) => (
                  <tr key={i.code}>
                    <Td>{i.item}</Td>
                    <Td right className="font-semibold">
                      {i.qty}
                    </Td>
                    <Td right>{i.regular ?? 0}</Td>
                    <Td right>{i.extra ?? 0}</Td>
                    <Td right>{i.addon ?? 0}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No deliveries scheduled for this day.</Empty>
            )}
            {demand.by_area.length ? (
              <div className="mt-3">
                <Table head={["Pincode", "Slot", "Deliveries"]} compact>
                  {demand.by_area.map((a) => (
                    <tr key={`${a.pincode}-${a.slot}`}>
                      <Td>{a.pincode}</Td>
                      <Td>{a.slot}</Td>
                      <Td right>{a.deliveries}</Td>
                    </tr>
                  ))}
                </Table>
              </div>
            ) : null}
            {ops.can("dispatch", "create") && demand.deliveries > 0 ? (
              <div className="mt-4">
                <OpsForm
                  fn="sub_lock_day"
                  submitLabel={demand.locked ? "Lock day and create delivery orders" : "Lock early (approver only)"}
                  confirm="Create the delivery orders for this day? Customers can no longer change it."
                  success="Delivery orders created — they are now in the dispatch queue"
                >
                  <input type="hidden" name="p_date#date" value={day} />
                </OpsForm>
              </div>
            ) : null}
          </Card>
        </div>
      ) : null}

      {tab === "subscribers" ? (
        <Card>
          {subscriptions.length ? (
            <Table head={["Customer", "Milk", "Schedule", "Area", "Since", "Payment", "Status"]}>
              {subscriptions.map((s) => (
                <tr key={s.id}>
                  <Td>
                    {s.customer_name}
                    <div className="text-xs text-dark/55">{s.phone}</div>
                  </Td>
                  <Td>
                    {s.qty_units} × {s.items?.name}
                  </Td>
                  <Td>
                    {label(s.frequency)} · {s.slot}
                    {s.pause_from ? (
                      <div className="text-xs text-amber-700">
                        paused {date(s.pause_from)}
                        {s.pause_until ? ` – ${date(s.pause_until)}` : ""}
                      </div>
                    ) : null}
                  </Td>
                  <Td>
                    {s.pincode}
                    <div className="max-w-48 truncate text-xs text-dark/55">{s.address}</div>
                  </Td>
                  <Td>{date(s.start_date)}</Td>
                  <Td>{label(s.payment_preference)}</Td>
                  <Td>
                    <StatusBadge status={s.status} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No subscriptions yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "interest" ? (
        <Card title="Website interest registrations">
          {(interest ?? []).length ? (
            <Table head={["Name", "Phone", "Area", "Daily litres", "Timing", "Registered", "Status"]}>
              {((interest ?? []) as Interest[]).map((i) => (
                <tr key={i.id}>
                  <Td>{i.name}</Td>
                  <Td>{i.phone}</Td>
                  <Td>{i.area}</Td>
                  <Td right>{i.daily_litres ?? "—"}</Td>
                  <Td>{i.timing}</Td>
                  <Td>{date(i.created_at)}</Td>
                  <Td>
                    <Badge tone={i.status === "active" ? "good" : "info"}>{i.status}</Badge>
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No registrations yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "bottles" ? (
        <div className="flex flex-col gap-4">
          <Card title="Bottles with customers">
            {subscriptions.filter((s) => s.bottle_arrangement === "returnable_glass").length ? (
              <Table head={["Customer", "Phone", "Bottles out"]}>
                {[...new Map(subscriptions.filter((s) => s.bottle_arrangement === "returnable_glass").map((s) => [s.user_id, s])).values()].map((s) => (
                  <tr key={s.user_id}>
                    <Td>{s.customer_name}</Td>
                    <Td>{s.phone}</Td>
                    <Td right>{bottleTotals.get(s.user_id) ?? 0}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No glass-bottle subscribers.</Empty>
            )}
          </Card>
          {ops.can("dispatch", "edit") && subscriptions.length ? (
            <Card title="Record bottles" description="Given with today's milk, returned empties, and damaged or lost bottles (charged only if a charge is set in Settings).">
              <OpsForm fn="sub_record_bottles" submitLabel="Save" success="Recorded">
                <Grid cols={4}>
                  <Select
                    label="Customer"
                    name="p_user_id"
                    required
                    placeholder="Choose…"
                    options={[...new Map(subscriptions.map((s) => [s.user_id, s])).values()].map((s) => ({ value: s.user_id, label: `${s.customer_name} (${s.phone})` }))}
                  />
                  <NumberInput label="Given" name="p_issued#int" defaultValue={0} step="1" />
                  <NumberInput label="Returned" name="p_returned#int" defaultValue={0} step="1" />
                  <NumberInput label="Damaged / lost" name="p_damaged#int" defaultValue={0} step="1" />
                </Grid>
                <Input label="Note" name="p_note" />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
