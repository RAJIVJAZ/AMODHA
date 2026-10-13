import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Notice, PageTitle, StatusPill } from "@/components/b2b/trade-ui";
import { OrderActions } from "@/components/b2b/trade-widgets";
import { paymentMethods } from "@/lib/b2b/labels";
import type { OrderDetail } from "@/lib/b2b/types";
import { date, dateTime, inr, qty } from "@/lib/ops/format";
import { requireCustomer, rpc, UUID } from "../../_lib/data";

export const metadata: Metadata = { title: "Order" };

type Step = { label: string; statuses: string[] };

const steps: Step[] = [
  { label: "Order submitted", statuses: ["submitted"] },
  { label: "Confirmed", statuses: ["awaiting_confirmation", "awaiting_payment", "confirmed", "customer_confirmed"] },
  { label: "Accepted", statuses: ["processing", "pending_stock"] },
  { label: "Picking", statuses: ["picking"] },
  { label: "Packing", statuses: ["packed"] },
  { label: "Ready", statuses: ["ready_for_dispatch"] },
  { label: "Dispatched", statuses: ["dispatched", "partially_dispatched"] },
  { label: "Out for delivery", statuses: ["out_for_delivery"] },
  { label: "Delivered", statuses: ["delivered", "partially_delivered"] },
];

const stepOf = (status: string) => steps.findIndex((s) => s.statuses.includes(status));

const dispatchStatus: Record<string, string> = {
  planned: "Planned",
  dispatched: "Dispatched",
  out_for_delivery: "Out for delivery",
  delivered: "Delivered",
  failed: "Delivery failed",
  returned: "Returned",
};

export default async function TradeOrder({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const me = await requireCustomer();
  const { data, error } = await rpc<OrderDetail>("b2b_order_detail", { p_order_id: id });
  if (error || !data) notFound();
  const { order, customer, lines, events, dispatches } = data;

  // How far the order has got: the furthest step reached by any event or by the current stage.
  const reached = Math.max(0, stepOf(order.stage), ...events.map((e) => stepOf(e.status)));
  const firstAt = (i: number) => events.find((e) => steps[i].statuses.includes(e.status))?.at ?? null;
  const cancelled = order.stage === "cancelled";
  const pendingStock = order.status === "Pending stock or production" || events.some((e) => e.status === "pending_stock");
  const confirmPending = order.confirmation === "pending" && !cancelled;
  const canCancel = !cancelled && (order.stage === "submitted" || order.stage === "awaiting_confirmation");
  const gstLines = lines.reduce((sum, l) => {
    const rate = Number(l.gst_rate ?? 0);
    return sum + (rate > 0 ? (Number(l.line_total) * rate) / (100 + rate) : 0);
  }, 0);

  return (
    <div className="flex flex-col gap-4">
      <PageTitle
        back={{ href: "/trade/orders", label: "Orders" }}
        title={order.order_no}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <StatusPill label={order.status} />
            <span>Placed {dateTime(order.created_at)}</span>
            <span>· {order.source === "sales_rep" ? `By your salesperson${order.entered_by ? ` (${order.entered_by})` : ""}` : order.entered_by ?? ""}</span>
          </span>
        }
      />

      {cancelled ? (
        <Notice tone="bad">
          <p className="font-semibold">This order was cancelled.</p>
          {order.cancel_reason ? <p className="mt-0.5">Reason: {order.cancel_reason}</p> : null}
        </Notice>
      ) : null}
      {order.stage === "returned" ? <Notice tone="bad">This order was returned. Any credit note will appear in your account statement.</Notice> : null}
      {order.stage === "partially_delivered" ? <Notice tone="warn">Part of this order has been delivered. The rest will follow — see the lines below.</Notice> : null}
      {order.stage === "delivery_failed" ? <Notice tone="warn">We could not deliver this order and will reschedule. Your salesperson will be in touch.</Notice> : null}
      {order.on_hold ? <Notice tone="warn">This order is on hold. Our team will contact you.</Notice> : null}

      <OrderActions orderId={order.id} canConfirm={confirmPending} canCancel={canCancel} />

      <div className="flex flex-wrap gap-2">
        {me.state === "active" ? (
          <Link href={`/trade/quick-order?reorder=${order.id}`} className="flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">
            Reorder
          </Link>
        ) : null}
        <a href={`/trade/orders/${order.id}/summary`} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-xl border-2 border-ink/15 bg-white px-4 text-sm font-semibold text-ink">
          Order summary
        </a>
        {order.invoice_number ? (
          <a href={`/invoice/${order.id}`} target="_blank" rel="noopener" className="flex min-h-11 items-center rounded-xl border-2 border-ink/15 bg-white px-4 text-sm font-semibold text-ink">
            Tax invoice {order.invoice_number}
          </a>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          {!cancelled ? (
            <Card title="Tracking">
              <ol className="relative">
                {steps.map((s, i) => {
                  const done = i <= reached;
                  const current = i === reached;
                  let label = s.label;
                  if (i === 1 && order.stage === "awaiting_confirmation") label = "Awaiting your confirmation";
                  if (i === 1 && order.stage === "awaiting_payment") label = "Awaiting payment";
                  if (i === 2) label = pendingStock && reached <= 2 ? "Pending stock or production" : "Accepted by operations";
                  if (i === 6 && order.stage === "partially_dispatched") label = "Partly dispatched";
                  if (i === 8 && order.stage === "partially_delivered") label = "Partially delivered";
                  const at = firstAt(i);
                  return (
                    <li key={s.label} className="flex gap-3 pb-4 last:pb-0">
                      <div className="flex flex-col items-center">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                            done ? (current ? "bg-primary text-white ring-4 ring-primary-light/40" : "bg-emerald-600 text-white") : "bg-ink/10 text-dark/40"
                          }`}
                          aria-hidden="true"
                        >
                          {done && !current ? "✓" : i + 1}
                        </span>
                        {i < steps.length - 1 ? <span className={`mt-1 w-0.5 flex-1 ${i < reached ? "bg-emerald-600" : "bg-ink/10"}`} /> : null}
                      </div>
                      <div className="pb-1">
                        <p className={`text-sm ${done ? "font-bold text-ink" : "text-dark/45"}`}>
                          {label}
                          {current ? <span className="sr-only"> (current)</span> : null}
                        </p>
                        {at ? <p className="text-xs text-dark/55">{dateTime(at)}</p> : null}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </Card>
          ) : null}

          <Card title="Items">
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[480px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-dark/55">
                    <th className="px-4 py-2 font-semibold sm:px-0">Item</th>
                    <th className="px-2 py-2 text-right font-semibold">Qty</th>
                    <th className="px-2 py-2 text-right font-semibold">Rate</th>
                    <th className="px-4 py-2 text-right font-semibold sm:px-0">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l) => (
                    <tr key={l.order_item_id} className="border-b border-ink/5 align-top">
                      <td className="px-4 py-2 sm:px-0">
                        <p className="font-semibold text-ink">{l.name}</p>
                        <p className="text-xs text-dark/55">
                          {[l.code, l.pack].filter(Boolean).join(" · ")}
                          {l.gst_rate !== null ? ` · GST ${l.gst_rate}%` : ""}
                        </p>
                        {l.dispatched !== null && Number(l.dispatched) > 0 && Number(l.dispatched) < Number(l.qty) ? (
                          <p className="text-xs font-semibold text-amber-700">Dispatched {qty(l.dispatched)} of {qty(l.qty)}</p>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 text-right">{qty(l.qty)}</td>
                      <td className="px-2 py-2 text-right">
                        {inr(l.unit_price)}
                        {l.list_price !== null && Number(l.list_price) > Number(l.unit_price) ? <span className="block text-xs text-dark/40 line-through">{inr(l.list_price)}</span> : null}
                      </td>
                      <td className="px-4 py-2 text-right font-semibold sm:px-0">{inr(l.line_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="text-sm">
                  <tr>
                    <td colSpan={3} className="px-4 pt-3 text-right text-dark/60 sm:px-0">Subtotal</td>
                    <td className="px-4 pt-3 text-right sm:px-0">{inr(order.subtotal)}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-4 text-right text-dark/60 sm:px-0">Delivery</td>
                    <td className="px-4 text-right sm:px-0">{Number(order.delivery_fee) > 0 ? inr(order.delivery_fee) : "Free"}</td>
                  </tr>
                  <tr>
                    <td colSpan={3} className="px-4 pt-1 text-right font-bold text-ink sm:px-0">Total</td>
                    <td className="px-4 pt-1 text-right font-heading text-lg font-bold text-ink sm:px-0">{inr(order.total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-4 text-right text-xs text-dark/50 sm:px-0">
                      Prices include GST (about {inr(gstLines)})
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <Card title="History">
            {events.length === 0 ? (
              <p className="text-sm text-dark/60">No updates yet.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {[...events].reverse().map((e, i) => (
                  <li key={`${e.at}-${i}`} className="flex flex-wrap items-start justify-between gap-2 py-2.5">
                    <div className="min-w-0">
                      <StatusPill label={e.label} />
                      {e.note ? <p className="mt-1 text-sm text-dark/70">{e.note}</p> : null}
                    </div>
                    <span className="text-xs text-dark/55">{dateTime(e.at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {dispatches.length ? (
            <Card title="Dispatch">
              <ul className="flex flex-col gap-3">
                {dispatches.map((d) => (
                  <li key={d.dispatch_no} className="rounded-xl bg-[#f6f4f1] p-3 text-sm">
                    <p className="font-semibold text-ink">
                      {d.dispatch_no} · {dispatchStatus[d.status] ?? d.status}
                    </p>
                    <p className="text-dark/65">Dispatched {dateTime(d.dispatched_at)}</p>
                    {d.delivery_person ? <p className="text-dark/65">Delivery by {d.delivery_person}</p> : null}
                    {d.delivered_at ? (
                      <p className="font-semibold text-emerald-700">Delivered {dateTime(d.delivered_at)}</p>
                    ) : d.expected_at ? (
                      <p className="text-dark/65">Expected {dateTime(d.expected_at)}</p>
                    ) : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Card title="Delivery & payment">
            <dl className="flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-dark/55">Deliver to</dt>
                <dd className="text-ink">
                  {customer.shop_name}
                  <br />
                  {order.delivery_address}
                  {order.city ? `, ${order.city}` : ""}
                  {order.pincode ? ` ${order.pincode}` : ""}
                </dd>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <dt className="text-dark/55">Requested date</dt>
                  <dd className="text-ink">{order.requested_delivery_date ? date(order.requested_delivery_date) : "Earliest"}</dd>
                </div>
                <div>
                  <dt className="text-dark/55">Confirmed date</dt>
                  <dd className="font-semibold text-ink">{order.delivery_date ? date(order.delivery_date) : "To be confirmed"}</dd>
                </div>
              </div>
              <div>
                <dt className="text-dark/55">Payment</dt>
                <dd className="text-ink">{paymentMethods[order.payment_method] ?? order.payment_method}</dd>
              </div>
              {order.invoice_number ? (
                <div>
                  <dt className="text-dark/55">Invoice</dt>
                  <dd className="text-ink">
                    {order.invoice_number}
                    {order.invoice_date ? ` · ${date(order.invoice_date)}` : ""}
                  </dd>
                </div>
              ) : null}
              {order.notes ? (
                <div>
                  <dt className="text-dark/55">Notes</dt>
                  <dd className="whitespace-pre-line text-ink">{order.notes}</dd>
                </div>
              ) : null}
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
