import { notFound } from "next/navigation";
import { OpsForm } from "@/components/ops/ops-form";
import { PaymentAllocator, type OpenDoc } from "@/components/ops/payment-allocator";
import { Card, Grid, Input, PageHeader, Select } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, qty, todayIST } from "@/lib/ops/format";
import { moneyAccounts, paymentMethods } from "@/lib/ops/finance";

export const metadata = { title: "Pay supplier" };

export default async function PaySupplierPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("purchases", "edit");
  const supplierId = param((await searchParams).supplier);
  if (!supplierId) notFound();
  const { data: supplier } = await ops.supabase.from("suppliers").select("id, name, kind").eq("id", supplierId).maybeSingle();
  if (!supplier) notFound();

  const [{ data: bills }, { data: milk }, { data: payables }, accounts] = await Promise.all([
    ops.supabase.from("purchase_invoices").select("id, purchase_no, invoice_no, invoice_date, total, amount_paid").eq("supplier_id", supplierId).eq("status", "posted").order("invoice_date"),
    ops.supabase.from("milk_collections").select("id, collection_no, collected_on, shift, qty_accepted, amount, amount_paid").eq("supplier_id", supplierId).eq("status", "posted").order("collected_on"),
    ops.supabase.rpc("fin_payables"),
    moneyAccounts(ops),
  ]);
  const docs: OpenDoc[] = [
    ...((bills ?? []) as { id: string; purchase_no: string; invoice_no: string; invoice_date: string; total: number; amount_paid: number }[])
      .filter((b) => Number(b.total) > Number(b.amount_paid))
      .map((b) => ({ doc_type: "purchase_invoice", doc_id: b.id, label: `${b.purchase_no} (bill ${b.invoice_no})`, date: date(b.invoice_date), sort: b.invoice_date, outstanding: Number(b.total) - Number(b.amount_paid) })),
    ...((milk ?? []) as { id: string; collection_no: string; collected_on: string; shift: string; qty_accepted: number; amount: number; amount_paid: number }[])
      .filter((m) => Number(m.amount) > Number(m.amount_paid))
      .map((m) => ({ doc_type: "milk_collection", doc_id: m.id, label: `${m.collection_no} · ${m.shift} · ${qty(m.qty_accepted, "L")}`, date: date(m.collected_on), sort: m.collected_on, outstanding: Number(m.amount) - Number(m.amount_paid) })),
  ]
    .sort((a, b) => a.sort.localeCompare(b.sort))
    .map((d) => ({ doc_type: d.doc_type, doc_id: d.doc_id, label: d.label, date: d.date, outstanding: d.outstanding }));
  const balance = ((payables ?? []) as { supplier_id: string; balance: number }[]).find((p) => p.supplier_id === supplierId)?.balance ?? 0;

  return (
    <>
      <PageHeader title={`Pay ${supplier.name}`} description={`Balance on their account: ${inr(balance)}. Oldest bills are settled first; change the amounts if needed.`} />
      <Card>
        <OpsForm fn="fin_pay_supplier" submitLabel="Record payment" idempotent success="Payment recorded" redirectTo="/ops/finance/purchases?tab=payments">
          <input type="hidden" name="p_supplier_id" value={supplier.id} />
          <PaymentAllocator docs={docs} />
          <Grid cols={4}>
            <Input label="Paid on" name="p_paid_on#date" type="date" required defaultValue={todayIST()} />
            <Select label="Method" name="p_method" options={paymentMethods} defaultValue={supplier.kind === "farmer" ? "cash" : "bank_transfer"} />
            <Select label="Paid from" name="p_account_code" options={accounts} defaultValue={supplier.kind === "farmer" ? "1000" : "1010"} />
            <Input label="Reference (UTR / cheque no.)" name="p_reference" />
          </Grid>
        </OpsForm>
      </Card>
    </>
  );
}
