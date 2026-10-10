import Link from "next/link";
import { notFound } from "next/navigation";
import { IssueMaterialFields, QcChecklist, VarianceReasons, type QcParameter } from "@/components/ops/batch-forms";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, Notice, NumberInput, PageHeader, Select, StatusBadge, Table, Td, TextArea } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, qty, todayIST } from "@/lib/ops/format";

type Batch = {
  id: string; batch_no: string; status: string; production_date: string; shift: string; production_unit: string | null; supervisor: string | null;
  planned_qty: number; planned_packaging: string | null; notes: string | null; started_at: string | null; completed_at: string | null;
  output_qty: number | null; finished_qty: number | null; rejected_qty: number | null; rework_qty: number | null; process_loss_qty: number | null;
  production_notes: string | null; yield_pct: number | null; yield_flag: boolean; qc_decision: string | null; qc_at: string | null; qc_notes: string | null;
  unpacked_qty: number | null; unpacked_disposition: string | null; packaging_variance_qty: number | null; packaging_adjustment_reason: string | null;
  released_at: string | null; material_cost: number | null; packaging_cost: number | null; labour_cost: number | null; overhead_cost: number | null;
  total_cost: number | null; cost_per_unit: number | null; cancel_reason: string | null; cancel_mode: string | null;
  product_id: string;
  products: { name: string; code: string; base_unit: string; qc_required: boolean } | null;
  recipes: { version: number; standard_output_qty: number } | null;
};
type Material = { item_id: string; item_name: string; unit: string; planned_qty: number; actual_qty: number; actual_value: number; variance_reason: string | null; from_recipe: boolean };
type Movement = { id: number; occurred_at: string; qty: number; movement_type: string; value: number; reason: string | null; lot_id: string;
  items: { name: string; unit: string } | null; stock_lots: { lot_code: string; supplier_lot: string | null } | null };
type Packaging = { id: string; packs_good: number; packs_rejected: number; packs_damaged: number; net_qty_good: number; net_qty_total: number; packed_by: string;
  packed_on: string; status: string; reverse_reason: string | null; items: { name: string; code: string } | null };

const IN_PROGRESS = ["planned", "materials_issued", "in_production"];

export default async function BatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("production");
  const { data: batchData } = await ops.supabase
    .from("production_batches")
    .select("*, products(name, code, base_unit, qc_required), recipes(version, standard_output_qty)")
    .eq("id", id)
    .maybeSingle();
  if (!batchData) notFound();
  const b = batchData as unknown as Batch;
  const unit = b.products?.base_unit ?? "";

  const [materialsRes, movementsRes, issuableRes, lotsRes, paramsRes, qcRes, packRes, skusRes, eventsRes, correctionsRes, fgLotsRes] = await Promise.all([
    ops.supabase.from("v_batch_materials").select("*").eq("batch_id", id).order("item_name"),
    ops.supabase
      .from("stock_movements")
      .select("id, occurred_at, qty, movement_type, value, reason, lot_id, items(name, unit), stock_lots(lot_code, supplier_lot)")
      .eq("doc_type", "batch")
      .eq("doc_id", id)
      .order("occurred_at"),
    ops.supabase.from("v_stock_summary").select("item_id, name, unit, available").in("item_type", ["raw_material", "consumable", "purchased_good"]).eq("is_active", true).order("name"),
    ops.supabase
      .from("stock_lots")
      .select("id, item_id, lot_code, qty_on_hand, qty_reserved, expiry_date")
      .eq("status", "available")
      .gt("qty_on_hand", 0)
      .order("expiry_date", { ascending: true, nullsFirst: false })
      .limit(500),
    ops.supabase.from("quality_parameters").select("id, name, kind, min_value, max_value, unit, is_required, product_id").eq("scope", "product").eq("is_active", true).order("sort_order"),
    ops.supabase.from("batch_qc_results").select("parameter_name, value_text, value_num, passed, checked_at").eq("batch_id", id).order("checked_at"),
    ops.supabase.from("batch_packaging").select("id, packs_good, packs_rejected, packs_damaged, net_qty_good, net_qty_total, packed_by, packed_on, status, reverse_reason, items(name, code)").eq("batch_id", id).order("created_at"),
    ops.supabase.from("items").select("id, name, net_qty, packaging_configs(name)").eq("product_id", b.product_id).eq("item_type", "finished_good").eq("is_active", true).order("net_qty"),
    ops.supabase.from("batch_events").select("at, from_status, to_status, note").eq("batch_id", id).order("at"),
    ops.supabase.from("batch_corrections").select("field, old_value, new_value, reason, corrected_at").eq("batch_id", id).order("corrected_at"),
    ops.supabase.from("stock_lots").select("id, lot_code, qty_received, qty_on_hand, qty_reserved, unit_cost, expiry_date, items(name)").eq("batch_id", id),
  ]);

  const materials = (materialsRes.data ?? []) as Material[];
  const movements = (movementsRes.data ?? []) as unknown as Movement[];
  const packaging = (packRes.data ?? []) as unknown as Packaging[];
  const { data: thresholdData } = await ops.supabase.from("business_settings").select("value").eq("key", "production.variance_threshold_pct").maybeSingle();
  const threshold = Number(thresholdData?.value ?? 5);

  const variance = (m: Material) => (m.planned_qty > 0 ? ((m.actual_qty - m.planned_qty) / m.planned_qty) * 100 : m.actual_qty > 0 ? Infinity : 0);
  const flagged = (m: Material) => Math.abs(variance(m)) > threshold;
  const activePacks = packaging.filter((p) => p.status === "active");
  const packedTotal = activePacks.reduce((s, p) => s + Number(p.net_qty_total), 0);
  const issuedLots = Object.values(
    movements.reduce<Record<string, { lot_id: string; label: string; net: number }>>((acc, m) => {
      const k = m.lot_id;
      acc[k] ??= { lot_id: k, label: `${m.items?.name} — lot ${m.stock_lots?.lot_code}`, net: 0 };
      acc[k].net += -Number(m.qty);
      return acc;
    }, {})
  ).filter((l) => l.net > 0);
  const qcParams = ((paramsRes.data ?? []) as (QcParameter & { product_id: string | null })[]).filter((p) => !p.product_id || p.product_id === b.product_id);

  const canEdit = ops.can("production", "edit");
  const canApprove = ops.can("production", "approve");

  return (
    <>
      <PageHeader
        title={`Batch ${b.batch_no}`}
        description={
          <>
            {b.products?.name} · planned {qty(b.planned_qty, unit)} · {date(b.production_date)} {b.shift} shift
            {b.production_unit ? ` · ${b.production_unit}` : ""}
            {b.supervisor ? ` · supervisor ${b.supervisor}` : ""} · recipe v{b.recipes?.version}
          </>
        }
        actions={
          <div className="flex items-center gap-2">
            <StatusBadge status={b.status} />
            <Link href={`/ops/production/${b.id}/trace`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
              Traceability
            </Link>
          </div>
        }
      />
      {b.status === "cancelled" ? (
        <div className="mb-4">
          <Notice tone="bad">
            Cancelled ({label(b.cancel_mode)}): {b.cancel_reason}
          </Notice>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Materials: planned vs actual" description={`Variance above ${threshold}% needs an explanation before the batch can be completed.`}>
            {materials.length ? (
              <Table head={["Material", "Planned", "Actual", "Variance", "Cost", "Explanation"]}>
                {materials.map((m) => (
                  <tr key={m.item_id}>
                    <Td>
                      {m.item_name}
                      {m.from_recipe ? null : <Badge tone="info">not in recipe</Badge>}
                    </Td>
                    <Td right>{qty(m.planned_qty, m.unit)}</Td>
                    <Td right>{qty(m.actual_qty, m.unit)}</Td>
                    <Td right className={flagged(m) ? "font-semibold text-accent-dark" : ""}>
                      {m.planned_qty > 0 ? `${variance(m) >= 0 ? "+" : ""}${variance(m).toFixed(1)}%` : m.actual_qty > 0 ? "unplanned" : "—"}
                    </Td>
                    <Td right>{inr(m.actual_value)}</Td>
                    <Td className="text-xs text-dark/70">{m.variance_reason ?? ""}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No materials.</Empty>
            )}
            {movements.length ? (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer font-semibold text-primary-dark">Material issues by lot ({movements.length})</summary>
                <Table head={["When", "Material", "Lot", "Qty", "Type", "Note"]} compact>
                  {movements.map((m) => (
                    <tr key={m.id}>
                      <Td>{dateTime(m.occurred_at)}</Td>
                      <Td>{m.items?.name}</Td>
                      <Td>
                        {m.stock_lots?.lot_code}
                        {m.stock_lots?.supplier_lot ? ` (${m.stock_lots.supplier_lot})` : ""}
                      </Td>
                      <Td right>{qty(-m.qty, m.items?.unit)}</Td>
                      <Td>{label(m.movement_type)}</Td>
                      <Td>{m.reason}</Td>
                    </tr>
                  ))}
                </Table>
              </details>
            ) : null}
          </Card>

          {IN_PROGRESS.includes(b.status) && canEdit ? (
            <Card title="Issue material to this batch" description="Stock is deducted from the chosen lot (or the oldest-expiring lots) straight away.">
              <OpsForm fn="prod_issue_material" submitLabel="Issue material" idempotent success="Material issued">
                <input type="hidden" name="p_batch_id" value={b.id} />
                <IssueMaterialFields
                  items={((issuableRes.data ?? []) as { item_id: string; name: string; unit: string; available: number }[])
                    .filter((i) => Number(i.available) > 0)
                    .map((i) => ({ ...i, available: Number(i.available) }))}
                  lots={((lotsRes.data ?? []) as { id: string; item_id: string; lot_code: string; qty_on_hand: number; qty_reserved: number; expiry_date: string | null }[]).map((l) => ({
                    id: l.id,
                    item_id: l.item_id,
                    label: `${l.lot_code} · ${qty(l.qty_on_hand - l.qty_reserved)} free${l.expiry_date ? ` · exp ${date(l.expiry_date)}` : ""}`,
                  }))}
                />
                <Input label="Note (optional)" name="p_note" placeholder="e.g. issued by Ramesh" />
              </OpsForm>
            </Card>
          ) : null}

          {["materials_issued", "in_production", "production_completed", "awaiting_qc"].includes(b.status) && canEdit && issuedLots.length ? (
            <Card title="Return unused material" description="Puts material back into the lot it came from.">
              <OpsForm fn="prod_return_material" submitLabel="Return to stock" idempotent success="Returned">
                <input type="hidden" name="p_batch_id" value={b.id} />
                <Grid cols={3}>
                  <Select label="Lot" name="p_lot_id" required placeholder="Choose…" options={issuedLots.map((l) => ({ value: l.lot_id, label: `${l.label} (${qty(l.net)} issued)` }))} />
                  <NumberInput label="Quantity" name="p_qty#num" required />
                  <Input label="Reason" name="p_reason" required />
                </Grid>
              </OpsForm>
            </Card>
          ) : null}

          {["planned", "materials_issued"].includes(b.status) && canEdit ? (
            <Card title="Start production">
              <OpsForm fn="prod_start_batch" submitLabel="Mark as in production" success="Production started">
                <input type="hidden" name="p_batch_id" value={b.id} />
              </OpsForm>
            </Card>
          ) : null}

          {["materials_issued", "in_production"].includes(b.status) && canEdit ? (
            <Card title="Record production output" description="Finished + rejected + rework must add up to the actual output.">
              <OpsForm fn="prod_complete_batch" submitLabel="Complete production" success="Output recorded">
                <input type="hidden" name="p_batch_id" value={b.id} />
                <Grid cols={3}>
                  <NumberInput label={`Actual output (${unit})`} name="p_output_qty#num" required />
                  <NumberInput label={`Finished, good (${unit})`} name="p_finished_qty#num" required />
                  <NumberInput label={`Rejected (${unit})`} name="p_rejected_qty#num" defaultValue={0} />
                  <NumberInput label={`Rework (${unit})`} name="p_rework_qty#num" defaultValue={0} />
                  <NumberInput label={`Process loss (${unit})`} name="p_process_loss_qty#num" hint="Leave empty to use planned − output" />
                </Grid>
                <TextArea label="Production notes" name="p_notes" />
                <VarianceReasons
                  materials={materials.map((m) => ({
                    item_id: m.item_id,
                    name: m.item_name,
                    detail: `planned ${qty(m.planned_qty, m.unit)}, used ${qty(m.actual_qty, m.unit)}`,
                    flagged: flagged(m) && !m.variance_reason,
                  }))}
                />
              </OpsForm>
            </Card>
          ) : null}

          {b.completed_at ? (
            <Card title="Output and yield">
              <Grid cols={4}>
                <Out label="Actual output" value={qty(b.output_qty, unit)} />
                <Out label="Finished (good)" value={qty(b.finished_qty, unit)} />
                <Out label="Rejected" value={qty(b.rejected_qty, unit)} />
                <Out label="Rework" value={qty(b.rework_qty, unit)} />
                <Out label="Process loss" value={qty(b.process_loss_qty, unit)} />
                <Out label="Yield vs plan" value={`${b.yield_pct ?? "—"}%${b.yield_flag ? " ⚠ low" : ""}`} bad={b.yield_flag} />
                <Out label="Expected (plan)" value={qty(b.planned_qty, unit)} />
                <Out label="Completed" value={dateTime(b.completed_at)} />
              </Grid>
              {b.production_notes ? <p className="mt-3 text-sm text-dark/70">{b.production_notes}</p> : null}
              {canApprove && ["production_completed", "awaiting_qc", "qc_approved", "qc_rejected"].includes(b.status) ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Correct a recorded figure (keeps the original)</summary>
                  <div className="mt-2">
                    <OpsForm fn="prod_correct_output" submitLabel="Save correction" success="Corrected">
                      <input type="hidden" name="p_batch_id" value={b.id} />
                      <Grid cols={3}>
                        <Select
                          label="Figure"
                          name="p_field"
                          options={["output_qty", "finished_qty", "rejected_qty", "rework_qty", "process_loss_qty"].map((f) => ({ value: f, label: label(f.replace("_qty", "")) }))}
                        />
                        <NumberInput label="Correct value" name="p_new_value#num" required />
                        <Input label="Reason" name="p_reason" required />
                      </Grid>
                    </OpsForm>
                  </div>
                </details>
              ) : null}
            </Card>
          ) : null}

          {b.status === "awaiting_qc" && ops.can("quality", "create") ? (
            <Card title="Quality check" description={ops.can("quality", "approve") ? "Record results, then approve or reject." : "Record results; an approver passes or rejects the batch."}>
              <OpsForm fn="prod_record_qc" submitLabel="Save quality check" success="Quality check saved">
                <input type="hidden" name="p_batch_id" value={b.id} />
                <QcChecklist parameters={qcParams} />
                {ops.can("quality", "approve") ? (
                  <Select
                    label="Decision"
                    name="p_decision"
                    placeholder="Save results only"
                    options={[
                      { value: "approved", label: "Approve — fit for sale" },
                      { value: "rejected", label: "Reject — not fit for sale" },
                    ]}
                  />
                ) : null}
                <TextArea label="Notes" name="p_notes" />
              </OpsForm>
            </Card>
          ) : null}

          {(qcRes.data ?? []).length ? (
            <Card title={`Quality results${b.qc_decision ? ` — ${b.qc_decision}` : ""}`} description={b.qc_notes ?? undefined}>
              <Table head={["Check", "Result", "When"]} compact>
                {((qcRes.data ?? []) as { parameter_name: string; value_text: string | null; value_num: number | null; passed: boolean | null; checked_at: string }[]).map((r, i) => (
                  <tr key={i}>
                    <Td>{r.parameter_name}</Td>
                    <Td>
                      {r.value_num ?? r.value_text ?? ""} {r.passed === null ? "" : r.passed ? <Badge tone="good">pass</Badge> : <Badge tone="bad">fail</Badge>}
                    </Td>
                    <Td>{dateTime(r.checked_at)}</Td>
                  </tr>
                ))}
              </Table>
            </Card>
          ) : null}

          {["qc_approved", "packaging", "packaging_completed", "released", "partially_dispatched", "fully_dispatched", "closed"].includes(b.status) ? (
            <Card
              title="Packaging"
              description={`Finished ${qty(b.finished_qty, unit)} · packed ${qty(packedTotal, unit)} (incl. rejected/damaged packs) · left ${qty(Number(b.finished_qty ?? 0) - packedTotal, unit)}`}
            >
              {activePacks.length || packaging.length ? (
                <Table head={["Pack size", "Good", "Rejected", "Damaged", "Net good", "Packed by", "", ""]}>
                  {packaging.map((p) => (
                    <tr key={p.id} className={p.status === "reversed" ? "opacity-50" : ""}>
                      <Td>{p.items?.name}</Td>
                      <Td right>{p.packs_good}</Td>
                      <Td right>{p.packs_rejected}</Td>
                      <Td right>{p.packs_damaged}</Td>
                      <Td right>{qty(p.net_qty_good, unit)}</Td>
                      <Td>
                        {p.packed_by} · {date(p.packed_on)}
                      </Td>
                      <Td>{p.status === "reversed" ? <Badge>reversed: {p.reverse_reason}</Badge> : null}</Td>
                      <Td>
                        {p.status === "active" && canEdit && ["qc_approved", "packaging"].includes(b.status) ? (
                          <OpsForm fn="prod_reverse_packaging" submitLabel="Undo" variant="quiet" inline confirm="Undo this packaging entry? Its packaging materials go back into stock." success="Undone">
                            <input type="hidden" name="p_packaging_id" value={p.id} />
                            <input type="hidden" name="p_reason" value="Entered by mistake" />
                          </OpsForm>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No packs recorded yet.</Empty>
              )}

              {["qc_approved", "packaging"].includes(b.status) && canEdit ? (
                <div className="mt-4 flex flex-col gap-4">
                  <OpsForm fn="prod_record_packaging" submitLabel="Record packs" idempotent success="Packs recorded">
                    <input type="hidden" name="p_batch_id" value={b.id} />
                    <Grid cols={3}>
                      <Select
                        label="Packaging / pack size"
                        name="p_sku_item_id"
                        required
                        placeholder="Choose…"
                        options={((skusRes.data ?? []) as unknown as { id: string; name: string; packaging_configs: { name: string } | null }[]).map((s) => ({
                          value: s.id,
                          label: `${s.name}${s.packaging_configs ? ` (${s.packaging_configs.name})` : ""}`,
                        }))}
                      />
                      <NumberInput label="Good packs" name="p_packs_good#int" required step="1" />
                      <NumberInput label="Rejected packs" name="p_packs_rejected#int" defaultValue={0} step="1" />
                      <NumberInput label="Damaged packs" name="p_packs_damaged#int" defaultValue={0} step="1" />
                      <Input label="Packed by" name="p_packed_by" required />
                      <Input label="Packing date" name="p_packed_on#date" type="date" defaultValue={todayIST()} />
                    </Grid>
                    <p className="text-xs text-dark/60">Boxes, pouches, labels and seals are deducted from stock using each pack size&rsquo;s packaging bill of materials.</p>
                  </OpsForm>
                  {activePacks.length ? (
                    <OpsForm fn="prod_complete_packaging" submitLabel="Complete packaging" success="Packaging completed">
                      <input type="hidden" name="p_batch_id" value={b.id} />
                      <Grid cols={3}>
                        <NumberInput label={`Unpacked quantity left (${unit})`} name="p_unpacked_qty#num" defaultValue={0} />
                        <Input label="What happened to it" name="p_unpacked_disposition" placeholder="e.g. trimmings, samples, loss" />
                        {canApprove ? <Input label="Approver's reason (if it doesn't reconcile)" name="p_adjustment_reason" /> : null}
                      </Grid>
                    </OpsForm>
                  ) : null}
                </div>
              ) : null}
              {b.packaging_adjustment_reason ? <p className="mt-2 text-sm text-amber-800">Reconciliation approved: {b.packaging_adjustment_reason}</p> : null}
            </Card>
          ) : null}

          {b.status === "packaging_completed" && canApprove ? (
            <Card title="Release to finished goods" description="Costs the batch and puts each pack size into saleable stock under this batch number.">
              <OpsForm fn="prod_release_batch" submitLabel="Release batch" confirm="Release this batch to finished goods?" success="Released to finished goods">
                <input type="hidden" name="p_batch_id" value={b.id} />
              </OpsForm>
            </Card>
          ) : null}

          {b.released_at ? (
            <Card title="Batch cost">
              <Grid cols={4}>
                <Out label="Raw materials" value={inr(b.material_cost)} />
                <Out label="Packaging" value={inr(b.packaging_cost)} />
                <Out label="Labour (allocated)" value={inr(b.labour_cost)} />
                <Out label="Overhead (allocated)" value={inr(b.overhead_cost)} />
                <Out label="Total batch cost" value={inr(b.total_cost)} />
                <Out label={`Cost per ${unit} (packed, excl. packaging)`} value={inr(b.cost_per_unit)} />
              </Grid>
              <h3 className="mt-4 text-sm font-bold text-ink">Finished stock from this batch</h3>
              <Table head={["Pack size", "Lot", "Made", "In stock", "Reserved", "Cost / pack", "Expiry"]} compact>
                {((fgLotsRes.data ?? []) as unknown as { id: string; lot_code: string; qty_received: number; qty_on_hand: number; qty_reserved: number; unit_cost: number; expiry_date: string | null; items: { name: string } | null }[]).map((l) => (
                  <tr key={l.id}>
                    <Td>{l.items?.name}</Td>
                    <Td>{l.lot_code}</Td>
                    <Td right>{qty(l.qty_received)}</Td>
                    <Td right>{qty(l.qty_on_hand)}</Td>
                    <Td right>{qty(l.qty_reserved)}</Td>
                    <Td right>{inr(l.unit_cost)}</Td>
                    <Td>{date(l.expiry_date)}</Td>
                  </tr>
                ))}
              </Table>
              {canApprove && ["released", "partially_dispatched", "fully_dispatched"].includes(b.status) ? (
                <div className="mt-3">
                  <OpsForm fn="prod_close_batch" submitLabel="Close batch" variant="secondary" success="Batch closed">
                    <input type="hidden" name="p_batch_id" value={b.id} />
                  </OpsForm>
                </div>
              ) : null}
            </Card>
          ) : null}
        </div>

        <div className="flex flex-col gap-4">
          <Card title="History">
            <ol className="flex flex-col gap-2 text-sm">
              {((eventsRes.data ?? []) as { at: string; from_status: string | null; to_status: string; note: string | null }[]).map((e, i) => (
                <li key={i} className="border-l-2 border-primary/40 pl-3">
                  <StatusBadge status={e.to_status} /> <span className="text-xs text-dark/55">{dateTime(e.at)}</span>
                  {e.note ? <p className="text-xs text-dark/70">{e.note}</p> : null}
                </li>
              ))}
            </ol>
          </Card>
          {(correctionsRes.data ?? []).length ? (
            <Card title="Corrections">
              <ul className="flex flex-col gap-2 text-sm">
                {((correctionsRes.data ?? []) as { field: string; old_value: string; new_value: string; reason: string; corrected_at: string }[]).map((c, i) => (
                  <li key={i}>
                    <strong>{label(c.field)}</strong>: {c.old_value} → {c.new_value}
                    <p className="text-xs text-dark/60">
                      {c.reason} · {dateTime(c.corrected_at)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
          {b.notes || b.planned_packaging ? (
            <Card title="Plan notes">
              {b.planned_packaging ? <p className="text-sm">Expected packaging: {b.planned_packaging}</p> : null}
              {b.notes ? <p className="text-sm text-dark/70">{b.notes}</p> : null}
            </Card>
          ) : null}
          {ops.can("production", "delete") && !["released", "partially_dispatched", "fully_dispatched", "closed", "cancelled"].includes(b.status) ? (
            <Card title="Cancel batch">
              <OpsForm fn="prod_cancel_batch" submitLabel="Cancel batch" variant="danger" confirm="Cancel this batch? This cannot be undone.">
                <input type="hidden" name="p_batch_id" value={b.id} />
                <Select
                  label="What happens to materials"
                  name="p_mode"
                  options={[
                    ...(["planned", "materials_issued"].includes(b.status) ? [{ value: "return_materials", label: "Return issued materials to stock" }] : []),
                    { value: "write_off", label: "Write off (materials were used)" },
                  ]}
                />
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Out({ label: l, value, bad }: { label: string; value: React.ReactNode; bad?: boolean }) {
  return (
    <div className="rounded-xl bg-ink/5 px-3 py-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">{l}</p>
      <p className={`font-semibold ${bad ? "text-accent-dark" : "text-ink"}`}>{value}</p>
    </div>
  );
}
