import Link from "next/link";
import { Badge, Card, Empty, PageHeader, StatusBadge, Table, Td } from "@/components/ops/ui";
import { requireOps, type OpsModule } from "@/lib/ops/context";
import { date, inr, param, pct, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Operational reports" };

type Batch = {
  id: string; batch_no: string; production_date: string; status: string; planned_qty: number; output_qty: number | null; finished_qty: number | null; yield_pct: number | null;
  yield_flag: boolean; total_cost: number | null; cost_per_unit: number | null; products: { name: string; base_unit: string } | null;
};
type Collection = { supplier_id: string; qty_accepted: number; qty_rejected: number; fat_pct: number | null; snf_pct: number | null; amount: number; suppliers: { name: string; code: string } | null };

const exportsList: { report: string; title: string; description: string; module: OpsModule; dated: "range" | "day" }[] = [
  { report: "production-batches", title: "Production batches", description: "Output, yield, QC and cost per batch", module: "production", dated: "range" },
  { report: "milk-collections", title: "Milk collection register", description: "Every collection with fat, SNF, rate and amount", module: "procurement", dated: "range" },
  { report: "stock", title: "Stock summary", description: "On hand, reserved, available and value per item (today)", module: "inventory", dated: "range" },
  { report: "dispatch-sheet", title: "Dispatch sheet", description: "Orders due for dispatch on the day, with items and cash to collect", module: "dispatch", dated: "day" },
  { report: "subscription-deliveries", title: "Milk delivery list", description: "Subscriber deliveries for the day by area and slot", module: "subscriptions", dated: "day" },
  { report: "sales-register", title: "Sales register", description: "Tax invoices issued", module: "sales", dated: "range" },
  { report: "purchase-register", title: "Purchase register", description: "Supplier bills with GST", module: "purchases", dated: "range" },
  { report: "expenses", title: "Expenses", description: "All expenses with status", module: "expenses", dated: "range" },
];

export default async function OperationalReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("dashboard");
  const sp = await searchParams;
  const today = todayIST();
  const from = param(sp.from) ?? `${today.slice(0, 8)}01`;
  const to = param(sp.to) ?? today;
  const day = param(sp.date) ?? today;

  const [{ data: batchData }, { data: milkData }] = await Promise.all([
    ops.can("production")
      ? ops.supabase
          .from("production_batches")
          .select("id, batch_no, production_date, status, planned_qty, output_qty, finished_qty, yield_pct, yield_flag, total_cost, cost_per_unit, products(name, base_unit)")
          .gte("production_date", from)
          .lte("production_date", to)
          .order("production_date", { ascending: false })
          .limit(300)
      : Promise.resolve({ data: [] }),
    ops.can("procurement")
      ? ops.supabase.from("milk_collections").select("supplier_id, qty_accepted, qty_rejected, fat_pct, snf_pct, amount, suppliers(name, code)").eq("status", "posted").gte("collected_on", from).lte("collected_on", to)
      : Promise.resolve({ data: [] }),
  ]);
  const batches = (batchData ?? []) as unknown as Batch[];
  const collections = (milkData ?? []) as unknown as Collection[];

  // Milk by farmer, with fat and SNF weighted by accepted litres.
  const farmers = new Map<string, { name: string; code: string; litres: number; rejected: number; fatL: number; snfL: number; withFat: number; withSnf: number; amount: number; count: number }>();
  for (const c of collections) {
    const f = farmers.get(c.supplier_id) ?? { name: c.suppliers?.name ?? "", code: c.suppliers?.code ?? "", litres: 0, rejected: 0, fatL: 0, snfL: 0, withFat: 0, withSnf: 0, amount: 0, count: 0 };
    const l = Number(c.qty_accepted);
    f.litres += l;
    f.rejected += Number(c.qty_rejected);
    if (c.fat_pct !== null) {
      f.fatL += Number(c.fat_pct) * l;
      f.withFat += l;
    }
    if (c.snf_pct !== null) {
      f.snfL += Number(c.snf_pct) * l;
      f.withSnf += l;
    }
    f.amount += Number(c.amount);
    f.count += 1;
    farmers.set(c.supplier_id, f);
  }
  const completed = batches.filter((b) => b.yield_pct !== null);
  const avgYield = completed.length ? completed.reduce((s, b) => s + Number(b.yield_pct), 0) / completed.length : null;
  const allowed = exportsList.filter((e) => ops.can(e.module, "export"));

  return (
    <>
      <PageHeader
        title="Operational reports"
        description="Production, milk procurement and delivery figures for the period, and CSV exports for each register."
        actions={
          <form className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
            <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
            <button className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-ink/15">Show</button>
          </form>
        }
      />
      <div className="flex flex-col gap-4">
        {allowed.length ? (
          <Card title="Downloads (CSV)" description={`Period ${date(from)} – ${date(to)}; day reports use ${date(day)}. Downloads are recorded in the audit log.`}>
            <form className="mb-3 flex items-center gap-2 text-sm">
              <input type="hidden" name="from" value={from} />
              <input type="hidden" name="to" value={to} />
              <label className="font-semibold text-ink" htmlFor="report-day">
                Day for day reports
              </label>
              <input id="report-day" type="date" name="date" defaultValue={day} className="rounded-lg border-2 border-ink/15 px-2 py-1" />
              <button className="rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-ink/15">Set</button>
            </form>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {allowed.map((e) => (
                <a
                  key={e.report}
                  href={`/ops/export/${e.report}?${e.dated === "day" ? `date=${day}` : `from=${from}&to=${to}`}`}
                  className="rounded-xl border-2 border-ink/10 bg-white p-3 hover:border-primary"
                >
                  <p className="font-semibold text-ink">{e.title} ↓</p>
                  <p className="text-xs text-dark/60">{e.description}</p>
                </a>
              ))}
            </div>
            {ops.can("reports", "export") ? (
              <p className="mt-3 text-xs text-dark/55">
                Profit &amp; loss, trial balance, GST summary and product margins are exported from{" "}
                <Link href="/ops/finance/reports" className="font-semibold text-primary-dark hover:underline">
                  Financial reports
                </Link>
                .
              </p>
            ) : null}
          </Card>
        ) : null}

        {ops.can("production") ? (
          <Card title="Production batches" description={avgYield !== null ? `Average yield ${pct(avgYield)} across ${completed.length} completed batches.` : undefined}>
            {batches.length ? (
              <Table head={["Batch", "Date", "Product", "Planned", "Output", "Finished", "Yield", "Cost / unit", "Status"]} compact>
                {batches.map((b) => (
                  <tr key={b.id}>
                    <Td>
                      <Link href={`/ops/production/${b.id}`} className="font-semibold text-primary-dark hover:underline">
                        {b.batch_no}
                      </Link>
                    </Td>
                    <Td>{date(b.production_date)}</Td>
                    <Td>{b.products?.name}</Td>
                    <Td right>{qty(b.planned_qty, b.products?.base_unit)}</Td>
                    <Td right>{b.output_qty !== null ? qty(b.output_qty) : "—"}</Td>
                    <Td right>{b.finished_qty !== null ? qty(b.finished_qty) : "—"}</Td>
                    <Td right>
                      {pct(b.yield_pct)} {b.yield_flag ? <Badge tone="bad">low</Badge> : null}
                    </Td>
                    <Td right>{b.cost_per_unit !== null ? inr(b.cost_per_unit) : "—"}</Td>
                    <Td>
                      <StatusBadge status={b.status} />
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No batches in this period.</Empty>
            )}
          </Card>
        ) : null}

        {ops.can("procurement") ? (
          <Card title="Milk by farmer" description="Fat and SNF are averaged by accepted litres.">
            {farmers.size ? (
              <Table head={["Farmer", "Collections", "Accepted L", "Rejected L", "Avg fat %", "Avg SNF %", "Amount"]} compact>
                {[...farmers.entries()]
                  .sort((a, b) => b[1].litres - a[1].litres)
                  .map(([id, f]) => (
                    <tr key={id}>
                      <Td>
                        {f.name} <span className="text-dark/50">{f.code}</span>
                      </Td>
                      <Td right>{f.count}</Td>
                      <Td right>{qty(f.litres)}</Td>
                      <Td right>{f.rejected ? qty(f.rejected) : "—"}</Td>
                      <Td right>{f.withFat ? (f.fatL / f.withFat).toFixed(2) : "—"}</Td>
                      <Td right>{f.withSnf ? (f.snfL / f.withSnf).toFixed(2) : "—"}</Td>
                      <Td right>{inr(f.amount)}</Td>
                    </tr>
                  ))}
              </Table>
            ) : (
              <Empty>No milk collected in this period.</Empty>
            )}
          </Card>
        ) : null}
      </div>
    </>
  );
}
