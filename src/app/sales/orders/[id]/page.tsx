import Link from "next/link";
import { notFound } from "next/navigation";
import { AmendOrder, CancelOrder } from "@/components/b2b/sales-forms";
import { Section, StatusPill } from "@/components/b2b/sales-ui";
import { approvalReasons, channels, paymentMethods } from "@/lib/b2b/labels";
import { requireSales } from "@/lib/b2b/sales";
import type { CatalogueItem, OrderDetail } from "@/lib/b2b/types";
import { date, dateTime, inr } from "@/lib/ops/format";

export const metadata = { title: "Order" };

export default async function SalesOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase } = await requireSales();
  const { data, error } = await supabase.rpc("b2b_order_detail", { p_order_id: id });
  if (error || !data) notFound();
  const d = data as OrderDetail;
  const o = d.order;
  const waiting = ["submitted", "awaiting_confirmation"].includes(o.stage);
  const enteredByMe = o.entered_by_me;
  const { data: cat } = waiting && enteredByMe ? await supabase.rpc("b2b_catalogue", { p_customer_id: d.customer.id }) : { data: [] };

  return (
    <>
      <Link href="/sales/orders" className="text-sm font-semibold text-primary-dark">
        ← Orders
      </Link>
      <div className="mt-1 flex items-start justify-between gap-2">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink">{o.order_no}</h1>
          <p className="text-sm text-dark/65">
            <Link href={`/sales/customers/${d.customer.id}`} className="font-semibold text-primary-dark">
              {d.customer.shop_name}
            </Link>{" "}
            · {d.customer.customer_code}
          </p>
        </div>
        <StatusPill label={o.status} />
      </div>
      <p className="mt-1 text-xs text-dark/60">
        {channels[o.source]?.code ?? o.source} · {o.entered_by} · {dateTime(o.created_at)}
      </p>
      {o.confirmation === "pending" ? <p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">Waiting for the shop to confirm this order in the Wholesale app.</p> : null}
      {o.approval_reasons?.length && waiting ? (
        <div className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          {o.approval_reasons.map((r) => (
            <p key={r}>• {approvalReasons[r] ?? r}</p>
          ))}
        </div>
      ) : null}

      <Section title="Items">
        <ul className="divide-y divide-ink/5 rounded-2xl bg-white text-sm">
          {d.lines.map((l) => (
            <li key={l.order_item_id} className="flex justify-between gap-2 p-3">
              <span>
                <span className="font-semibold text-ink">{l.name}</span>
                <span className="block text-xs text-dark/60">
                  {l.code} · {l.qty} × {inr(l.unit_price, 0)}
                  {l.dispatched ? ` · ${l.dispatched} dispatched` : ""}
                </span>
              </span>
              <span className="font-semibold tabular-nums text-ink">{inr(l.line_total, 0)}</span>
            </li>
          ))}
          <li className="flex justify-between p-3">
            <span className="text-dark/65">Delivery</span>
            <span>{o.delivery_fee ? inr(o.delivery_fee, 0) : "Free"}</span>
          </li>
          <li className="flex justify-between p-3 font-bold text-ink">
            <span>Total (GST included)</span>
            <span>{inr(o.total, 0)}</span>
          </li>
        </ul>
        <p className="mt-2 text-xs text-dark/60">
          {paymentMethods[o.payment_method] ?? o.payment_method}
          {o.requested_delivery_date ? ` · requested ${date(o.requested_delivery_date)}` : ""}
          {o.delivery_date ? ` · delivery ${date(o.delivery_date)}` : ""}
          {o.notes ? ` · “${o.notes}”` : ""}
        </p>
      </Section>

      <Section title="Tracking">
        <ol className="relative ml-2 border-l-2 border-ink/10 pl-4">
          {d.events.map((e, i) => (
            <li key={i} className="mb-3">
              <span className="absolute -left-[7px] mt-1.5 h-3 w-3 rounded-full bg-primary" aria-hidden="true" />
              <p className="text-sm font-semibold text-ink">{e.label}</p>
              <p className="text-xs text-dark/55">{dateTime(e.at)}</p>
              {e.note ? <p className="text-sm text-dark/75">{e.note}</p> : null}
            </li>
          ))}
        </ol>
        {d.dispatches.map((x) => (
          <p key={x.dispatch_no} className="text-xs text-dark/60">
            {x.dispatch_no} · {x.status.replace(/_/g, " ")} · {dateTime(x.dispatched_at)}
            {x.delivery_person ? ` · ${x.delivery_person}` : ""}
          </p>
        ))}
        {o.invoice_number ? (
          <a href={`/invoice/${o.id}`} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-primary-dark">
            Tax invoice {o.invoice_number} →
          </a>
        ) : null}
      </Section>

      {d.amendments?.length ? (
        <Section title="Changes">
          <ul className="flex flex-col gap-2 text-sm">
            {d.amendments.map((a) => (
              <li key={a.no} className="rounded-2xl bg-white p-3">
                <p className="font-semibold text-ink">
                  Change {a.no} · {dateTime(a.at)} · {a.by}
                </p>
                <p className="text-dark/70">“{a.reason}”</p>
                <p className="text-xs text-dark/55">
                  {inr(a.before.total, 0)} → {inr(a.after.total, 0)}
                </p>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {waiting && enteredByMe ? (
        <Section title="Change or cancel">
          <div className="grid gap-4 rounded-2xl bg-white p-4">
            <AmendOrder
              orderId={o.id}
              lines={d.lines.filter((l) => l.item_id).map((l) => ({ item_id: l.item_id as string, name: l.name, qty: l.qty }))}
              extra={((cat ?? []) as CatalogueItem[]).map((c) => ({ item_id: c.item_id, name: c.name }))}
            />
            <CancelOrder orderId={o.id} />
          </div>
        </Section>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-2">
        <Link href={`/sales/order?customer=${d.customer.id}&reorder=${o.id}`} className="rounded-2xl bg-ink px-3 py-3 text-center font-semibold text-white">
          Reorder this
        </Link>
        <Link href={`/sales/customers/${d.customer.id}`} className="rounded-2xl border-2 border-ink/20 bg-white px-3 py-3 text-center font-semibold text-ink">
          Customer profile
        </Link>
      </div>
    </>
  );
}
