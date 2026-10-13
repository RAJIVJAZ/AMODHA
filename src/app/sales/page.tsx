import Link from "next/link";
import { BigButton, EmptyNote, Section, Tile } from "@/components/b2b/sales-ui";
import { requireSales, rpc } from "@/lib/b2b/sales";
import { date, dateTime, inr, param, todayIST } from "@/lib/ops/format";
import { activityKinds, outcomes } from "@/lib/b2b/labels";

export const metadata = { title: "Today" };

type Dashboard = {
  salesperson: { name: string; employee_code: string; territories: string[]; can_view_outstanding: boolean };
  period: { from: string; to: string };
  assigned_customers: number;
  new_leads: number;
  leads_added: number;
  orders_placed: number;
  sales_value: number;
  direct_orders_from_my_accounts: number;
  awaiting_processing: number;
  dispatched: number;
  delivered: number;
  month_sales: number;
  target: { value: number; orders: number; new_customers: number; achieved_pct: number | null } | null;
  outstanding: number | null;
  todays_visits: { id: string; shop_name: string; locality: string | null; customer_code: string; next_follow_up: string; status: string }[];
  not_ordered_recently: { id: string; shop_name: string; locality: string | null; last_order_at: string | null }[];
  recent_visits: { customer_id: string; shop_name: string; kind: string; outcome: string | null; occurred_at: string }[];
  pending_price_requests: number;
};

function range(key: string, from?: string, to?: string) {
  const today = todayIST();
  if (key === "week") {
    const d = new Date(`${today}T00:00:00+05:30`);
    const back = (d.getUTCDay() + 6) % 7; // Monday
    return { from: todayIST(-back), to: today };
  }
  if (key === "month") return { from: `${today.slice(0, 8)}01`, to: today };
  if (key === "custom" && from && to && /^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to)) return { from, to };
  return { from: today, to: today };
}

export default async function SalesHome({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireSales();
  const sp = await searchParams;
  const key = param(sp.range) ?? "today";
  const r = range(key, param(sp.from), param(sp.to));
  const d = await rpc<Dashboard>(supabase, "fs_dashboard", { p_from: r.from, p_to: r.to });
  const periods = [
    { key: "today", label: "Today" },
    { key: "week", label: "This week" },
    { key: "month", label: "This month" },
  ];

  return (
    <>
      <p className="text-sm text-dark/60">Namaste,</p>
      <h1 className="font-heading text-2xl font-bold text-ink">{d.salesperson.name}</h1>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <BigButton href="/sales/order">CREATE CUSTOMER ORDER</BigButton>
        <BigButton href="/sales/customers/new" tone="ink">
          ADD NEW B2B CUSTOMER
        </BigButton>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        {periods.map((p) => (
          <Link
            key={p.key}
            href={`/sales?range=${p.key}`}
            className={`rounded-full px-3 py-1.5 text-sm font-semibold ${key === p.key ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}
          >
            {p.label}
          </Link>
        ))}
        <details className={`rounded-full ${key === "custom" ? "bg-ink text-white" : "bg-white ring-1 ring-ink/15"} px-3 py-1.5 text-sm font-semibold`}>
          <summary className="cursor-pointer list-none">{key === "custom" ? `${date(r.from)} – ${date(r.to)}` : "Dates…"}</summary>
          <form className="mt-2 flex flex-wrap items-end gap-2 text-ink">
            <input type="hidden" name="range" value="custom" />
            <input type="date" name="from" defaultValue={r.from} className="rounded-lg border-2 border-ink/15 px-2 py-1" aria-label="From" />
            <input type="date" name="to" defaultValue={r.to} className="rounded-lg border-2 border-ink/15 px-2 py-1" aria-label="To" />
            <button className="rounded-lg bg-accent px-3 py-1 text-white">Show</button>
          </form>
        </details>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
        <Tile label="Orders placed" value={d.orders_placed} hint={inr(d.sales_value, 0)} href="/sales/orders?scope=entered" />
        <Tile label="Sales value" value={inr(d.sales_value, 0)} hint={`${date(r.from)}${r.from !== r.to ? ` – ${date(r.to)}` : ""}`} />
        <Tile label="Awaiting processing" value={d.awaiting_processing} href="/sales/orders?show=open" tone={d.awaiting_processing ? "warn" : "default"} />
        <Tile label="Dispatched" value={d.dispatched} />
        <Tile label="Delivered" value={d.delivered} tone="good" />
        <Tile label="Direct orders (your shops)" value={d.direct_orders_from_my_accounts} hint="Placed by shops in the app" />
        <Tile label="Assigned customers" value={d.assigned_customers} href="/sales/customers" />
        <Tile label="New leads" value={d.new_leads} hint={`${d.leads_added} added in period`} href="/sales/customers?status=lead" />
        {d.outstanding !== null ? <Tile label="Outstanding (your shops)" value={inr(d.outstanding, 0)} tone={d.outstanding > 0 ? "warn" : "default"} /> : null}
      </div>

      <Section title="This month vs target">
        <div className="rounded-2xl bg-white p-4">
          <p className="text-sm text-dark/65">
            Sales this month <strong className="text-ink">{inr(d.month_sales, 0)}</strong>
            {d.target ? (
              <>
                {" "}
                of target <strong className="text-ink">{inr(d.target.value, 0)}</strong>
              </>
            ) : (
              " · no target set"
            )}
          </p>
          {d.target && d.target.value > 0 ? (
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-ink/10" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={d.target.achieved_pct ?? 0} aria-label="Target achieved">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(d.target.achieved_pct ?? 0, 100)}%` }} />
            </div>
          ) : null}
          {d.target ? <p className="mt-1 text-xs text-dark/60">{d.target.achieved_pct ?? 0}% achieved</p> : null}
          {d.pending_price_requests ? <p className="mt-2 text-xs text-amber-800">{d.pending_price_requests} price request(s) waiting for approval</p> : null}
        </div>
      </Section>

      <Section title={`Today's visits & follow-ups (${d.todays_visits.length})`}>
        {d.todays_visits.length ? (
          <ul className="flex flex-col gap-2">
            {d.todays_visits.map((c) => (
              <li key={c.id}>
                <Link href={`/sales/customers/${c.id}`} className="flex items-center justify-between rounded-2xl bg-white p-3">
                  <span>
                    <span className="font-semibold text-ink">{c.shop_name}</span>
                    <span className="block text-xs text-dark/60">
                      {c.locality ?? "—"} · {c.status === "lead" ? "lead" : c.customer_code}
                    </span>
                  </span>
                  <span className={`text-xs font-semibold ${c.next_follow_up < todayIST() ? "text-accent-dark" : "text-dark/60"}`}>
                    {c.next_follow_up < todayIST() ? `overdue ${date(c.next_follow_up)}` : "today"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No follow-ups due. Plan visits from the shop list.</EmptyNote>
        )}
      </Section>

      <Section title="Haven't ordered recently" action={<Link href="/sales/customers?segment=not_ordered_recently" className="text-sm font-semibold text-primary-dark">All</Link>}>
        {d.not_ordered_recently.length ? (
          <ul className="flex flex-col gap-2">
            {d.not_ordered_recently.slice(0, 6).map((c) => (
              <li key={c.id}>
                <Link href={`/sales/customers/${c.id}`} className="flex items-center justify-between rounded-2xl bg-white p-3">
                  <span className="font-semibold text-ink">
                    {c.shop_name}
                    <span className="block text-xs font-normal text-dark/60">{c.locality ?? ""}</span>
                  </span>
                  <span className="text-xs text-dark/60">{c.last_order_at ? `last ${date(c.last_order_at)}` : "never ordered"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>All your shops have ordered recently. 🎉</EmptyNote>
        )}
      </Section>

      <Section title="Recently visited">
        {d.recent_visits.length ? (
          <ul className="divide-y divide-ink/5 rounded-2xl bg-white">
            {d.recent_visits.map((v, i) => (
              <li key={i}>
                <Link href={`/sales/customers/${v.customer_id}`} className="flex items-center justify-between p-3 text-sm">
                  <span>
                    <span className="font-semibold text-ink">{v.shop_name}</span>
                    <span className="block text-xs text-dark/60">
                      {activityKinds[v.kind] ?? v.kind}
                      {v.outcome ? ` · ${outcomes[v.outcome] ?? v.outcome}` : ""}
                    </span>
                  </span>
                  <span className="text-xs text-dark/55">{dateTime(v.occurred_at)}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No visits recorded yet.</EmptyNote>
        )}
      </Section>
    </>
  );
}
