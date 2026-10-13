import Link from "next/link";
import { EmptyNote } from "@/components/b2b/sales-ui";
import { segments } from "@/lib/b2b/labels";
import { requireSales, rpc } from "@/lib/b2b/sales";
import type { CustomerRow } from "@/lib/b2b/types";
import { date, inr, param } from "@/lib/ops/format";

export const metadata = { title: "Shops" };

export default async function SalesCustomers({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireSales();
  const sp = await searchParams;
  const q = param(sp.q) ?? "";
  const status = param(sp.status) ?? "";
  const segment = param(sp.segment) ?? "";
  const rows = await rpc<CustomerRow[]>(supabase, "b2b_customer_list", { p_search: q || null, p_filters: { status, segment }, p_limit: 500 });
  const chips = [
    { label: "All", href: "/sales/customers", on: !status && !segment },
    { label: "Leads", href: "/sales/customers?status=lead", on: status === "lead" },
    { label: "Follow-up due", href: "/sales/customers?segment=needs_follow_up", on: segment === "needs_follow_up" },
    { label: "Not ordered recently", href: "/sales/customers?segment=not_ordered_recently", on: segment === "not_ordered_recently" },
    { label: "High volume", href: "/sales/customers?segment=high_volume", on: segment === "high_volume" },
  ];

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="font-heading text-2xl font-bold text-ink">My shops</h1>
        <Link href="/sales/customers/new" className="rounded-xl bg-ink px-3 py-2 text-sm font-semibold text-white">
          + New customer
        </Link>
      </div>
      <form className="mt-3">
        <input type="hidden" name="status" value={status} />
        <input type="hidden" name="segment" value={segment} />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Shop, owner, mobile, customer ID or locality"
          className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-3 text-base"
          aria-label="Search customers"
        />
      </form>
      <div className="mt-2 flex gap-2 overflow-x-auto pb-1">
        {chips.map((c) => (
          <Link key={c.label} href={c.href} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${c.on ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}>
            {c.label}
          </Link>
        ))}
      </div>
      {segment ? <p className="mt-2 text-xs text-dark/60">Showing: {segments[segment] ?? segment}</p> : null}

      <ul className="mt-3 flex flex-col gap-2">
        {rows.map((c) => (
          <li key={c.id}>
            <Link href={`/sales/customers/${c.id}`} className="block rounded-2xl bg-white p-3 active:bg-blush/50">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-semibold text-ink">{c.shop_name}</p>
                  <p className="text-xs text-dark/60">
                    {c.owner_name} · {c.mobile} · {c.locality ?? c.city}
                  </p>
                  <p className="text-xs text-dark/50">{c.customer_code}</p>
                </div>
                <div className="shrink-0 text-right text-xs">
                  {c.status !== "approved" ? (
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${c.status === "lead" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800"}`}>{c.status}</span>
                  ) : (
                    <span className="text-dark/60">{c.orders} orders</span>
                  )}
                  {c.last_order_at ? <p className="mt-1 text-dark/55">last {date(c.last_order_at)}</p> : null}
                  {c.balance ? <p className="mt-1 font-semibold text-amber-800">due {inr(c.balance, 0)}</p> : null}
                </div>
              </div>
              {c.next_follow_up ? <p className="mt-1 text-xs font-semibold text-primary-dark">Follow up {date(c.next_follow_up)}</p> : null}
            </Link>
          </li>
        ))}
      </ul>
      {!rows.length ? <EmptyNote>{q ? "No shop matches that search among your customers." : "No customers assigned to you yet."}</EmptyNote> : null}
    </>
  );
}
