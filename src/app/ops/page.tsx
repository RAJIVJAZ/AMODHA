import Link from "next/link";
import { Card, Empty, Notice, PageHeader, Stat, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { inr, param, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Dashboard" };

type Range = { key: string; label: string; from: string; to: string };

function ranges(): Range[] {
  const today = todayIST();
  const [y, m] = today.split("-").map(Number);
  const monthStart = `${y}-${String(m).padStart(2, "0")}-01`;
  const prevY = m === 1 ? y - 1 : y;
  const prevM = m === 1 ? 12 : m - 1;
  const prevStart = `${prevY}-${String(prevM).padStart(2, "0")}-01`;
  const prevEnd = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  return [
    { key: "today", label: "Today", from: today, to: today },
    { key: "yesterday", label: "Yesterday", from: todayIST(-1), to: todayIST(-1) },
    { key: "7d", label: "Last 7 days", from: todayIST(-6), to: today },
    { key: "month", label: "This month", from: monthStart, to: today },
    { key: "prev", label: "Previous month", from: prevStart, to: prevEnd },
  ];
}

type Dashboard = Record<string, unknown> & {
  production_output?: { product: string; unit: string; qty: number }[];
  low_stock?: { code: string; name: string; available: number; reorder_level: number; unit: string }[];
  cash_and_bank?: { name: string; balance: number }[];
  profit?: Record<string, number>;
};

export default async function DashboardPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps();
  const sp = await searchParams;
  const all = ranges();
  const chosen = param(sp.range) ?? "today";
  const custom = chosen === "custom";
  const r = custom
    ? { key: "custom", label: "Custom", from: param(sp.from) ?? todayIST(), to: param(sp.to) ?? todayIST() }
    : (all.find((x) => x.key === chosen) ?? all[0]);
  const denied = param(sp.denied);

  if (!ops.can("dashboard")) {
    return (
      <>
        <PageHeader title="Welcome" description="Choose a section from the menu." />
        {denied ? <Notice tone="warn">You don&rsquo;t have access to {denied}.</Notice> : null}
      </>
    );
  }

  const { data, error } = await ops.supabase.rpc("ops_dashboard", { p_from: r.from, p_to: r.to });
  const d = (data ?? {}) as Dashboard;
  const has = (k: string) => k in d;
  const n = (k: string) => Number(d[k] ?? 0);

  return (
    <>
      <PageHeader
        title="Dashboard"
        description={`${r.label}: ${r.from === r.to ? r.from : `${r.from} to ${r.to}`}. Every figure comes from recorded transactions.`}
      />
      {denied ? (
        <div className="mb-4">
          <Notice tone="warn">You don&rsquo;t have access to {denied}. Ask the administrator if you need it.</Notice>
        </div>
      ) : null}
      {error ? <Notice tone="bad">{error.message}</Notice> : null}

      <form className="mb-6 flex flex-wrap items-end gap-2">
        {all.map((x) => (
          <Link
            key={x.key}
            href={`/ops?range=${x.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${x.key === r.key ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}
          >
            {x.label}
          </Link>
        ))}
        <input type="hidden" name="range" value="custom" />
        <input type="date" name="from" defaultValue={r.from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
        <input type="date" name="to" defaultValue={r.to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1 text-sm" />
        <button className="rounded-full bg-white px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/15">Custom range</button>
      </form>

      {has("profit") ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Money</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Sales (ex-GST)" value={inr(n("sales_period"), 0)} hint={`This month: ${inr(n("sales_month"), 0)}`} href="/ops/finance/reports" />
            <Stat label="Gross profit (approx.)" value={inr(d.profit?.gross_profit ?? 0, 0)} hint="Sales less cost of goods sold" />
            <Stat
              label="Operating profit (approx.)"
              value={inr(d.profit?.operating_profit ?? 0, 0)}
              tone={(d.profit?.operating_profit ?? 0) < 0 ? "bad" : "default"}
              hint="After recorded expenses"
            />
            <Stat label="Cash received" value={inr(d.profit?.cash_received ?? 0, 0)} hint="Not the same as profit" />
            <Stat label="Purchases" value={inr(n("purchases_period"), 0)} hint="Invoices + milk collections" href="/ops/finance/purchases" />
            <Stat label="Expenses" value={inr(n("expenses_period"), 0)} href="/ops/finance/expenses" />
            <Stat label="Customers owe" value={inr(n("receivables"), 0)} href="/ops/finance/sales" />
            <Stat label="We owe suppliers" value={inr(n("payables"), 0)} href="/ops/finance/purchases" />
          </div>
          {d.cash_and_bank?.length ? (
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              {d.cash_and_bank.map((a) => (
                <Stat key={a.name} label={a.name} value={inr(a.balance, 0)} href="/ops/finance/banking" />
              ))}
              {has("monthly_salary_commitment") ? <Stat label="Monthly salary commitment" value={inr(n("monthly_salary_commitment"), 0)} href="/ops/finance/payroll" /> : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {has("orders") ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Orders</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label="Orders" value={n("orders")} />
            <Stat label="Pending" value={n("orders_pending")} tone={n("orders_pending") > 0 ? "warn" : "default"} href="/ops/dispatch" />
            <Stat label="Awaiting dispatch" value={n("orders_awaiting_dispatch")} href="/ops/dispatch" />
            <Stat label="Delivered" value={n("deliveries_completed")} tone="good" />
            <Stat label="New customers" value={n("new_customers")} />
          </div>
        </section>
      ) : null}

      {has("active_batches") ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Factory</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Milk procured" value={qty(n("milk_procured_litres"), "L")} href="/ops/procurement" />
            <Stat label="Active batches" value={n("active_batches")} href="/ops/production" />
            <Stat label="Awaiting quality approval" value={n("batches_awaiting_qc")} tone={n("batches_awaiting_qc") > 0 ? "warn" : "default"} href="/ops/production?status=awaiting_qc" />
            <Stat label="Ready to release" value={n("batches_awaiting_release")} href="/ops/production?status=packaging_completed" />
          </div>
          <Card title="Production output" className="mt-3">
            {d.production_output?.length ? (
              <Table head={["Product", "Finished quantity"]}>
                {d.production_output.map((p) => (
                  <tr key={p.product}>
                    <Td>{p.product}</Td>
                    <Td right>{qty(p.qty, p.unit)}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No batches completed in this period.</Empty>
            )}
          </Card>
        </section>
      ) : null}

      {has("low_stock") ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Stock</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Raw & packaging value" value={inr(n("raw_material_value"), 0)} href="/ops/inventory" />
            <Stat label="Finished goods value" value={inr(n("finished_goods_value"), 0)} href="/ops/inventory?type=finished_good" />
            <Stat label="Near-expiry lots" value={n("near_expiry_lots")} tone={n("near_expiry_lots") > 0 ? "warn" : "default"} href="/ops/inventory?view=expiry" />
            <Stat label="Expired lots on hand" value={n("expired_lots")} tone={n("expired_lots") > 0 ? "bad" : "default"} href="/ops/inventory?view=expiry" />
          </div>
          <Card title="Low stock" className="mt-3">
            {d.low_stock?.length ? (
              <Table head={["Item", "Available", "Reorder level"]}>
                {d.low_stock.map((s) => (
                  <tr key={s.code}>
                    <Td>{s.name}</Td>
                    <Td right>{qty(s.available, s.unit)}</Td>
                    <Td right>{qty(s.reorder_level, s.unit)}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nothing below its reorder level.</Empty>
            )}
          </Card>
        </section>
      ) : null}

      {has("milk_interest") ? (
        <section className="mb-6">
          <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Milk subscription</h2>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Active subscribers" value={n("active_subscribers")} href="/ops/subscriptions" />
            <Stat label="Subscription deliveries" value={n("subscription_deliveries_period")} hint="Delivered in this period" />
            <Stat label="Subscription revenue" value={inr(n("subscription_revenue_period"), 0)} hint="Incl. GST, by delivery date" />
            <Stat label="Interest registrations" value={n("milk_interest")} hint="Launch needs 50" href="/ops/subscriptions" />
          </div>
        </section>
      ) : null}
    </>
  );
}
