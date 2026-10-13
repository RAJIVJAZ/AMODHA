import { Card, Empty, PageHeader, Stat, Table, Td } from "@/components/ops/ui";
import { channels } from "@/lib/b2b/labels";
import { requireOps } from "@/lib/ops/context";
import { inr, param, pct, todayIST } from "@/lib/ops/format";
import { num, type Breakdown, type Performance, type SearchParams } from "../_lib";

export const metadata = { title: "Sales performance" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function ReportsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ops = await requireOps("sales_team");
  const sp = await searchParams;
  const today = todayIST();
  const from = DATE.test(param(sp.from) ?? "") ? (param(sp.from) as string) : `${today.slice(0, 8)}01`;
  const to = DATE.test(param(sp.to) ?? "") ? (param(sp.to) as string) : today;
  const [{ data: perf, error: e1 }, { data: br, error: e2 }] = await Promise.all([
    ops.supabase.rpc("b2b_sales_performance", { p_from: from, p_to: to }),
    ops.supabase.rpc("b2b_sales_breakdown", { p_from: from, p_to: to }),
  ]);
  const rows = (perf ?? []) as Performance[];
  const b = br as Breakdown | null;

  return (
    <>
      <PageHeader
        title="Sales performance"
        description="Orders a salesperson entered are credited to them. Orders shops place themselves are shown separately — never counted as the salesperson's entries. Cancelled orders are excluded."
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1.5 text-sm" />
              <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1.5 text-sm" />
              <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">Go</button>
            </form>
            {ops.can("sales_team", "export") ? (
              <a href={`/ops/b2b/export/sales-performance?from=${from}&to=${to}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
                Export
              </a>
            ) : null}
          </>
        }
      />
      {e1 || e2 ? <p className="mb-4 text-sm text-accent-dark">{(e1 ?? e2)?.message}</p> : null}
      {b ? (
        <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label="B2B sales" value={inr(b.totals.sales, 0)} />
          <Stat label="Orders" value={b.totals.orders} />
          <Stat label="Customers ordering" value={b.totals.customers} />
          <Stat label="Average order" value={inr(b.totals.avg_order, 0)} />
        </div>
      ) : null}
      <div className="flex flex-col gap-4">
        <Card title="By salesperson">
          {rows.length ? (
            <Table head={["Salesperson", "Leads / acquired", "Conversion", "Entered orders", "Direct from their shops", "Repeat / retained", "Visits", "Target", "Incentive", "Outstanding"]} compact>
              {rows.map((r) => (
                <tr key={r.salesperson_id}>
                  <Td>
                    {r.name}
                    <div className="text-xs text-dark/55">{r.employee_code} · {r.assigned_customers} shops</div>
                  </Td>
                  <Td right>{r.leads_added} / {r.customers_acquired}</Td>
                  <Td right>{pct(r.conversion_pct)}</Td>
                  <Td right>
                    {r.rep_orders} · {inr(r.rep_sales, 0)}
                    <div className="text-xs text-dark/55">avg {inr(r.rep_avg_order, 0)}</div>
                  </Td>
                  <Td right>{r.direct_orders_from_accounts} · {inr(r.direct_sales_from_accounts, 0)}</Td>
                  <Td right>{r.repeat_customers} / {r.retained_customers}</Td>
                  <Td right>{r.visits}</Td>
                  <Td right>
                    {num(r.target) ? `${inr(r.target, 0)} (${pct((num(r.rep_sales) * 100) / num(r.target))})` : "—"}
                  </Td>
                  <Td right>
                    {inr(r.incentive)}
                    <div className="text-xs text-dark/55">{r.incentive_pct}% of {r.incentive_basis === "account_sales" ? "shop sales" : "entered orders"}</div>
                  </Td>
                  <Td right>{r.outstanding === null ? "—" : inr(r.outstanding, 0)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No salespeople yet.</Empty>
          )}
        </Card>
        {b ? (
          <div className="grid gap-4 xl:grid-cols-3">
            <Card title="By channel (all orders)">
              <Table head={["Channel", "Orders", "Sales"]} compact>
                {b.by_channel.map((c) => (
                  <tr key={c.source}>
                    <Td>{channels[c.source]?.code ?? c.source}</Td>
                    <Td right>{c.orders}</Td>
                    <Td right>{inr(c.sales, 0)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="By product (B2B)">
              <Table head={["Product", "Qty", "Sales"]} compact>
                {b.by_product.map((p) => (
                  <tr key={p.sku}>
                    <Td>{p.product}<div className="text-xs text-dark/55">{p.sku}</div></Td>
                    <Td right>{p.qty}</Td>
                    <Td right>{inr(p.sales, 0)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
            <Card title="By area (B2B)">
              <Table head={["Area", "Shops", "Orders", "Sales"]} compact>
                {b.by_area.map((a) => (
                  <tr key={a.city + a.locality}>
                    <Td>{a.locality}, {a.city}</Td>
                    <Td right>{a.customers}</Td>
                    <Td right>{a.orders}</Td>
                    <Td right>{inr(a.sales, 0)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          </div>
        ) : null}
      </div>
    </>
  );
}
