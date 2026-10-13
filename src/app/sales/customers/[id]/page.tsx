import Link from "next/link";
import { notFound } from "next/navigation";
import { ActivityForm, ConsentForm, ContactForm, PriceRequestForm } from "@/components/b2b/sales-forms";
import { EmptyNote, Section, StatusPill, Tile } from "@/components/b2b/sales-ui";
import { activityKinds, customerStatuses, customerTypes, outcomes, paymentTerms, segments } from "@/lib/b2b/labels";
import { requireSales } from "@/lib/b2b/sales";
import type { CatalogueItem, CustomerProfile } from "@/lib/b2b/types";
import { date, dateTime, inr } from "@/lib/ops/format";

export const metadata = { title: "Customer" };

export default async function SalesCustomer({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireSales();
  const { data, error } = await supabase.rpc("b2b_customer_profile", { p_customer_id: id });
  if (error || !data) notFound();
  const p = data as CustomerProfile;
  const c = p.customer;
  const { data: cat } = await supabase.rpc("b2b_catalogue", { p_customer_id: id });
  const items = ((cat ?? []) as CatalogueItem[]).map((i) => ({ item_id: i.item_id, name: i.name, price: i.price }));
  const approved = c.status === "approved";
  const lastOrder = p.orders.find((o) => o.stage !== "cancelled");

  return (
    <>
      <Link href="/sales/customers" className="text-sm font-semibold text-primary-dark">
        ← Shops
      </Link>
      <div className="mt-1 flex items-start justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{c.shop_name}</h1>
          <p className="text-sm text-dark/65">
            {c.owner_name} · {c.customer_code}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
          {customerStatuses[c.status] ?? c.status}
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <a href={`tel:+91${c.mobile}`} className="rounded-xl bg-white py-3 text-center text-sm font-semibold text-ink">
          📞 Call
        </a>
        <a href={`https://wa.me/91${c.whatsapp ?? c.mobile}`} target="_blank" rel="noopener" className="rounded-xl bg-white py-3 text-center text-sm font-semibold text-ink">
          💬 WhatsApp
        </a>
        <a
          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${c.shop_name} ${c.business_address ?? ""} ${c.locality ?? ""} ${c.city}`)}`}
          target="_blank"
          rel="noopener"
          className="rounded-xl bg-white py-3 text-center text-sm font-semibold text-ink"
        >
          🗺️ Map
        </a>
      </div>

      {approved ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Link href={`/sales/order?customer=${c.id}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-accent px-3 text-center font-bold text-white">
            CREATE ORDER
          </Link>
          {lastOrder ? (
            <Link href={`/sales/order?customer=${c.id}&reorder=${lastOrder.id}`} className="flex min-h-14 items-center justify-center rounded-2xl bg-ink px-3 text-center font-bold text-white">
              REORDER PREVIOUS ORDER
            </Link>
          ) : (
            <span className="flex min-h-14 items-center justify-center rounded-2xl bg-ink/10 px-3 text-center text-sm text-dark/60">No previous order</span>
          )}
        </div>
      ) : (
        <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {c.status === "lead"
            ? "Waiting for approval by the office. Orders, wholesale prices and credit open once the shop is approved."
            : `This customer is ${c.status}. Contact the office.`}
        </p>
      )}

      {p.segments.length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {p.segments.map((s) => (
            <span key={s} className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-ink ring-1 ring-ink/10">
              {segments[s] ?? s}
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Tile label="Orders" value={p.stats.orders} hint={p.stats.open_orders ? `${p.stats.open_orders} open` : undefined} />
        <Tile label="Average order" value={p.stats.avg_order_value ? inr(p.stats.avg_order_value, 0) : "—"} />
        <Tile label="Last order" value={p.stats.last_order_at ? date(p.stats.last_order_at) : "—"} hint={`${p.stats.orders_per_month}/month`} />
        <Tile label="Total purchases" value={inr(p.stats.total_value, 0)} />
        {p.credit?.balance !== undefined ? (
          <Tile label="Outstanding" value={inr(p.credit.balance, 0)} hint={p.credit.overdue ? `${inr(p.credit.overdue, 0)} overdue` : undefined} tone={p.credit.overdue ? "warn" : "default"} />
        ) : null}
        {p.credit?.credit_limit !== undefined ? <Tile label="Credit limit" value={inr(p.credit.credit_limit, 0)} hint={p.credit.available !== undefined ? `${inr(p.credit.available, 0)} available` : undefined} /> : null}
      </div>

      <Section title="Business details">
        <dl className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-2xl bg-white p-4 text-sm sm:grid-cols-2">
          {[
            ["Mobile", `${c.mobile}${c.mobile_verified ? " ✓ verified" : ""}`],
            ["WhatsApp", c.whatsapp],
            ["Email", c.email],
            ["Business address", c.business_address],
            ["Delivery address", c.delivery_address],
            ["Locality / city", `${c.locality ?? "—"}, ${c.city}${c.pincode ? ` ${c.pincode}` : ""}`],
            ["GSTIN", c.gstin],
            ["Customer type", customerTypes[c.customer_type] ?? c.customer_type],
            ["Price category", c.price_category],
            ["Payment terms", `${paymentTerms[c.payment_terms] ?? c.payment_terms}${c.payment_terms === "credit" ? ` · ${c.credit_days} days` : ""}`],
            ["Assigned salesperson", p.salesperson?.name],
            ["Customer since", date(c.acquired_at)],
            ["Expected monthly", c.expected_monthly_value ? inr(c.expected_monthly_value, 0) : null],
            ["Preferred products", c.preferred_products],
            ["Next follow-up", c.next_follow_up ? date(c.next_follow_up) : null],
            ["Notes", c.business_notes],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-3 border-b border-ink/5 py-1 sm:block">
              <dt className="text-dark/55">{k}</dt>
              <dd className="text-right font-medium text-ink sm:text-left">{v || "—"}</dd>
            </div>
          ))}
        </dl>
        <details className="mt-2 rounded-2xl bg-white p-4">
          <summary className="cursor-pointer font-semibold text-ink">Edit contact details</summary>
          <div className="mt-3">
            <ContactForm
              customerId={c.id}
              initial={{
                owner_name: c.owner_name,
                whatsapp: c.whatsapp,
                email: c.email,
                alternate_contact: c.alternate_contact,
                business_address: c.business_address,
                delivery_address: c.delivery_address,
                locality: c.locality,
                pincode: c.pincode,
                preferred_products: c.preferred_products,
                business_notes: c.business_notes,
              }}
            />
          </div>
        </details>
      </Section>

      {p.favourites.length ? (
        <Section title="Favourite products">
          <ul className="divide-y divide-ink/5 rounded-2xl bg-white text-sm">
            {p.favourites.map((f) => (
              <li key={f.item_id} className="flex justify-between p-3">
                <span className="text-ink">{f.name}</span>
                <span className="text-dark/60">
                  {f.qty} in {f.times} order(s)
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title="Orders">
        {p.orders.length ? (
          <ul className="flex flex-col gap-2">
            {p.orders.slice(0, 12).map((o) => (
              <li key={o.id}>
                <Link href={`/sales/orders/${o.id}`} className="flex items-center justify-between gap-2 rounded-2xl bg-white p-3">
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{o.order_no}</span>
                    <span className="text-xs text-dark/60">
                      {date(o.created_at)} · {o.items} item(s) · {o.source === "sales_rep" ? "by salesperson" : o.source === "b2b_app" ? "direct (app)" : "office"}
                    </span>
                  </span>
                  <span className="shrink-0 text-right">
                    <span className="block font-semibold text-ink">{inr(o.total, 0)}</span>
                    <StatusPill label={o.status} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyNote>No orders yet.</EmptyNote>
        )}
      </Section>

      <Section title="Record visit / follow-up">
        <div className="rounded-2xl bg-white p-4">
          <ActivityForm customerId={c.id} products={items.map((i) => i.name)} />
        </div>
      </Section>

      <Section title="Timeline">
        {p.activities?.length ? (
          <ol className="relative ml-2 border-l-2 border-ink/10 pl-4">
            {p.activities.map((a) => (
              <li key={a.id} className="mb-3">
                <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" aria-hidden="true" />
                <p className="text-sm font-semibold text-ink">
                  {activityKinds[a.kind] ?? a.kind}
                  {a.outcome ? ` · ${outcomes[a.outcome] ?? a.outcome}` : ""}
                  {a.has_location ? " · 📍" : ""}
                </p>
                <p className="text-xs text-dark/55">
                  {dateTime(a.occurred_at)} · {a.by ?? "—"}
                </p>
                <div className="text-sm text-dark/80">
                  {a.products_discussed ? <p>Products: {a.products_discussed}</p> : null}
                  {a.requirements ? <p>Needs: {a.requirements}</p> : null}
                  {a.sample_request ? <p>Sample: {a.sample_request}</p> : null}
                  {a.price_enquiry ? <p>Price enquiry: {a.price_enquiry}</p> : null}
                  {a.opportunity_value ? <p>Opportunity: {inr(a.opportunity_value, 0)}</p> : null}
                  {a.objections ? <p>Objection: {a.objections}</p> : null}
                  {a.next_action ? <p>Next: {a.next_action}</p> : null}
                  {a.follow_up_date ? <p>Follow up {date(a.follow_up_date)}</p> : null}
                  {a.notes ? <p>{a.notes}</p> : null}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <EmptyNote>No visits or notes yet.</EmptyNote>
        )}
      </Section>

      <Section title="Special price request">
        <div className="rounded-2xl bg-white p-4">
          <PriceRequestForm customerId={c.id} items={items} />
          {p.price_requests?.length ? (
            <ul className="mt-3 divide-y divide-ink/5 text-sm">
              {p.price_requests.map((r) => (
                <li key={r.id} className="flex justify-between gap-2 py-2">
                  <span>
                    {r.item}: ₹{r.requested_price}
                    {r.current_price !== null ? <span className="text-dark/50"> (was ₹{r.current_price})</span> : null}
                    {r.decision_note ? <span className="block text-xs text-dark/55">{r.decision_note}</span> : null}
                  </span>
                  <span className={`text-xs font-semibold ${r.status === "approved" ? "text-emerald-700" : r.status === "rejected" ? "text-accent-dark" : "text-amber-700"}`}>
                    {r.status}
                    {r.approved_price !== null ? ` ₹${r.approved_price}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </Section>

      <Section title="Marketing messages">
        <div className="rounded-2xl bg-white p-4">
          <ConsentForm customerId={c.id} current={{ consent: c.marketing_consent && !c.opted_out_at, channels: c.consent_channels }} />
        </div>
      </Section>
    </>
  );
}
