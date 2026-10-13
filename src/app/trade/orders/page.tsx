import type { Metadata } from "next";
import Link from "next/link";
import { ErrorBox, PageTitle, StatusPill } from "@/components/b2b/trade-ui";
import { paymentMethods } from "@/lib/b2b/labels";
import type { OrderListRow } from "@/lib/b2b/types";
import { date, inr, param } from "@/lib/ops/format";
import { isOpenOrder, requireCustomer, rpc } from "../_lib/data";

export const metadata: Metadata = { title: "Orders" };

const filters = [
  { id: "open", label: "Open" },
  { id: "delivered", label: "Delivered" },
  { id: "cancelled", label: "Cancelled" },
  { id: "all", label: "All" },
] as const;

function matches(o: OrderListRow, f: string) {
  if (f === "open") return isOpenOrder(o.stage);
  if (f === "delivered") return o.stage === "delivered" || o.stage === "partially_delivered";
  if (f === "cancelled") return o.stage === "cancelled" || o.stage === "returned";
  return true;
}

export default async function TradeOrders({ searchParams }: { searchParams: Promise<{ filter?: string | string[] }> }) {
  const me = await requireCustomer();
  const raw = param((await searchParams).filter) ?? "open";
  const filter = filters.some((f) => f.id === raw) ? raw : "open";
  const { data, error } = await rpc<OrderListRow[]>("b2b_orders", { p_customer_id: me.customer.id, p_limit: 300 });
  if (error) return <ErrorBox message={error} />;
  const all = data ?? [];
  const rows = all.filter((o) => matches(o, filter));

  return (
    <div>
      <PageTitle
        title="Orders"
        subtitle={me.state === "active" ? <Link href="/trade/quick-order" className="font-semibold text-primary-dark underline">Place a new order</Link> : null}
      />
      <nav aria-label="Filter orders" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {filters.map((f) => {
          const count = all.filter((o) => matches(o, f.id)).length;
          const active = f.id === filter;
          return (
            <Link
              key={f.id}
              href={`/trade/orders?filter=${f.id}`}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/10"}`}
            >
              {f.label}
              <span className={`text-xs ${active ? "text-white/70" : "text-dark/45"}`}>{count}</span>
            </Link>
          );
        })}
      </nav>
      {rows.length === 0 ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-dark/60">No orders here.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {rows.map((o) => {
            const summary = o.items
              .slice(0, 3)
              .map((i) => `${i.name} × ${Number(i.qty)}`)
              .join(", ");
            const more = o.items.length > 3 ? ` +${o.items.length - 3} more` : "";
            const confirm = o.confirmation === "pending" && o.stage !== "cancelled";
            return (
              <li key={o.id}>
                <Link href={`/trade/orders/${o.id}`} className={`block rounded-2xl bg-white p-4 shadow-sm ${confirm ? "ring-2 ring-amber-400" : "ring-1 ring-ink/5"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-heading text-base font-bold text-ink">{o.order_no}</p>
                      <p className="text-xs text-dark/55">
                        {date(o.created_at)}
                        {o.source === "sales_rep" ? " · Placed by your salesperson" : ""}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <StatusPill label={o.status} />
                      {confirm ? <span className="rounded-full bg-amber-400 px-2.5 py-0.5 text-xs font-bold text-ink">Needs your confirmation</span> : null}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-sm text-dark/70">
                    {summary}
                    {more}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-heading text-lg font-bold text-ink">{inr(o.total)}</span>
                    <span className="text-xs text-dark/55">
                      {paymentMethods[o.payment_method] ?? o.payment_method}
                      {o.delivery_date ? ` · Delivery ${date(o.delivery_date)}` : o.requested_delivery_date ? ` · Requested ${date(o.requested_delivery_date)}` : ""}
                      {o.invoice_number ? ` · Invoice ${o.invoice_number}` : ""}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
