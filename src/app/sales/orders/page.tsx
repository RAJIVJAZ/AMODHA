import Link from "next/link";
import { EmptyNote, StatusPill } from "@/components/b2b/sales-ui";
import { requireSales, rpc } from "@/lib/b2b/sales";
import type { OrderListRow } from "@/lib/b2b/types";
import { date, inr, param } from "@/lib/ops/format";

export const metadata = { title: "Orders" };

const closed = ["delivered", "cancelled", "returned"];

export default async function SalesOrders({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireSales();
  const sp = await searchParams;
  const scope = param(sp.scope) === "entered" ? "entered" : "all";
  const show = param(sp.show) ?? "all";
  const rows = (await rpc<OrderListRow[]>(supabase, "b2b_orders", { p_scope: scope === "entered" ? "entered" : null, p_limit: 300 })).filter((o) =>
    show === "open" ? !closed.includes(o.stage) : show === "done" ? closed.includes(o.stage) : true
  );
  const chip = (href: string, label: string, on: boolean) => (
    <Link href={href} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${on ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}>
      {label}
    </Link>
  );
  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-ink">Orders</h1>
      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {chip(`/sales/orders?show=${show}`, "My shops", scope === "all")}
        {chip(`/sales/orders?scope=entered&show=${show}`, "Entered by me", scope === "entered")}
        <span className="mx-1 w-px bg-ink/10" />
        {chip(`/sales/orders?scope=${scope}&show=open`, "Open", show === "open")}
        {chip(`/sales/orders?scope=${scope}&show=done`, "Completed", show === "done")}
        {chip(`/sales/orders?scope=${scope}`, "All", show === "all")}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((o) => (
          <li key={o.id}>
            <Link href={`/sales/orders/${o.id}`} className="block rounded-2xl bg-white p-3 active:bg-blush/50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-ink">{o.shop_name}</p>
                  <p className="text-xs text-dark/60">
                    {o.order_no} · {date(o.created_at)} · {o.source === "sales_rep" ? (o.entered_by_me ? "entered by you" : "by salesperson") : o.source === "b2b_app" ? "direct (app)" : "office"}
                  </p>
                  <p className="mt-1 truncate text-xs text-dark/60">{o.items.map((i) => `${i.qty} × ${i.name}`).join(", ")}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-ink">{inr(o.total, 0)}</p>
                  <StatusPill label={o.status} />
                </div>
              </div>
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length ? <EmptyNote>No orders here yet.</EmptyNote> : null}
    </>
  );
}
