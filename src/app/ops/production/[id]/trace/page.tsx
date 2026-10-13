import Link from "next/link";
import { notFound } from "next/navigation";
import { Card, Empty, PageHeader, StatusBadge, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, qty } from "@/lib/ops/format";

export const metadata = { title: "Batch traceability" };

type Trace = {
  batch: { batch_no: string; product_name: string; product_code: string; recipe_version: number; status: string; production_date: string; finished_qty: number | null } | null;
  materials: { item: string; unit: string; lot_code: string; supplier_lot: string | null; source_type: string; supplier: string | null; collection_no: string | null; qty: number; value: number; movement: string; at: string; issued_by: string | null }[];
  packaging: { sku: string; sku_code: string; packs_good: number; packs_rejected: number; packs_damaged: number; net_qty_good: number; packed_by: string; packed_on: string; status: string }[];
  finished_lots: { lot_code: string; sku: string; received: number; on_hand: number; reserved: number; unit_cost: number; expiry_date: string | null }[];
  outgoing: { sku: string; qty: number; movement: string; doc_type: string; doc_no: string | null; doc_id: string; at: string }[];
  events: { at: string; to: string; note: string | null; by: string | null }[];
};

export default async function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("production");
  const { data, error } = await ops.supabase.rpc("prod_batch_trace", { p_batch_id: id });
  const t = data as Trace | null;
  if (error || !t?.batch) notFound();

  // Which customer orders (retail and B2B) received this batch, line by line.
  const { data: received } = await ops.supabase.rpc("ops_batch_customers", { p_batch_id: id });
  const lines = (received ?? []) as {
    dispatch_no: string; dispatched_at: string; dispatch_status: string; order_id: string; order_no: string; customer: string;
    customer_code: string | null; phone: string; sku: string; item: string; lot_code: string; qty: number; qty_returned: number;
  }[];

  return (
    <>
      <PageHeader
        title={`Traceability — ${t.batch.batch_no}`}
        description={`${t.batch.product_name} (${t.batch.product_code}) · recipe v${t.batch.recipe_version} · made ${date(t.batch.production_date)}`}
        actions={
          <>
            <StatusBadge status={t.batch.status} />
            <Link href={`/ops/production/${id}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
              Back to batch
            </Link>
          </>
        }
      />
      <div className="flex flex-col gap-4">
        <Card title="1. Raw materials in (by lot)">
          {t.materials.length ? (
            <Table head={["Material", "Lot", "Source", "Supplier / farmer", "Qty", "Cost", "Issued"]} compact>
              {t.materials.map((m, i) => (
                <tr key={i}>
                  <Td>{m.item}</Td>
                  <Td>
                    {m.lot_code}
                    {m.supplier_lot ? ` / ${m.supplier_lot}` : ""}
                  </Td>
                  <Td>{m.collection_no ?? label(m.source_type)}</Td>
                  <Td>{m.supplier ?? "—"}</Td>
                  <Td right>{qty(m.qty, m.unit)}</Td>
                  <Td right>{inr(m.value)}</Td>
                  <Td>
                    {dateTime(m.at)}
                    {m.issued_by ? ` · ${m.issued_by}` : ""}
                    {m.movement === "return_from_production" ? " (returned)" : ""}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No materials issued.</Empty>
          )}
        </Card>
        <Card title="2. Packed">
          {t.packaging.length ? (
            <Table head={["Pack size", "Good", "Rejected", "Damaged", "Net good", "Packed by", "Status"]} compact>
              {t.packaging.map((p, i) => (
                <tr key={i}>
                  <Td>{p.sku}</Td>
                  <Td right>{p.packs_good}</Td>
                  <Td right>{p.packs_rejected}</Td>
                  <Td right>{p.packs_damaged}</Td>
                  <Td right>{qty(p.net_qty_good)}</Td>
                  <Td>
                    {p.packed_by} · {date(p.packed_on)}
                  </Td>
                  <Td>{p.status}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Not packed yet.</Empty>
          )}
        </Card>
        <Card title="3. Finished stock">
          {t.finished_lots.length ? (
            <Table head={["Pack size", "Lot", "Made", "In stock", "Reserved", "Cost / pack", "Expiry"]} compact>
              {t.finished_lots.map((l, i) => (
                <tr key={i}>
                  <Td>{l.sku}</Td>
                  <Td>{l.lot_code}</Td>
                  <Td right>{qty(l.received)}</Td>
                  <Td right>{qty(l.on_hand)}</Td>
                  <Td right>{qty(l.reserved)}</Td>
                  <Td right>{inr(l.unit_cost)}</Td>
                  <Td>{date(l.expiry_date)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Not released to finished goods yet.</Empty>
          )}
        </Card>
        <Card title="4. Customers who received it">
          {lines.length ? (
            <Table head={["Dispatch", "Order", "Customer", "Pack (SKU)", "Lot", "Qty", "Status", "When"]} compact>
              {lines.map((d, i) => (
                <tr key={i}>
                  <Td>{d.dispatch_no}</Td>
                  <Td>
                    <Link href={d.customer_code ? `/ops/b2b/orders/${d.order_id}` : `/ops/dispatch/${d.order_id}`} className="font-semibold text-primary-dark hover:underline">
                      {d.order_no}
                    </Link>
                  </Td>
                  <Td>
                    {d.customer}
                    {d.customer_code ? <div className="text-xs text-dark/55">{d.customer_code}</div> : null}
                  </Td>
                  <Td>
                    {d.item}
                    <div className="text-xs text-dark/55">{d.sku}</div>
                  </Td>
                  <Td>{d.lot_code}</Td>
                  <Td right>
                    {qty(d.qty)}
                    {Number(d.qty_returned) ? <div className="text-xs text-accent-dark">{qty(d.qty_returned)} returned</div> : null}
                  </Td>
                  <Td>
                    <StatusBadge status={d.dispatch_status} />
                  </Td>
                  <Td>{dateTime(d.dispatched_at)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing dispatched from this batch yet.</Empty>
          )}
          {t.outgoing.some((o) => o.doc_type !== "dispatch") ? (
            <>
              <h3 className="mt-3 text-sm font-bold text-ink">Other stock out (write-offs, adjustments)</h3>
              <Table head={["Pack size", "Qty", "Type", "Reference", "When"]} compact>
                {t.outgoing
                  .filter((o) => o.doc_type !== "dispatch")
                  .map((o, i) => (
                    <tr key={i}>
                      <Td>{o.sku}</Td>
                      <Td right>{qty(o.qty)}</Td>
                      <Td>{label(o.movement)}</Td>
                      <Td>{o.doc_no}</Td>
                      <Td>{dateTime(o.at)}</Td>
                    </tr>
                  ))}
              </Table>
            </>
          ) : null}
        </Card>
        <Card title="Status history">
          <ol className="flex flex-col gap-1 text-sm">
            {t.events.map((e, i) => (
              <li key={i}>
                <StatusBadge status={e.to} /> {dateTime(e.at)}
                {e.by ? ` · ${e.by}` : ""}
                {e.note ? ` — ${e.note}` : ""}
              </li>
            ))}
          </ol>
        </Card>
      </div>
    </>
  );
}
