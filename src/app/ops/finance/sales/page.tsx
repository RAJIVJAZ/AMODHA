import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, StatusBadge, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, param, todayIST } from "@/lib/ops/format";
import { moneyAccounts, paymentMethods } from "@/lib/ops/finance";

export const metadata = { title: "Sales & receivables" };

type Order = {
  id: string; order_number: number; invoice_number: string | null; invoice_date: string | null; customer_name: string; phone: string; total: number; source: string;
  payment_method: string; payment_status: string; fulfilment_status: string; created_at: string;
};
type Receivable = { party_id: string; customer: string | null; phone: string | null; balance: number; last_activity: string };
type Receipt = { id: string; payment_no: string; party_name: string | null; amount: number; paid_on: string; method: string; reference: string | null };
type PostingError = { id: number; at: string; source_type: string; source_id: string; error: string };

export default async function SalesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("sales");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "invoices";

  const [{ data: orderData }, { data: recData }, { data: receiptData }, { data: errData }, accounts] = await Promise.all([
    ops.supabase
      .from("orders")
      .select("id, order_number, invoice_number, invoice_date, customer_name, phone, total, source, payment_method, payment_status, fulfilment_status, created_at")
      .not("invoice_number", "is", null)
      .order("invoice_date", { ascending: false })
      .limit(300),
    ops.supabase.rpc("fin_receivables"),
    tab === "receipts"
      ? ops.supabase.from("payments").select("id, payment_no, party_name, amount, paid_on, method, reference").eq("direction", "in").order("paid_on", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    ops.supabase.from("posting_errors").select("id, at, source_type, source_id, error").is("resolved_at", null).order("at", { ascending: false }),
    ops.can("sales", "create") ? moneyAccounts(ops) : Promise.resolve([]),
  ]);
  const orders = (orderData ?? []) as Order[];
  const receivables = (recData ?? []) as Receivable[];
  const errors = (errData ?? []) as PostingError[];
  const due = receivables.filter((r) => Number(r.balance) > 0).reduce((s, r) => s + Number(r.balance), 0);
  const unpaid = orders.filter((o) => o.payment_status !== "paid" && o.fulfilment_status !== "cancelled");
  const orderOptions = (list: Order[]) => list.map((o) => ({ value: o.id, label: `#${o.order_number} · ${o.invoice_number} · ${o.customer_name} · ${inr(o.total, 0)}` }));

  return (
    <>
      <PageHeader title="Sales & receivables" description="Tax invoices, money customers owe, receipts and credit notes. Sales post to the books when the invoice number is given." />
      {errors.length ? (
        <div className="mb-4 rounded-2xl border-2 border-red-200 bg-red-50 p-4 text-sm text-red-900">
          <p className="font-semibold">{errors.length} order(s) could not be posted to the books.</p>
          <ul className="mt-1 list-disc pl-5">
            {errors.slice(0, 5).map((e) => (
              <li key={e.id}>
                {label(e.source_type)} {e.source_id.slice(0, 8)} · {dateTime(e.at)}: {e.error}
              </li>
            ))}
          </ul>
          {ops.can("sales", "approve") ? (
            <div className="mt-2">
              <OpsForm fn="fin_retry_postings" submitLabel="Try posting again" variant="secondary" success="Retried — any still failing are listed above">
                <span />
              </OpsForm>
            </div>
          ) : null}
        </div>
      ) : null}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Customers owe" value={inr(due, 0)} hint="Cash on delivery not yet collected, unpaid invoices" />
        <Stat label="Unpaid invoices" value={unpaid.length} />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "invoices", label: "Tax invoices", href: "/ops/finance/sales" },
          { key: "receivables", label: `Customer balances (${receivables.length})`, href: "/ops/finance/sales?tab=receivables" },
          { key: "receipts", label: "Receipts", href: "/ops/finance/sales?tab=receipts" },
          { key: "actions", label: "Receive payment / credit note", href: "/ops/finance/sales?tab=actions" },
        ]}
      />

      {tab === "invoices" ? (
        <Card>
          {orders.length ? (
            <Table head={["Invoice", "Order", "Date", "Customer", "Source", "Total", "Payment", "Delivery"]}>
              {orders.map((o) => (
                <tr key={o.id}>
                  <Td>
                    <a href={`/invoice/${o.id}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary-dark hover:underline">
                      {o.invoice_number}
                    </a>
                  </Td>
                  <Td>
                    {ops.can("dispatch") ? (
                      <Link href={`/ops/dispatch/${o.id}`} className="hover:underline">
                        #{o.order_number}
                      </Link>
                    ) : (
                      `#${o.order_number}`
                    )}
                  </Td>
                  <Td>{date(o.invoice_date)}</Td>
                  <Td>
                    {o.customer_name}
                    <div className="text-xs text-dark/55">{o.phone}</div>
                  </Td>
                  <Td>{o.source}</Td>
                  <Td right>{inr(o.total, 0)}</Td>
                  <Td>
                    <Badge tone={o.payment_status === "paid" ? "good" : "warn"}>{o.payment_status === "cod" ? "cash on delivery" : o.payment_status}</Badge>
                  </Td>
                  <Td>
                    <StatusBadge status={o.fulfilment_status} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No invoices yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "receivables" ? (
        <Card description="Balance on each customer's account in the books. A negative balance means the customer has paid in advance or is owed a refund.">
          {receivables.length ? (
            <Table head={["Customer", "Phone", "Last activity", "Balance"]}>
              {receivables.map((r) => (
                <tr key={r.party_id}>
                  <Td>{r.customer ?? r.party_id}</Td>
                  <Td>{r.phone}</Td>
                  <Td>{date(r.last_activity)}</Td>
                  <Td right className={Number(r.balance) > 0 ? "font-semibold" : "text-emerald-700"}>
                    {inr(r.balance)}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No customer balances.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "receipts" ? (
        <Card description="Money received outside the payment gateway: cash collected on delivery is recorded by the delivery update.">
          {(receiptData ?? []).length ? (
            <Table head={["Receipt", "Customer", "Date", "Method", "Reference", "Amount"]}>
              {((receiptData ?? []) as Receipt[]).map((p) => (
                <tr key={p.id}>
                  <Td>{p.payment_no}</Td>
                  <Td>{p.party_name}</Td>
                  <Td>{date(p.paid_on)}</Td>
                  <Td>{label(p.method)}</Td>
                  <Td>{p.reference}</Td>
                  <Td right>{inr(p.amount)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No receipts recorded here yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "actions" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {ops.can("sales", "create") ? (
            <Card title="Receive a payment" description="Bank transfer, UPI or cash received against an invoice (not on delivery).">
              {unpaid.length ? (
                <OpsForm fn="fin_receive_customer_payment" submitLabel="Record receipt" idempotent success="Receipt recorded">
                  <Select label="Invoice" name="p_order_id" required placeholder="Choose…" options={orderOptions(unpaid)} />
                  <Grid cols={2}>
                    <NumberInput label="Amount (₹)" name="p_amount#num" required />
                    <Input label="Received on" name="p_paid_on#date" type="date" required defaultValue={todayIST()} />
                    <Select label="Method" name="p_method" options={paymentMethods} defaultValue="upi" />
                    <Select label="Received into" name="p_account_code" options={accounts} defaultValue="1010" />
                  </Grid>
                  <Input label="Reference (UTR / cheque no.)" name="p_reference" />
                </OpsForm>
              ) : (
                <Empty>No unpaid invoices.</Empty>
              )}
            </Card>
          ) : null}
          {ops.can("sales", "approve") ? (
            <Card title="Credit note" description="For returned, damaged or short-delivered goods. Reduces sales and GST; can also record the refund.">
              <OpsForm fn="fin_credit_note" submitLabel="Issue credit note" idempotent confirm="Issue this credit note?" success="Credit note issued">
                <Select label="Invoice" name="p_order_id" required placeholder="Choose…" options={orderOptions(orders.filter((o) => o.fulfilment_status !== "cancelled"))} />
                <Grid cols={2}>
                  <NumberInput label="Amount incl. GST (₹)" name="p_amount#num" required />
                  <Select label="Refund paid from" name="p_refund_account" placeholder="No refund (adjust balance)" options={accounts} />
                </Grid>
                <Input label="Reason" name="p_reason" required />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
