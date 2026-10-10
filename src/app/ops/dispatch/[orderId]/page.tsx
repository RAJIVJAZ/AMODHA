import { notFound } from "next/navigation";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, Notice, NumberInput, PageHeader, Select, StatusBadge, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { dateTime, inr, label, qty } from "@/lib/ops/format";

type Order = {
  id: string; order_number: number; created_at: string; source: string; customer_name: string; phone: string; email: string | null; address: string; city: string;
  pincode: string; notes: string | null; payment_method: string; payment_status: string; status: string; fulfilment_status: string; on_hold: boolean; hold_reason: string | null;
  subtotal: number; delivery_fee: number; discount: number; total: number; milk_subscriber: boolean; invoice_number: string | null; delivery_date: string | null; delivery_slot: string | null;
};
type Line = { order_item_id: string; item_id: string | null; product_name: string; pack_label: string; ordered: number; reserved: number; dispatched: number };
type Alloc = { id: string; order_item_id: string; qty: number; qty_dispatched: number; qty_released: number; stock_lots: { lot_code: string; expiry_date: string | null; batch_id: string | null } | null; items: { name: string } | null };
type Disp = { id: string; dispatch_no: string; status: string; delivery_person: string | null; dispatched_at: string; expected_at: string | null; delivered_at: string | null; remarks: string | null;
  cash_collected: number | null; collection_method: string | null;
  dispatch_lines: { id: string; qty: number; qty_returned: number; items: { name: string } | null; stock_lots: { lot_code: string } | null; batch_id: string | null }[] };

export default async function OrderFulfilmentPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  const ops = await requireOps("dispatch");
  const { data: oData } = await ops.supabase.from("orders").select("*").eq("id", orderId).maybeSingle();
  if (!oData) notFound();
  const o = oData as Order;

  const [{ data: linesData }, { data: allocData }, { data: dispData }, { data: events }] = await Promise.all([
    ops.supabase.from("v_order_line_fulfilment").select("*").eq("order_id", orderId),
    ops.supabase.from("order_allocations").select("id, order_item_id, qty, qty_dispatched, qty_released, stock_lots(lot_code, expiry_date, batch_id), items(name)").eq("order_id", orderId).order("created_at"),
    ops.supabase
      .from("dispatches")
      .select("id, dispatch_no, status, delivery_person, dispatched_at, expected_at, delivered_at, remarks, cash_collected, collection_method, dispatch_lines(id, qty, qty_returned, batch_id, items(name), stock_lots(lot_code))")
      .eq("order_id", orderId)
      .order("dispatched_at"),
    ops.supabase.from("order_events").select("at, status, note").eq("order_id", orderId).order("at"),
  ]);
  const lines = (linesData ?? []) as Line[];
  const allocs = (allocData ?? []) as unknown as Alloc[];
  const disps = (dispData ?? []) as unknown as Disp[];
  const openAllocs = allocs.filter((a) => a.qty - a.qty_dispatched - a.qty_released > 0);

  const itemIds = lines.map((l) => l.item_id).filter(Boolean) as string[];
  const { data: stock } = itemIds.length ? await ops.supabase.from("v_stock_summary").select("item_id, available, unit").in("item_id", itemIds) : { data: [] };
  const available = new Map(((stock ?? []) as { item_id: string; available: number }[]).map((s) => [s.item_id, Number(s.available)]));
  const short = lines.filter((l) => Number(l.ordered) - Number(l.reserved) - Number(l.dispatched) > 0);
  const closed = ["awaiting_payment", "cancelled", "delivered", "returned"].includes(o.fulfilment_status);
  const canEdit = ops.can("dispatch", "edit");

  return (
    <>
      <PageHeader
        title={`Order #${o.order_number}`}
        description={`${o.customer_name} · ${o.phone} · ${label(o.source)} order placed ${dateTime(o.created_at)}${o.invoice_number ? ` · invoice ${o.invoice_number}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            {o.milk_subscriber ? <Badge tone="info">⭐ milk subscriber — priority</Badge> : null}
            <StatusBadge status={o.fulfilment_status} />
          </div>
        }
      />
      {o.on_hold ? (
        <div className="mb-4">
          <Notice tone="bad">On hold: {o.hold_reason}</Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Items" description="Reserved stock is held for this order; dispatched stock has left the factory.">
            <Table head={["Product", "Ordered", "Reserved", "Dispatched", "Still needed", "Free stock"]}>
              {lines.map((l) => {
                const need = Number(l.ordered) - Number(l.reserved) - Number(l.dispatched);
                return (
                  <tr key={l.order_item_id}>
                    <Td>
                      {l.product_name} <span className="text-dark/55">{l.pack_label}</span>
                      {l.item_id ? null : <Badge tone="bad">not linked to stock</Badge>}
                    </Td>
                    <Td right>{qty(l.ordered)}</Td>
                    <Td right>{qty(l.reserved)}</Td>
                    <Td right>{qty(l.dispatched)}</Td>
                    <Td right className={need > 0 ? "font-semibold text-accent-dark" : ""}>
                      {need > 0 ? qty(need) : "—"}
                    </Td>
                    <Td right>{l.item_id ? qty(available.get(l.item_id) ?? 0) : "—"}</Td>
                  </tr>
                );
              })}
            </Table>
            {!closed && short.length && ops.can("dispatch", "create") ? (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <OpsForm fn="disp_allocate_order" submitLabel="Allocate stock (oldest expiry first)" success="Stock allocated where available">
                  <input type="hidden" name="p_order_id" value={o.id} />
                </OpsForm>
                {short.some((l) => (l.item_id ? (available.get(l.item_id) ?? 0) : 0) < Number(l.ordered) - Number(l.reserved) - Number(l.dispatched)) ? (
                  <p className="text-sm text-accent-dark">Not enough saleable stock for everything: allocate what there is, hold the order, or make more.</p>
                ) : null}
              </div>
            ) : null}
          </Card>

          <Card title="Reserved stock by batch">
            {allocs.length ? (
              <Table head={["Product", "Lot / batch", "Reserved", "Dispatched", "Released", ""]} compact>
                {allocs.map((a) => (
                  <tr key={a.id}>
                    <Td>{a.items?.name}</Td>
                    <Td>
                      {a.stock_lots?.batch_id ? (
                        <a href={`/ops/production/${a.stock_lots.batch_id}`} className="text-primary-dark hover:underline">
                          {a.stock_lots.lot_code}
                        </a>
                      ) : (
                        a.stock_lots?.lot_code
                      )}
                    </Td>
                    <Td right>{qty(a.qty)}</Td>
                    <Td right>{qty(a.qty_dispatched)}</Td>
                    <Td right>{qty(a.qty_released)}</Td>
                    <Td>
                      {canEdit && a.qty - a.qty_dispatched - a.qty_released > 0 ? (
                        <OpsForm fn="disp_release_allocation" submitLabel="Release" variant="quiet" inline confirm="Release this reserved stock for other orders?" success="Released">
                          <input type="hidden" name="p_allocation_id" value={a.id} />
                          <input type="hidden" name="p_reason" value="Reallocated" />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Nothing allocated yet.</Empty>
            )}
          </Card>

          {!closed && openAllocs.length && canEdit && !o.on_hold ? (
            <Card title="Dispatch" description="Send everything reserved, or edit quantities for a partial dispatch.">
              <OpsForm fn="disp_dispatch_order" submitLabel="Dispatch" idempotent success="Dispatched">
                <input type="hidden" name="p_order_id" value={o.id} />
                <LineEditor
                  name="p_lines#json"
                  fixedRows
                  initial={openAllocs.map((a) => ({ allocation_id: a.id, qty: String(a.qty - a.qty_dispatched - a.qty_released) }))}
                  columns={[
                    {
                      key: "allocation_id",
                      label: "Reserved stock",
                      type: "select",
                      required: true,
                      options: openAllocs.map((a) => ({ value: a.id, label: `${a.items?.name} · lot ${a.stock_lots?.lot_code} (${qty(a.qty - a.qty_dispatched - a.qty_released)} reserved)` })),
                    },
                    { key: "qty", label: "Quantity to send", type: "number", width: "9rem" },
                  ]}
                />
                <Grid cols={3}>
                  <Input label="Delivery person" name="p_delivery_person" />
                  <Input label="Expected delivery" name="p_expected_at#ist" type="datetime-local" />
                  <Input label="Remarks" name="p_remarks" />
                </Grid>
              </OpsForm>
            </Card>
          ) : null}

          <Card title="Dispatches">
            {disps.length ? (
              <div className="flex flex-col gap-4">
                {disps.map((d) => (
                  <div key={d.id} className="rounded-xl border border-ink/10 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="font-semibold text-ink">
                        {d.dispatch_no} <StatusBadge status={d.status} />
                      </p>
                      <p className="text-xs text-dark/60">
                        {d.delivery_person ? `${d.delivery_person} · ` : ""}sent {dateTime(d.dispatched_at)}
                        {d.delivered_at ? ` · delivered ${dateTime(d.delivered_at)}` : ""}
                        {d.cash_collected ? ` · collected ${inr(d.cash_collected, 0)} (${d.collection_method})` : ""}
                      </p>
                    </div>
                    <ul className="mt-1 text-sm">
                      {d.dispatch_lines.map((l) => (
                        <li key={l.id}>
                          {qty(l.qty)} × {l.items?.name} — lot {l.stock_lots?.lot_code}
                          {l.qty_returned ? <span className="text-accent-dark"> ({qty(l.qty_returned)} returned)</span> : null}
                        </li>
                      ))}
                    </ul>
                    {d.remarks ? <p className="mt-1 text-xs text-dark/60">{d.remarks}</p> : null}
                    {canEdit && ["dispatched", "out_for_delivery", "delivered", "partially_delivered"].includes(d.status) ? (
                      <details className="mt-2">
                        <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Update delivery</summary>
                        <div className="mt-2">
                          <OpsForm fn="disp_update_delivery" submitLabel="Save delivery update" success="Updated">
                            <input type="hidden" name="p_dispatch_id" value={d.id} />
                            <Grid cols={3}>
                              <Select
                                label="Status"
                                name="p_status"
                                options={[
                                  ...(d.status === "dispatched" ? [{ value: "out_for_delivery", label: "Out for delivery" }] : []),
                                  ...(["dispatched", "out_for_delivery"].includes(d.status)
                                    ? [
                                        { value: "delivered", label: "Delivered" },
                                        { value: "partially_delivered", label: "Partly delivered (some returned)" },
                                        { value: "delivery_failed", label: "Delivery failed (all back)" },
                                      ]
                                    : []),
                                  { value: "returned", label: "Returned by customer" },
                                ]}
                              />
                              {o.payment_method === "cod" ? <NumberInput label="Cash / UPI collected (₹)" name="p_cash_collected#num" /> : null}
                              {o.payment_method === "cod" ? (
                                <Select label="Collected by" name="p_collection_method" placeholder="—" options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }]} />
                              ) : null}
                              <Input label="Remarks" name="p_remarks" wrapClass="sm:col-span-2" />
                            </Grid>
                            <LineEditor
                              name="p_returns#json"
                              addLabel="Add returned line"
                              minRows={0}
                              columns={[
                                { key: "dispatch_line_id", label: "Returned item (partial returns only)", type: "select", required: true, options: d.dispatch_lines.map((l) => ({ value: l.id, label: `${l.items?.name} (${qty(l.qty - l.qty_returned)} sent)` })) },
                                { key: "qty", label: "Qty back", type: "number", width: "8rem" },
                              ]}
                            />
                            <Checkbox label="Returned goods are fit to sell again (otherwise written off)" name="p_restock#bool" defaultChecked />
                          </OpsForm>
                        </div>
                      </details>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : (
              <Empty>Not dispatched yet.</Empty>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Deliver to">
            <p className="text-sm">
              {o.customer_name}
              <br />
              {o.address}, {o.city} – {o.pincode}
              <br />
              <a href={`tel:+91${o.phone}`} className="font-semibold text-primary-dark">
                +91 {o.phone}
              </a>
            </p>
            {o.delivery_date ? <p className="mt-2 text-sm">Delivery: {o.delivery_date} {o.delivery_slot ?? ""}</p> : null}
            {o.notes ? <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm">Note: {o.notes}</p> : null}
          </Card>
          <Card title="Payment">
            <p className="text-sm">
              Items {inr(o.subtotal, 0)} · delivery {inr(o.delivery_fee, 0)}
              {o.discount ? ` · discount −${inr(o.discount, 0)}` : ""}
              <br />
              <strong>Total {inr(o.total, 0)}</strong> · {o.payment_method === "cod" ? "pay on delivery" : `online (${o.payment_status})`}
            </p>
            {o.invoice_number ? (
              <a href={`/invoice/${o.id}`} target="_blank" rel="noopener" className="mt-2 inline-block text-sm font-semibold text-primary-dark hover:underline">
                Tax invoice {o.invoice_number}
              </a>
            ) : null}
          </Card>
          {!closed && canEdit ? (
            <Card title="Stage">
              <div className="flex flex-wrap gap-2">
                {(["processing", "picking", "packed", "ready_for_dispatch"] as const).map((s) => (
                  <OpsForm key={s} fn="disp_set_stage" submitLabel={label(s)} variant={o.fulfilment_status === s ? "primary" : "secondary"} inline success="Updated">
                    <input type="hidden" name="p_order_id" value={o.id} />
                    <input type="hidden" name="p_stage" value={s} />
                  </OpsForm>
                ))}
              </div>
            </Card>
          ) : null}
          {!closed && ops.can("dispatch", "approve") ? (
            <Card title={o.on_hold ? "Release hold" : "Hold order"}>
              <OpsForm fn="disp_hold_order" submitLabel={o.on_hold ? "Release hold" : "Put on hold"} variant={o.on_hold ? "primary" : "danger"} success="Updated">
                <input type="hidden" name="p_order_id" value={o.id} />
                <input type="hidden" name="p_hold#bool" value={o.on_hold ? "false" : "true"} />
                <Input label="Reason" name="p_reason" required={!o.on_hold} />
              </OpsForm>
            </Card>
          ) : null}
          <Card title="History">
            <ol className="flex flex-col gap-1 text-sm">
              {((events ?? []) as { at: string; status: string; note: string | null }[]).map((e, i) => (
                <li key={i}>
                  <StatusBadge status={e.status} /> <span className="text-xs text-dark/55">{dateTime(e.at)}</span>
                  {e.note ? <span className="text-xs text-dark/70"> — {e.note}</span> : null}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
