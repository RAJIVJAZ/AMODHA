import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, PageHeader, Stat, StatusBadge, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Purchases" };

type Invoice = { id: string; purchase_no: string; invoice_no: string; invoice_date: string; due_date: string | null; total: number; amount_paid: number; status: string; suppliers: { name: string } | null };
type Payable = { supplier_id: string; supplier: string; balance: number; overdue: number; next_due: string | null };
type Payment = { id: string; payment_no: string; party_name: string | null; amount: number; paid_on: string; method: string; reference: string | null };

export default async function PurchasesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("purchases");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "invoices";

  const [{ data: inv }, { data: pay }, { data: payments }] = await Promise.all([
    ops.supabase
      .from("purchase_invoices")
      .select("id, purchase_no, invoice_no, invoice_date, due_date, total, amount_paid, status, suppliers(name)")
      .order("invoice_date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(300),
    ops.supabase.rpc("fin_payables"),
    tab === "payments"
      ? ops.supabase.from("payments").select("id, payment_no, party_name, amount, paid_on, method, reference").eq("direction", "out").eq("party_type", "supplier").order("paid_on", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
  ]);
  const invoices = (inv ?? []) as unknown as Invoice[];
  const payables = (pay ?? []) as Payable[];
  const owed = payables.reduce((s, p) => s + Number(p.balance), 0);
  const overdue = payables.reduce((s, p) => s + Number(p.overdue), 0);

  return (
    <>
      <PageHeader
        title="Purchases"
        description="Supplier bills post to stock (with freight in the landed cost), GST input and the supplier's account in one step."
        actions={ops.can("purchases", "create") ? <ButtonLink href="/ops/finance/purchases/new">+ Record supplier bill</ButtonLink> : null}
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Owed to suppliers" value={inr(owed, 0)} hint="Bills and milk collections" />
        <Stat label="Overdue bills" value={inr(overdue, 0)} tone={overdue > 0 ? "warn" : "default"} />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "invoices", label: "Supplier bills", href: "/ops/finance/purchases" },
          { key: "payables", label: `What we owe (${payables.length})`, href: "/ops/finance/purchases?tab=payables" },
          { key: "payments", label: "Payments made", href: "/ops/finance/purchases?tab=payments" },
        ]}
      />

      {tab === "invoices" ? (
        <Card>
          {invoices.length ? (
            <Table head={["Our no.", "Supplier", "Their bill", "Date", "Due", "Total", "Paid", "Status"]}>
              {invoices.map((i) => (
                <tr key={i.id} className="hover:bg-blush/40">
                  <Td>
                    <Link href={`/ops/finance/purchases/${i.id}`} className="font-semibold text-primary-dark hover:underline">
                      {i.purchase_no}
                    </Link>
                  </Td>
                  <Td>{i.suppliers?.name}</Td>
                  <Td>{i.invoice_no}</Td>
                  <Td>{date(i.invoice_date)}</Td>
                  <Td>{date(i.due_date)}</Td>
                  <Td right>{inr(i.total)}</Td>
                  <Td right>{inr(i.amount_paid)}</Td>
                  <Td>
                    {i.status === "cancelled" ? (
                      <StatusBadge status="cancelled" />
                    ) : Number(i.amount_paid) >= Number(i.total) ? (
                      <Badge tone="good">paid</Badge>
                    ) : i.due_date && i.due_date < todayIST() ? (
                      <Badge tone="bad">overdue</Badge>
                    ) : (
                      <Badge tone="warn">{Number(i.amount_paid) > 0 ? "part paid" : "unpaid"}</Badge>
                    )}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No supplier bills recorded yet.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "payables" ? (
        <Card description="Balance on each supplier's account, including milk collections from farmers.">
          {payables.length ? (
            <Table head={["Supplier", "Balance owed", "Overdue", "Next due", ""]}>
              {payables.map((p) => (
                <tr key={p.supplier_id}>
                  <Td>{p.supplier}</Td>
                  <Td right className="font-semibold">
                    {inr(p.balance)}
                  </Td>
                  <Td right className={Number(p.overdue) > 0 ? "text-accent-dark" : ""}>
                    {inr(p.overdue)}
                  </Td>
                  <Td>{date(p.next_due)}</Td>
                  <Td>
                    {ops.can("purchases", "edit") && Number(p.balance) > 0 ? (
                      <Link href={`/ops/finance/purchases/pay?supplier=${p.supplier_id}`} className="font-semibold text-primary-dark hover:underline">
                        Pay
                      </Link>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing owed to suppliers.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "payments" ? (
        <Card>
          {(payments ?? []).length ? (
            <Table head={["Payment", "Supplier", "Date", "Method", "Reference", "Amount"]}>
              {((payments ?? []) as Payment[]).map((p) => (
                <tr key={p.id}>
                  <Td>{p.payment_no}</Td>
                  <Td>{p.party_name}</Td>
                  <Td>{date(p.paid_on)}</Td>
                  <Td>{p.method.replace(/_/g, " ")}</Td>
                  <Td>{p.reference}</Td>
                  <Td right>{inr(p.amount)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No supplier payments yet.</Empty>
          )}
        </Card>
      ) : null}
    </>
  );
}
