import Link from "next/link";
import { notFound } from "next/navigation";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Input, PageHeader, StatusBadge, Table, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, qty } from "@/lib/ops/format";

type Invoice = {
  id: string; purchase_no: string; invoice_no: string; invoice_date: string; due_date: string | null; is_interstate: boolean; taxable_total: number; tax_total: number;
  freight: number; other_charges: number; round_off: number; total: number; amount_paid: number; status: string; document_url: string | null; notes: string | null;
  created_at: string; cancel_reason: string | null; supplier_id: string; suppliers: { name: string; gstin: string | null } | null;
};
type Line = {
  id: string; line_no: number; item_id: string | null; account_code: string | null; description: string | null; qty: number; rate: number; discount: number; gst_rate: number;
  taxable: number; tax: number; landed_cost: number | null; lot_id: string | null; items: { name: string; unit: string } | null; stock_lots: { lot_code: string; qty_on_hand: number } | null;
};

export default async function PurchaseInvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ops = await requireOps("purchases");
  const { data } = await ops.supabase
    .from("purchase_invoices")
    .select("id, purchase_no, invoice_no, invoice_date, due_date, is_interstate, taxable_total, tax_total, freight, other_charges, round_off, total, amount_paid, status, document_url, notes, created_at, cancel_reason, supplier_id, suppliers(name, gstin)")
    .eq("id", id)
    .maybeSingle();
  if (!data) notFound();
  const inv = data as unknown as Invoice;
  const [{ data: lineData }, { data: allocData }] = await Promise.all([
    ops.supabase
      .from("purchase_invoice_lines")
      .select("id, line_no, item_id, account_code, description, qty, rate, discount, gst_rate, taxable, tax, landed_cost, lot_id, items(name, unit), stock_lots(lot_code, qty_on_hand)")
      .eq("invoice_id", id)
      .order("line_no"),
    ops.supabase.from("payment_allocations").select("amount, payments(payment_no, paid_on, method, reference)").eq("doc_type", "purchase_invoice").eq("doc_id", id),
  ]);
  const lines = (lineData ?? []) as unknown as Line[];
  const allocations = (allocData ?? []) as unknown as { amount: number; payments: { payment_no: string; paid_on: string; method: string; reference: string | null } | null }[];
  const stockLines = lines.filter((l) => l.lot_id && Number(l.stock_lots?.qty_on_hand ?? 0) > 0);
  const outstanding = Number(inv.total) - Number(inv.amount_paid);

  return (
    <>
      <PageHeader
        title={`${inv.purchase_no} · ${inv.suppliers?.name ?? ""}`}
        description={`Their bill ${inv.invoice_no} dated ${date(inv.invoice_date)} · due ${date(inv.due_date)}${inv.is_interstate ? " · inter-state (IGST)" : ""}`}
        actions={
          inv.status === "posted" && outstanding > 0 && ops.can("purchases", "edit") ? (
            <Link href={`/ops/finance/purchases/pay?supplier=${inv.supplier_id}`} className="rounded-xl bg-ink px-4 py-2 text-sm font-semibold text-white">
              Pay supplier
            </Link>
          ) : null
        }
      />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          <Card title="Lines">
            <Table head={["#", "Item / account", "Qty", "Rate", "Taxable", "GST", "Landed cost", "Lot"]} compact>
              {lines.map((l) => (
                <tr key={l.id}>
                  <Td>{l.line_no}</Td>
                  <Td>
                    {l.items ? (
                      <Link href={`/ops/inventory/${l.item_id}`} className="text-primary-dark hover:underline">
                        {l.items.name}
                      </Link>
                    ) : (
                      `Account ${l.account_code}`
                    )}
                    {l.description ? <div className="text-dark/55">{l.description}</div> : null}
                  </Td>
                  <Td right>{qty(l.qty, l.items?.unit)}</Td>
                  <Td right>{inr(l.rate)}</Td>
                  <Td right>{inr(l.taxable)}</Td>
                  <Td right>
                    {inr(l.tax)} <span className="text-dark/50">({Number(l.gst_rate)}%)</span>
                  </Td>
                  <Td right>{l.landed_cost !== null ? inr(l.landed_cost) : "—"}</Td>
                  <Td>{l.stock_lots?.lot_code ?? "—"}</Td>
                </tr>
              ))}
            </Table>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:max-w-sm sm:justify-self-end">
              <dt>Taxable value</dt>
              <dd className="text-right">{inr(inv.taxable_total)}</dd>
              <dt>GST</dt>
              <dd className="text-right">{inr(inv.tax_total)}</dd>
              <dt>Freight + other charges</dt>
              <dd className="text-right">{inr(Number(inv.freight) + Number(inv.other_charges))}</dd>
              <dt>Round off</dt>
              <dd className="text-right">{inr(inv.round_off)}</dd>
              <dt className="font-semibold">Bill total</dt>
              <dd className="text-right font-semibold">{inr(inv.total)}</dd>
              <dt>Paid</dt>
              <dd className="text-right">{inr(inv.amount_paid)}</dd>
              <dt className="font-semibold">Outstanding</dt>
              <dd className="text-right font-semibold">{inr(inv.status === "cancelled" ? 0 : outstanding)}</dd>
            </dl>
          </Card>

          <Card title="Payments against this bill">
            {allocations.length ? (
              <Table head={["Payment", "Date", "Method", "Reference", "Amount"]} compact>
                {allocations.map((a, i) => (
                  <tr key={i}>
                    <Td>{a.payments?.payment_no}</Td>
                    <Td>{date(a.payments?.paid_on)}</Td>
                    <Td>{a.payments?.method.replace(/_/g, " ")}</Td>
                    <Td>{a.payments?.reference}</Td>
                    <Td right>{inr(a.amount)}</Td>
                  </tr>
                ))}
              </Table>
            ) : (
              <Empty>No payments yet.</Empty>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Status">
            <div className="flex flex-col gap-2 text-sm">
              <div>
                <StatusBadge status={inv.status} /> {inv.status === "posted" && outstanding <= 0 ? <Badge tone="good">paid</Badge> : null}
              </div>
              <p>Recorded {dateTime(inv.created_at)}</p>
              {inv.suppliers?.gstin ? <p>Supplier GSTIN {inv.suppliers.gstin}</p> : null}
              {inv.notes ? <p>{inv.notes}</p> : null}
              {inv.document_url ? (
                <a href={inv.document_url} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-dark hover:underline">
                  View scanned bill
                </a>
              ) : null}
              {inv.cancel_reason ? <p className="text-accent-dark">Cancelled: {inv.cancel_reason}</p> : null}
            </div>
          </Card>

          {inv.status === "posted" && ops.can("purchases", "edit") && stockLines.length ? (
            <Card title="Return goods to supplier" description="Takes the stock out and posts a debit note against the supplier.">
              <OpsForm fn="fin_supplier_return" submitLabel="Record return" idempotent success="Return recorded">
                <input type="hidden" name="p_invoice_id" value={inv.id} />
                <LineEditor
                  name="p_lines#json"
                  addLabel="Add line"
                  columns={[
                    { key: "line_id", label: "Line", type: "select", required: true, options: stockLines.map((l) => ({ value: l.id, label: `${l.line_no}. ${l.items?.name} (${qty(l.stock_lots?.qty_on_hand, l.items?.unit)} left)` })) },
                    { key: "qty", label: "Qty", type: "number", width: "6rem" },
                  ]}
                />
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}

          {inv.status === "posted" && ops.can("purchases", "approve") && Number(inv.amount_paid) === 0 ? (
            <Card title="Cancel bill" description="Only while nothing has been paid and none of its stock has been used. Posts a reversing entry.">
              <OpsForm fn="fin_cancel_purchase_invoice" submitLabel="Cancel bill" variant="danger" confirm="Cancel this bill and take its stock back out?" success="Bill cancelled">
                <input type="hidden" name="p_invoice_id" value={inv.id} />
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      </div>
    </>
  );
}
