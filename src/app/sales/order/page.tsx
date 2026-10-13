import Link from "next/link";
import { OrderBuilder } from "@/components/b2b/order-builder";
import { EmptyNote } from "@/components/b2b/sales-ui";
import { paymentTerms } from "@/lib/b2b/labels";
import { requireSales, rpc } from "@/lib/b2b/sales";
import type { CatalogueItem, CustomerProfile, CustomerRow } from "@/lib/b2b/types";
import { param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Create customer order" };

function paymentOptions(c: CustomerProfile["customer"]) {
  if (c.payment_terms === "credit" && c.credit_status === "approved") return ["credit", "cod", "advance"];
  if (c.payment_terms === "advance") return ["advance"];
  return ["cod", "advance"];
}

export default async function CreateOrder({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireSales();
  const sp = await searchParams;
  const customerId = param(sp.customer);
  const reorder = param(sp.reorder);

  // Step 1: choose the shop.
  if (!customerId) {
    const q = param(sp.q) ?? "";
    const rows = await rpc<CustomerRow[]>(supabase, "b2b_customer_list", { p_search: q || null, p_filters: { status: "approved" }, p_limit: 200 });
    return (
      <>
        <h1 className="font-heading text-2xl font-bold text-ink">Create customer order</h1>
        <p className="text-sm text-dark/65">Step 1 of 3 · choose the shop</p>
        <form className="mt-3">
          <input type="search" name="q" defaultValue={q} placeholder="Shop, owner, mobile, ID or locality" className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-3 text-base" aria-label="Search customers" />
        </form>
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((c) => (
            <li key={c.id}>
              <Link href={`/sales/order?customer=${c.id}`} className="flex items-center justify-between rounded-2xl bg-white p-3 active:bg-blush/50">
                <span className="min-w-0">
                  <span className="block truncate font-semibold text-ink">{c.shop_name}</span>
                  <span className="text-xs text-dark/60">
                    {c.locality ?? c.city} · {c.customer_code}
                  </span>
                </span>
                <span className="text-sm font-semibold text-primary-dark">Select →</span>
              </Link>
            </li>
          ))}
        </ul>
        {!rows.length ? <EmptyNote>No approved shop matches. Leads must be approved before ordering.</EmptyNote> : null}
      </>
    );
  }

  // Steps 2–3: products, quantities, review and submit.
  const profile = await rpc<CustomerProfile>(supabase, "b2b_customer_profile", { p_customer_id: customerId });
  const c = profile.customer;
  if (c.status !== "approved") {
    return <EmptyNote>{c.shop_name} is {c.status}; orders can be placed once the shop is approved.</EmptyNote>;
  }
  const [catalogue, start] = await Promise.all([
    rpc<CatalogueItem[]>(supabase, "b2b_catalogue", { p_customer_id: customerId }),
    reorder
      ? rpc<{ lines: { item_id: string; qty: number }[] }>(supabase, "b2b_reorder_lines", { p_order_id: reorder }).then((r) => ({ lines: r.lines, notes: "" }))
      : rpc<{ lines: { item_id: string; qty: number }[]; notes: string | null } | null>(supabase, "b2b_get_draft", { p_customer_id: customerId }).then((d) => ({
          lines: d?.lines ?? [],
          notes: d?.notes ?? "",
        })),
  ]);

  return (
    <>
      <Link href="/sales/order" className="text-sm font-semibold text-primary-dark">
        ← Change shop
      </Link>
      <h1 className="mt-1 font-heading text-2xl font-bold text-ink">{c.shop_name}</h1>
      <p className="mb-3 text-sm text-dark/65">
        {c.customer_code} · {paymentTerms[c.payment_terms] ?? c.payment_terms} · {c.price_category} prices
      </p>
      <OrderBuilder
        customerId={c.id}
        customerLabel={c.shop_name}
        catalogue={catalogue}
        initialLines={start.lines.map((l) => ({ item_id: l.item_id, qty: Number(l.qty) }))}
        initialNotes={start.notes ?? ""}
        paymentOptions={paymentOptions(c)}
        defaultPayment={c.payment_terms}
        earliestDate={todayIST(1)}
        ordersBase="/sales/orders"
        showExactStock
        notice={
          reorder ? (
            <p className="rounded-xl bg-sky-50 p-3 text-sm text-sky-900">
              Copied from the previous order. Prices and stock are checked again today before you submit — old prices are never reused.
            </p>
          ) : null
        }
      />
    </>
  );
}
