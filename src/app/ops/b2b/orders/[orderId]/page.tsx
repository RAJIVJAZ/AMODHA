import Link from "next/link";
import { notFound } from "next/navigation";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, ButtonLink, Card, Checkbox, Empty, Grid, Input, Notice, PageHeader, Select, Table, Td, TextArea } from "@/components/ops/ui";
import { approvalReasons, channels, paymentMethods, statusTone } from "@/lib/b2b/labels";
import type { AmendDoc, CatalogueItem, OrderDetail } from "@/lib/b2b/types";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, qty, todayIST } from "@/lib/ops/format";
import { num, priorities, priorityTone, UUID, type PackingSlip } from "../../_lib";

export const metadata = { title: "B2B order" };

type Staff = { user_id: string; email: string | null; full_name: string | null; active: boolean };

const PACKABLE = ["processing", "picking", "packed", "ready_for_dispatch", "partially_dispatched"];
const EARLY = ["submitted", "awaiting_confirmation"];
const ACCEPTED = ["confirmed", "processing", "picking", "packed", "ready_for_dispatch"];

function AmendLines({ doc }: { doc: AmendDoc | null | undefined }) {
  if (!doc) return null;
  return (
    <ul className="text-xs">
      {doc.lines.map((l, i) => (
        <li key={i}>
          {qty(l.qty)} × {l.name} @ {inr(l.unit_price, 0)}
        </li>
      ))}
      <li className="font-semibold">Total {inr(doc.total, 0)}</li>
      {doc.requested_delivery_date ? <li className="text-dark/55">Delivery asked {date(doc.requested_delivery_date)}</li> : null}
    </ul>
  );
}

export default async function B2BOrderPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) notFound();
  const ops = await requireOps("dispatch");

  const [{ data: detailData, error }, { data: slipData }] = await Promise.all([
    ops.supabase.rpc("b2b_order_detail", { p_order_id: orderId }),
    ops.supabase.rpc("ops_packing_slip", { p_order_id: orderId }),
  ]);
  if (error || !detailData) notFound();
  const d = detailData as OrderDetail;
  const slip = (slipData ?? null) as PackingSlip | null;
  const o = d.order;
  const stage = o.stage;

  const canApprove = ops.can("dispatch", "approve");
  const canEdit = ops.can("dispatch", "edit");
  const canConfirm = ops.can("b2b_customers", "approve") && o.confirmation === "pending";
  const anyDispatched = d.lines.some((l) => num(l.dispatched) > 0);
  const canAmend = !anyDispatched && ((EARLY.includes(stage) && (ops.can("b2b_customers", "edit") || canEdit)) || (ACCEPTED.includes(stage) && canApprove));
  const canCancel =
    !anyDispatched &&
    !["cancelled", "delivered", "returned"].includes(stage) &&
    (EARLY.includes(stage) ? ops.can("b2b_customers", "edit") || canApprove : canApprove);
  const reasons = o.approval_reasons ?? [];
  const needsFinance = reasons.includes("credit_limit") || reasons.includes("overdue_invoices");

  const [catalogueRes, staffRes] = await Promise.all([
    canAmend ? ops.supabase.rpc("b2b_catalogue", { p_customer_id: d.customer.id }) : Promise.resolve({ data: [] }),
    canApprove && ops.can("users") ? ops.supabase.rpc("ops_staff_directory") : Promise.resolve({ data: [] }),
  ]);
  const catalogue = (catalogueRes.data ?? []) as CatalogueItem[];
  const managers = ((staffRes.data ?? []) as Staff[]).filter((s) => s.active);
  const itemOptions = catalogue.map((c) => ({ value: c.item_id, label: `${c.name}${c.pack ? ` · ${c.pack}` : ""}${c.price !== null ? ` · ${inr(c.price, 0)}` : ""}` }));
  for (const l of d.lines) {
    if (l.item_id && !itemOptions.some((x) => x.value === l.item_id)) itemOptions.push({ value: l.item_id, label: `${l.name} · ${l.pack} (not in this customer's catalogue)` });
  }

  return (
    <>
      <PageHeader
        title={`B2B order ${o.order_no}`}
        description={
          <>
            {d.customer.shop_name} ({d.customer.customer_code}) · {channels[o.source]?.code ?? o.source} · {o.entered_by ?? ""} · placed {dateTime(o.created_at)}
            {o.invoice_number ? ` · invoice ${o.invoice_number}` : ""}
          </>
        }
        actions={
          <>
            <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${statusTone(o.status)}`}>{o.status}</span>
            <Badge tone={priorityTone[o.priority] ?? "muted"}>{o.priority} priority</Badge>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <ButtonLink href={`/ops/dispatch/${o.id}`} variant="secondary">
          Allocate / dispatch / delivery
        </ButtonLink>
        <a href={`/ops/b2b/orders/${o.id}/slip`} target="_blank" rel="noopener" className="inline-flex items-center rounded-lg border-2 border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-ink/50">
          Packing slip
        </a>
        {o.invoice_number ? (
          <a href={`/invoice/${o.id}`} target="_blank" rel="noopener" className="inline-flex items-center rounded-lg border-2 border-ink/20 bg-white px-4 py-2 text-sm font-semibold text-ink hover:border-ink/50">
            Tax invoice {o.invoice_number}
          </a>
        ) : null}
        <ButtonLink href={`/ops/b2b/customers/${d.customer.id}`} variant="secondary">
          Customer record
        </ButtonLink>
      </div>

      <div className="mb-4 flex flex-col gap-2">
        {o.on_hold ? <Notice tone="bad">This order is on hold. Release the hold in dispatch before accepting it.</Notice> : null}
        {o.cancel_reason && stage === "cancelled" ? <Notice tone="bad">Cancelled: {o.cancel_reason}</Notice> : null}
        {o.confirmation === "pending" ? (
          <Notice tone="warn">Waiting for the shop to confirm this salesperson order in the Wholesale app (or for staff to record their confirmation below).</Notice>
        ) : null}
        {reasons.length ? (
          <Notice tone="warn">
            <p className="font-semibold">Before operations accept this order:</p>
            <ul className="mt-1 list-disc pl-5">
              {reasons.map((r) => (
                <li key={r}>{approvalReasons[r] ?? label(r)}</li>
              ))}
            </ul>
          </Notice>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Items" description={`${d.lines.length} line(s). Prices were set by the server when the order was placed.`}>
            <Table head={["Product", "Code", "Qty", "Price", "List price", "Line total", "Reserved", "Dispatched"]}>
              {d.lines.map((l) => (
                <tr key={l.order_item_id}>
                  <Td>
                    {l.name} <span className="text-dark/55">{l.pack}</span>
                  </Td>
                  <Td>
                    <span className="font-mono text-xs">{l.code ?? "—"}</span>
                  </Td>
                  <Td right>{qty(l.qty)}</Td>
                  <Td right>{inr(l.unit_price, 0)}</Td>
                  <Td right>{l.list_price !== null && num(l.list_price) !== num(l.unit_price) ? inr(l.list_price, 0) : "—"}</Td>
                  <Td right>{inr(l.line_total, 0)}</Td>
                  <Td right className={num(l.reserved) + num(l.dispatched) < num(l.qty) && !["cancelled"].includes(stage) ? "font-semibold text-accent-dark" : ""}>
                    {qty(l.reserved)}
                  </Td>
                  <Td right>{qty(l.dispatched)}</Td>
                </tr>
              ))}
            </Table>
            <dl className="mt-3 grid grid-cols-2 gap-1 text-sm sm:max-w-xs sm:justify-self-end">
              <dt className="text-dark/60">Items</dt>
              <dd className="text-right tabular-nums">{inr(o.subtotal, 0)}</dd>
              <dt className="text-dark/60">Delivery</dt>
              <dd className="text-right tabular-nums">{inr(o.delivery_fee, 0)}</dd>
              <dt className="font-semibold">Total (GST incl.)</dt>
              <dd className="text-right font-semibold tabular-nums">{inr(o.total, 0)}</dd>
            </dl>
          </Card>

          {slip ? (
            <Card title="To pick, by batch" description="Reserved stock for each line, oldest expiry first.">
              <Table head={["Product", "SKU", "Ordered", "To pick", "Dispatched", "Lots / batches", "Last packed"]} compact>
                {slip.lines.map((l) => (
                  <tr key={l.order_item_id}>
                    <Td>
                      {l.name} <span className="text-dark/55">{l.pack}</span>
                    </Td>
                    <Td>
                      <span className="font-mono text-xs">{l.sku ?? "—"}</span>
                    </Td>
                    <Td right>{qty(l.ordered)}</Td>
                    <Td right>{qty(l.to_pick)}</Td>
                    <Td right>{qty(l.dispatched)}</Td>
                    <Td>
                      {l.lots.length
                        ? l.lots.map((lot, i) => (
                            <div key={i} className="text-xs">
                              {lot.batch_id ? (
                                <Link href={`/ops/production/${lot.batch_id}`} className="text-primary-dark hover:underline">
                                  {lot.lot_code}
                                </Link>
                              ) : (
                                lot.lot_code
                              )}{" "}
                              · {qty(lot.qty)}
                              {lot.expiry_date ? ` · exp ${date(lot.expiry_date)}` : ""}
                            </div>
                          ))
                        : "—"}
                    </Td>
                    <Td right>{l.last_packed !== null ? qty(l.last_packed) : "—"}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}

          {slip && PACKABLE.includes(stage) && canEdit ? (
            <Card title="Packing" description="Record what was actually packed. Any difference from 'to pick' needs an exception note.">
              <OpsForm fn="ops_record_packing" submitLabel="Record packing" success="Packing recorded" resetOnSuccess={false}>
                <input type="hidden" name="p_order_id" value={o.id} />
                <LineEditor
                  name="p_lines#json"
                  fixedRows
                  initial={slip.lines.map((l) => ({ order_item_id: l.order_item_id, qty_packed: String(num(l.to_pick)) }))}
                  columns={[
                    {
                      key: "order_item_id",
                      label: "Line",
                      type: "select",
                      required: true,
                      options: slip.lines.map((l) => ({ value: l.order_item_id, label: `${l.name} ${l.pack} — to pick ${qty(l.to_pick)} of ${qty(l.ordered)}` })),
                    },
                    { key: "qty_packed", label: "Packed", type: "number", width: "8rem" },
                  ]}
                />
                <fieldset className="flex flex-col gap-2 rounded-xl bg-ink/5 p-3">
                  <legend className="px-1 text-sm font-semibold text-ink">Checklist</legend>
                  <Checkbox name="p_checklist.count_matches#bool" label="Count of packs matches the slip" />
                  <Checkbox name="p_checklist.labels_checked#bool" label="Labels, batch codes and expiry dates checked" />
                  <Checkbox name="p_checklist.seals_intact#bool" label="Seals and packaging intact" />
                  <Checkbox name="p_checklist.invoice_copy#bool" label="Delivery copy / slip placed with the goods" />
                </fieldset>
                <TextArea label="Exception (if packed differs)" name="p_exception_reason" placeholder="What is short and why" />
              </OpsForm>
            </Card>
          ) : null}

          {slip?.packing.length ? (
            <Card title="Packing record">
              <Table head={["When", "Product", "To pick", "Packed", "Exception", "By"]} compact>
                {slip.packing.map((p, i) => (
                  <tr key={i}>
                    <Td>{dateTime(p.at)}</Td>
                    <Td>{p.product}</Td>
                    <Td right>{qty(p.to_pick)}</Td>
                    <Td right className={num(p.packed) !== num(p.to_pick) ? "font-semibold text-accent-dark" : ""}>
                      {qty(p.packed)}
                    </Td>
                    <Td>{p.exception}</Td>
                    <Td>{p.by}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}

          <Card title="Amendments" description="Original and revised lines, who changed them, when and why.">
            {d.amendments?.length ? (
              <Table head={["#", "When", "By", "Reason", "Before", "After"]} compact>
                {d.amendments.map((a) => (
                  <tr key={a.no}>
                    <Td>{a.no}</Td>
                    <Td>{dateTime(a.at)}</Td>
                    <Td>{a.by ?? "—"}</Td>
                    <Td>{a.reason}</Td>
                    <Td>
                      <AmendLines doc={a.before} />
                    </Td>
                    <Td>
                      <AmendLines doc={a.after} />
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>Not amended.</Empty>
            )}
          </Card>

          {canAmend ? (
            <Card
              title="Amend order"
              description={
                ACCEPTED.includes(stage)
                  ? "Operations approval: the reserved stock is released and the order goes back to operations to accept again."
                  : "The order goes back to operations to accept. Prices are recalculated by the server."
              }
            >
              <OpsForm fn="b2b_amend_order" submitLabel="Save amendment" success="Order amended" resetOnSuccess={false} confirm="Save this change to the order?">
                <input type="hidden" name="p_order_id" value={o.id} />
                <LineEditor
                  name="p_lines#json"
                  initial={d.lines.filter((l) => l.item_id).map((l) => ({ item_id: l.item_id as string, qty: String(num(l.qty)) }))}
                  addLabel="Add product"
                  columns={[
                    { key: "item_id", label: "Product", type: "select", required: true, options: itemOptions },
                    { key: "qty", label: "Qty", type: "number", width: "7rem" },
                  ]}
                />
                <Grid>
                  <Input label="Reason for the change" name="p_reason" required placeholder="e.g. Shop asked by phone to add 5 boxes" />
                  <Input label="Requested delivery date" name="p_requested_delivery_date#date" type="date" min={todayIST()} defaultValue={o.requested_delivery_date ?? ""} />
                </Grid>
                <TextArea label="Order notes (optional)" name="p_notes" defaultValue={o.notes ?? ""} />
              </OpsForm>
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Customer and delivery">
            <dl className="grid grid-cols-1 gap-2 text-sm">
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Shop</dt>
                <dd>
                  <Link href={`/ops/b2b/customers/${d.customer.id}`} className="font-semibold text-primary-dark hover:underline">
                    {d.customer.shop_name}
                  </Link>{" "}
                  · {d.customer.customer_code}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Contact</dt>
                <dd>
                  {d.customer.owner_name} ·{" "}
                  <a href={`tel:${d.customer.mobile}`} className="text-primary-dark">
                    {d.customer.mobile}
                  </a>
                  {d.customer.gstin ? <div className="text-xs text-dark/55">GSTIN {d.customer.gstin}</div> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Deliver to</dt>
                <dd>
                  {o.delivery_address}, {o.city} {o.pincode}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Delivery date</dt>
                <dd>
                  {o.delivery_date ? date(o.delivery_date) : "not set"}
                  {o.requested_delivery_date ? <span className="text-dark/55"> · asked {date(o.requested_delivery_date)}</span> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Payment</dt>
                <dd>
                  {paymentMethods[o.payment_method] ?? label(o.payment_method)} · {label(o.payment_status)}
                  {num(o.paid_recorded) > 0 ? <div className="text-xs text-dark/55">{inr(o.paid_recorded, 0)} received against this order</div> : null}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-semibold uppercase text-dark/55">Customer confirmation</dt>
                <dd>{o.confirmation === "not_required" ? "Not needed" : label(o.confirmation)}</dd>
              </div>
              {o.notes ? (
                <div>
                  <dt className="text-xs font-semibold uppercase text-dark/55">Notes</dt>
                  <dd className="whitespace-pre-line">{o.notes}</dd>
                </div>
              ) : null}
            </dl>
          </Card>

          {stage === "submitted" && canApprove && !o.on_hold ? (
            <Card title="Accept order" description="Sets the delivery date and reserves stock (oldest expiry first). Anything that cannot be reserved shows as pending stock / production.">
              {needsFinance ? (
                <div className="mb-3">
                  <Notice tone={ops.can("sales", "approve") ? "warn" : "bad"}>
                    This order is over the credit limit or the shop has overdue invoices: accepting it is a finance approval
                    {ops.can("sales", "approve") ? " — give the reason in the note." : ". Ask someone in finance (sales approval) to accept it."}
                  </Notice>
                </div>
              ) : null}
              {reasons.includes("advance_payment") ? (
                <div className="mb-3">
                  <Notice tone="warn">Advance payment: finance must record the payment against this order before it can be accepted.</Notice>
                </div>
              ) : null}
              <OpsForm fn="b2b_accept_order" submitLabel="Accept order" success="Order accepted">
                <input type="hidden" name="p_order_id" value={o.id} />
                <Input label="Delivery date" name="p_delivery_date#date" type="date" min={todayIST()} defaultValue={o.requested_delivery_date ?? todayIST(1)} />
                <TextArea label={needsFinance ? "Approval note (required)" : "Note (optional)"} name="p_note" required={needsFinance} />
                <Checkbox name="p_allocate#bool" label="Reserve stock now" defaultChecked />
              </OpsForm>
            </Card>
          ) : null}

          {canConfirm ? (
            <Card title="Record customer confirmation" description="Only when the shop has confirmed (or declined) this order with you directly. Say how.">
              <OpsForm fn="b2b_confirm_order" submitLabel="Customer confirmed" success="Confirmation recorded">
                <input type="hidden" name="p_order_id" value={o.id} />
                <input type="hidden" name="p_confirm#bool" value="true" />
                <Input label="How did they confirm?" name="p_note" required placeholder="By phone with the owner, 10:30" />
              </OpsForm>
              <div className="mt-3 border-t border-ink/10 pt-3">
                <OpsForm fn="b2b_confirm_order" submitLabel="Customer declined" variant="danger" success="Order declined and cancelled" confirm="Record that the customer declined? The order will be cancelled.">
                  <input type="hidden" name="p_order_id" value={o.id} />
                  <input type="hidden" name="p_confirm#bool" value="false" />
                  <Input label="What did they say?" name="p_note" required />
                </OpsForm>
              </div>
            </Card>
          ) : null}

          {canApprove ? (
            <Card title="Priority and ops manager">
              <OpsForm fn="ops_set_order_priority" submitLabel="Save" success="Saved" resetOnSuccess={false}>
                <input type="hidden" name="p_order_id" value={o.id} />
                <Select label="Priority" name="p_priority" options={priorities} defaultValue={o.priority} />
                {managers.length ? (
                  <Select
                    label="Operations manager"
                    name="p_manager"
                    placeholder="— keep current —"
                    options={managers.map((m) => ({ value: m.user_id, label: m.full_name || m.email || m.user_id }))}
                  />
                ) : (
                  <p className="text-xs text-dark/55">The person who accepts the order becomes its operations manager.</p>
                )}
              </OpsForm>
            </Card>
          ) : null}

          {canCancel ? (
            <Card title="Cancel order" description="Reserved stock is released. After dispatch use a return and credit note instead.">
              <OpsForm fn="b2b_cancel_order" submitLabel="Cancel order" variant="danger" confirm="Cancel this order?" success="Order cancelled">
                <input type="hidden" name="p_order_id" value={o.id} />
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}

          <Card title="Timeline">
            {d.events.length ? (
              <ol className="flex flex-col gap-2 text-sm">
                {d.events.map((e, i) => (
                  <li key={i} className="border-l-2 border-ink/15 pl-3">
                    <p className="font-semibold text-ink">{e.label}</p>
                    <p className="text-xs text-dark/55">{dateTime(e.at)}</p>
                    {e.note ? <p className="text-dark/75">{e.note}</p> : null}
                  </li>
                ))}
              </ol>
            ) : (
              <Empty>No events yet.</Empty>
            )}
          </Card>

          {d.dispatches.length ? (
            <Card title="Dispatches">
              <ul className="flex flex-col gap-2 text-sm">
                {d.dispatches.map((x) => (
                  <li key={x.dispatch_no}>
                    <span className="font-semibold">{x.dispatch_no}</span> · {label(x.status)} · {dateTime(x.dispatched_at)}
                    {x.delivery_person ? ` · ${x.delivery_person}` : ""}
                    {x.delivered_at ? <div className="text-xs text-dark/55">delivered {dateTime(x.delivered_at)}</div> : null}
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
