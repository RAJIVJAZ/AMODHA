import { notFound } from "next/navigation";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Input, NumberInput, PageHeader, Select, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, qty } from "@/lib/ops/format";

type Item = { id: string; code: string; name: string; item_type: string; unit: string; rotation: string; shelf_life_days: number | null; reorder_level: number; is_perishable: boolean };
type Lot = {
  id: string; lot_code: string; supplier_lot: string | null; source_type: string; received_at: string; expiry_date: string | null; unit_cost: number;
  qty_received: number; qty_on_hand: number; qty_reserved: number; status: string; batch_id: string | null; suppliers: { name: string } | null;
};
type Movement = { id: number; occurred_at: string; qty: number; movement_type: string; value: number; doc_type: string; doc_no: string | null; reason: string | null; reversal_of: number | null; stock_lots: { lot_code: string } | null };

export default async function ItemStockPage({ params }: { params: Promise<{ itemId: string }> }) {
  const { itemId } = await params;
  const ops = await requireOps("inventory");
  const { data: itemData } = await ops.supabase.from("items").select("id, code, name, item_type, unit, rotation, shelf_life_days, reorder_level, is_perishable").eq("id", itemId).maybeSingle();
  if (!itemData) notFound();
  const item = itemData as Item;
  const [{ data: lotsData }, { data: movData }, { data: summary }] = await Promise.all([
    ops.supabase
      .from("stock_lots")
      .select("id, lot_code, supplier_lot, source_type, received_at, expiry_date, unit_cost, qty_received, qty_on_hand, qty_reserved, status, batch_id, suppliers(name)")
      .eq("item_id", itemId)
      .order("received_at", { ascending: false })
      .limit(200),
    ops.supabase
      .from("stock_movements")
      .select("id, occurred_at, qty, movement_type, value, doc_type, doc_no, reason, reversal_of, stock_lots(lot_code)")
      .eq("item_id", itemId)
      .order("occurred_at", { ascending: false })
      .limit(200),
    ops.supabase.from("v_stock_summary").select("on_hand, reserved, available, stock_value").eq("item_id", itemId).maybeSingle(),
  ]);
  const lots = (lotsData ?? []) as unknown as Lot[];
  const movements = (movData ?? []) as unknown as Movement[];
  const openLots = lots.filter((l) => Number(l.qty_on_hand) > 0);
  const reversed = new Set(movements.filter((m) => m.reversal_of).map((m) => m.reversal_of));

  return (
    <>
      <PageHeader
        title={item.name}
        description={`${item.code} · ${label(item.item_type)} · stock unit ${item.unit} · ${item.rotation}${item.shelf_life_days ? ` · shelf life ${item.shelf_life_days} days` : ""}`}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["On hand", qty(summary?.on_hand, item.unit)],
          ["Reserved for orders", qty(summary?.reserved, item.unit)],
          ["Available to use / sell", qty(summary?.available, item.unit)],
          ["Value", inr(summary?.stock_value)],
        ].map(([l, v]) => (
          <div key={l} className="rounded-2xl border-2 border-ink/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">{l}</p>
            <p className="font-heading text-xl font-bold text-ink">{v}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Lots" description="Each receipt, collection or batch is its own lot, so it can be traced and used oldest-expiry first.">
            {lots.length ? (
              <Table head={["Lot", "Source", "Received", "On hand", "Reserved", "Cost", "Expiry", "Status", ""]} compact>
                {lots.map((l) => (
                  <tr key={l.id} className={Number(l.qty_on_hand) === 0 ? "opacity-50" : ""}>
                    <Td>
                      {l.lot_code}
                      {l.supplier_lot ? <div className="text-dark/50">{l.supplier_lot}</div> : null}
                    </Td>
                    <Td>
                      {label(l.source_type)}
                      {l.suppliers ? ` · ${l.suppliers.name}` : ""}
                      {l.batch_id ? (
                        <a href={`/ops/production/${l.batch_id}`} className="ml-1 text-primary-dark hover:underline">
                          batch
                        </a>
                      ) : null}
                    </Td>
                    <Td>{date(l.received_at)}</Td>
                    <Td right>{qty(l.qty_on_hand)}</Td>
                    <Td right>{Number(l.qty_reserved) ? qty(l.qty_reserved) : "—"}</Td>
                    <Td right>{inr(l.unit_cost)}</Td>
                    <Td>{date(l.expiry_date)}</Td>
                    <Td>
                      <Badge tone={l.status === "available" ? "good" : "warn"}>{l.status}</Badge>
                    </Td>
                    <Td>
                      {ops.can("inventory", "edit") && Number(l.qty_on_hand) > 0 && ["available", "hold"].includes(l.status) ? (
                        <OpsForm fn="inv_set_lot_status" submitLabel={l.status === "available" ? "Hold" : "Release"} variant="quiet" inline success="Updated">
                          <input type="hidden" name="p_lot_id" value={l.id} />
                          <input type="hidden" name="p_status" value={l.status === "available" ? "hold" : "available"} />
                          <input type="hidden" name="p_reason" value={l.status === "available" ? "Held for checking" : "Checked and released"} />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No stock received yet.</Empty>
            )}
          </Card>

          <Card title="Movement history" description="Every quantity in and out, with its source document. Entries are permanent; corrections are new, linked entries.">
            {movements.length ? (
              <Table head={["When", "Type", "Lot", "Qty", "Value", "Document", "Note", ""]} compact>
                {movements.map((m) => (
                  <tr key={m.id}>
                    <Td>{dateTime(m.occurred_at)}</Td>
                    <Td>
                      {label(m.movement_type)}
                      {m.reversal_of ? <span className="text-dark/50"> (of #{m.reversal_of})</span> : null}
                    </Td>
                    <Td>{m.stock_lots?.lot_code}</Td>
                    <Td right className={Number(m.qty) < 0 ? "text-accent-dark" : "text-emerald-700"}>
                      {Number(m.qty) > 0 ? "+" : ""}
                      {qty(m.qty)}
                    </Td>
                    <Td right>{inr(m.value)}</Td>
                    <Td>
                      {label(m.doc_type)} {m.doc_no ?? ""}
                    </Td>
                    <Td>{m.reason}</Td>
                    <Td>
                      {ops.can("inventory", "approve") && ["opening", "damage", "expiry", "adjustment_in", "adjustment_out"].includes(m.movement_type) && !reversed.has(m.id) ? (
                        <OpsForm fn="inv_reverse_movement" submitLabel="Reverse" variant="quiet" inline confirm="Reverse this entry with an opposite, linked entry?" success="Reversed">
                          <input type="hidden" name="p_movement_id#int" value={m.id} />
                          <input type="hidden" name="p_reason" value="Reversed: entered in error" />
                        </OpsForm>
                      ) : null}
                    </Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No movements yet.</Empty>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          {ops.can("inventory", "create") && item.item_type !== "finished_good" ? (
            <Card title="Receive opening stock" description="For stock already on hand when you start. Purchases are recorded under Purchases.">
              <OpsForm fn="inv_receive_opening_stock" submitLabel="Add stock" idempotent success="Stock added">
                <input type="hidden" name="p_item_id" value={item.id} />
                <NumberInput label={`Quantity (${item.unit})`} name="p_qty#num" required />
                <NumberInput label={`Cost per ${item.unit} (₹)`} name="p_unit_cost#num" required />
                <Input label="Expiry date" name="p_expiry#date" type="date" />
                <Input label="Supplier lot no." name="p_supplier_lot" />
                <Input label="Reason" name="p_reason" defaultValue="Opening stock" />
              </OpsForm>
            </Card>
          ) : null}
          {ops.can("inventory", "edit") && openLots.length ? (
            <Card title="Adjust stock" description="Damage, expiry write-off or a physical count correction. Large values need an approver.">
              <OpsForm fn="inv_adjust_stock" submitLabel="Record adjustment" idempotent success="Adjustment recorded">
                <Select
                  label="Lot"
                  name="p_lot_id"
                  required
                  placeholder="Choose…"
                  options={openLots.map((l) => ({ value: l.id, label: `${l.lot_code} (${qty(l.qty_on_hand - l.qty_reserved, item.unit)} free)` }))}
                />
                <Select
                  label="Type"
                  name="p_kind"
                  options={[
                    { value: "damage", label: "Damaged (write off)" },
                    { value: "expiry", label: "Expired (write off)" },
                    { value: "count", label: "Physical count correction" },
                  ]}
                />
                <NumberInput label="Quantity change (− to reduce, + to add)" name="p_qty_delta#num" required />
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
