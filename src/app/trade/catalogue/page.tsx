import type { Metadata } from "next";
import Link from "next/link";
import { ErrorBox, Notice, PageTitle } from "@/components/b2b/trade-ui";
import { availabilityLabels, productImage } from "@/lib/b2b/labels";
import type { CatalogueItem } from "@/lib/b2b/types";
import { date, inr, param } from "@/lib/ops/format";
import { requireCustomer, rpc } from "../_lib/data";

export const metadata: Metadata = { title: "Catalogue" };

export default async function TradeCatalogue({ searchParams }: { searchParams: Promise<{ category?: string | string[]; q?: string | string[] }> }) {
  const me = await requireCustomer();
  const sp = await searchParams;
  const category = param(sp.category) ?? "";
  const q = (param(sp.q) ?? "").trim().toLowerCase();
  const { data, error } = await rpc<CatalogueItem[]>("b2b_catalogue");
  if (error) return <ErrorBox message={error} />;
  const items = data ?? [];
  const categories = Array.from(new Map(items.map((c) => [c.category, c.category_label ?? c.category])).entries());
  const shown = items.filter(
    (c) => (!category || c.category === category) && (!q || `${c.name} ${c.product_name} ${c.code} ${c.pack ?? ""}`.toLowerCase().includes(q))
  );
  const suspended = me.state === "suspended";
  const chip = (active: boolean) =>
    `flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold ${active ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/10"}`;

  return (
    <div>
      <PageTitle title="Wholesale catalogue" subtitle="Your approved items at your trade prices. Prices include GST." />
      {suspended ? (
        <div className="mb-4">
          <Notice tone="warn">Ordering is paused on your account — you can browse but not order.</Notice>
        </div>
      ) : null}
      <form className="mb-3 flex gap-2" action="/trade/catalogue">
        {category ? <input type="hidden" name="category" value={category} /> : null}
        <input
          name="q"
          defaultValue={param(sp.q) ?? ""}
          placeholder="Search by name or code"
          className="min-h-11 w-full rounded-xl border-2 border-ink/15 bg-white px-3 text-base text-ink focus:border-primary focus:outline-none"
        />
        <button className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">Search</button>
      </form>
      <nav aria-label="Categories" className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
        <Link href={q ? `/trade/catalogue?q=${encodeURIComponent(q)}` : "/trade/catalogue"} className={chip(!category)}>
          All
        </Link>
        {categories.map(([code, label]) => (
          <Link
            key={code}
            href={`/trade/catalogue?category=${encodeURIComponent(code)}${q ? `&q=${encodeURIComponent(q)}` : ""}`}
            className={chip(category === code)}
          >
            {label}
          </Link>
        ))}
      </nav>
      {shown.length === 0 ? <p className="rounded-2xl bg-white p-6 text-center text-sm text-dark/60">No items match.</p> : null}
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((c) => (
          <ItemCard key={c.item_id} c={c} canOrder={!suspended} />
        ))}
      </ul>
    </div>
  );
}

function ItemCard({ c, canOrder }: { c: CatalogueItem; canOrder: boolean }) {
  const img = productImage(c);
  const avail = availabilityLabels[c.availability];
  const lower = c.price !== null && c.list_price !== null && c.price < c.list_price;
  const packText = [c.pack, c.net_qty ? `${c.net_qty} ${c.net_unit ?? ""}`.trim() : null].filter(Boolean).join(" · ");
  return (
    <li className="flex flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-ink/5">
      <div className="flex gap-3 p-3">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={img} alt="" className="h-24 w-24 shrink-0 rounded-xl object-cover" loading="lazy" />
        ) : (
          <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-xl bg-blush text-3xl" aria-hidden="true">
            🍬
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="font-heading font-bold leading-tight text-ink">{c.name}</p>
          <p className="text-xs text-dark/55">
            {c.code}
            {packText ? ` · ${packText}` : ""}
          </p>
          <p className="mt-1">
            {c.price !== null ? (
              <>
                <span className="font-heading text-lg font-bold text-ink">{inr(c.price)}</span>
                <span className="text-xs text-dark/55"> /{c.unit}</span>
                {lower ? <span className="ml-2 text-xs text-dark/45 line-through">{inr(c.list_price)}</span> : null}
              </>
            ) : (
              <span className="text-sm text-dark/55">Price on request</span>
            )}
          </p>
          {avail ? <span className={`mt-1 inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${avail.tone}`}>{avail.label}</span> : null}
        </div>
      </div>
      <div className="flex flex-1 flex-col gap-1.5 border-t border-ink/5 px-3 py-2 text-xs text-dark/65">
        {c.offers?.length ? (
          <div className="rounded-lg bg-blush px-2 py-1.5 text-accent-dark">
            {c.offers.map((o, i) => (
              <p key={i} className="font-semibold">
                Offer: {inr(o.price)}/{c.unit}
                {o.min_qty > 1 ? ` for ${o.min_qty}+` : ""}
                {o.note ? ` — ${o.note}` : ""}
                {o.valid_to ? ` (till ${date(o.valid_to)})` : ""}
              </p>
            ))}
          </div>
        ) : null}
        {c.breaks?.length ? (
          <p>
            <span className="font-semibold text-ink">Quantity prices: </span>
            {c.breaks.map((b) => `${b.min_qty}+ ${inr(b.price)}`).join(" · ")}
          </p>
        ) : null}
        <p>
          Min order {c.min_qty}
          {c.multiple > 1 ? `, in multiples of ${c.multiple}` : ""} · GST {c.gst_rate}%
          {c.shelf_life_days ? ` · Shelf life ${c.shelf_life_days} day${c.shelf_life_days === 1 ? "" : "s"}` : ""}
        </p>
        {c.availability === "made_to_order" ? (
          <p>Estimated fulfilment: {c.lead_days > 0 ? `${c.lead_days} day${c.lead_days === 1 ? "" : "s"} after order` : "next production run"}</p>
        ) : null}
        {c.storage ? <p>Storage: {c.storage}</p> : null}
        {c.description ? <p className="line-clamp-3">{c.description}</p> : null}
      </div>
      {canOrder && c.price !== null ? (
        <Link href={`/trade/quick-order?add=${c.item_id}`} className="m-3 mt-0 flex min-h-11 items-center justify-center rounded-xl bg-ink text-sm font-bold text-white">
          Order
        </Link>
      ) : null}
    </li>
  );
}
