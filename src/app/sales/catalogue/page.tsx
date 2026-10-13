import { EmptyNote } from "@/components/b2b/sales-ui";
import { availabilityLabels, productImage } from "@/lib/b2b/labels";
import { requireSales, rpc } from "@/lib/b2b/sales";
import type { CatalogueItem } from "@/lib/b2b/types";
import { inr, param } from "@/lib/ops/format";

export const metadata = { title: "Wholesale products" };

export default async function SalesCatalogue({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { supabase } = await requireSales();
  const q = (param((await searchParams).q) ?? "").toLowerCase();
  const all = await rpc<CatalogueItem[]>(supabase, "b2b_catalogue");
  const items = all.filter((i) => !q || `${i.name} ${i.code} ${i.product_name}`.toLowerCase().includes(q));
  const groups = Array.from(new Set(items.map((i) => i.category_label ?? i.category)));
  return (
    <>
      <h1 className="font-heading text-2xl font-bold text-ink">Wholesale products</h1>
      <p className="text-sm text-dark/65">Standard wholesale prices (GST included). A shop may have its own approved price — open the order screen for that shop to see it.</p>
      <form className="mt-3">
        <input type="search" name="q" defaultValue={q} placeholder="Search products" className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-3 text-base" aria-label="Search products" />
      </form>
      {groups.map((g) => (
        <section key={g} className="mt-4">
          <h2 className="mb-2 font-heading text-lg font-bold text-ink">{g}</h2>
          <ul className="flex flex-col gap-2">
            {items
              .filter((i) => (i.category_label ?? i.category) === g)
              .map((i) => {
                const img = productImage(i);
                const a = availabilityLabels[i.availability];
                return (
                  <li key={i.item_id} className="flex gap-3 rounded-2xl bg-white p-3">
                    <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-blush">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                      ) : (
                        <span className="flex h-full items-center justify-center text-2xl" aria-hidden="true">
                          🍬
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1 text-sm">
                      <p className="font-semibold text-ink">{i.name}</p>
                      <p className="text-xs text-dark/60">
                        {i.code} · {i.pack ?? i.unit} · GST {i.gst_rate}%{i.shelf_life_days ? ` · ${i.shelf_life_days} days shelf life` : ""}
                      </p>
                      <p className="mt-1">
                        <strong className="text-ink">{inr(i.price, 0)}</strong>/{i.unit}
                        {i.breaks?.length ? <span className="ml-2 text-xs text-emerald-700">{i.breaks.map((b) => `${b.min_qty}+ @ ${inr(b.price, 0)}`).join(" · ")}</span> : null}
                      </p>
                      <p className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${a.tone}`}>
                          {a.label}
                          {i.available_qty !== null ? ` · ${i.available_qty} free` : ""}
                        </span>
                        {i.min_qty > 1 || i.multiple > 1 ? (
                          <span className="text-dark/60">
                            Min {i.min_qty}
                            {i.multiple > 1 ? `, in ${i.multiple}s` : ""}
                          </span>
                        ) : null}
                      </p>
                      {i.description ? <p className="mt-1 text-xs text-dark/60">{i.description}</p> : null}
                    </div>
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
      {!items.length ? <EmptyNote>No wholesale products yet. The office sets these up under Wholesale pricing.</EmptyNote> : null}
    </>
  );
}
