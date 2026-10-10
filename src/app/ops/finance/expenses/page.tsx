import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Empty, Grid, Input, NumberInput, PageHeader, Select, Stat, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, label, param, todayIST } from "@/lib/ops/format";
import { moneyAccounts, monthToDate, paymentMethods } from "@/lib/ops/finance";

export const metadata = { title: "Expenses" };

type Expense = {
  id: string; expense_no: string; expense_date: string; category_code: string; amount: number; gst_amount: number; payee: string; description: string | null;
  paid_from: string | null; payment_method: string | null; reference: string | null; document_url: string | null; status: string; decision_note: string | null;
  created_by: string | null; expense_categories: { label: string } | null;
};

const tone = { approved: "good", pending_approval: "warn", rejected: "bad", cancelled: "bad" } as const;

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("expenses");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "list";
  const range = monthToDate(todayIST());
  const from = param(sp.from) ?? range.from;
  const to = param(sp.to) ?? range.to;

  const [{ data: expData }, { data: pendingData }, { data: catData }, accounts, { data: limit }] = await Promise.all([
    ops.supabase
      .from("expenses")
      .select("id, expense_no, expense_date, category_code, amount, gst_amount, payee, description, paid_from, payment_method, reference, document_url, status, decision_note, created_by, expense_categories(label)")
      .gte("expense_date", from)
      .lte("expense_date", to)
      .order("expense_date", { ascending: false })
      .limit(500),
    ops.supabase
      .from("expenses")
      .select("id, expense_no, expense_date, category_code, amount, gst_amount, payee, description, paid_from, payment_method, reference, document_url, status, decision_note, created_by, expense_categories(label)")
      .eq("status", "pending_approval")
      .order("expense_date"),
    ops.supabase.from("expense_categories").select("code, label").eq("is_active", true).order("label"),
    ops.can("expenses", "create") ? moneyAccounts(ops) : Promise.resolve([]),
    ops.supabase.rpc("setting_num", { p_key: "finance.expense_approval_limit", p_default: 5000 }),
  ]);
  const expenses = (expData ?? []) as unknown as Expense[];
  const pending = (pendingData ?? []) as unknown as Expense[];
  const categories = (catData ?? []) as { code: string; label: string }[];
  const approved = expenses.filter((e) => e.status === "approved");
  const byCategory = new Map<string, number>();
  for (const e of approved) byCategory.set(e.expense_categories?.label ?? e.category_code, (byCategory.get(e.expense_categories?.label ?? e.category_code) ?? 0) + Number(e.amount));

  return (
    <>
      <PageHeader title="Expenses" description={`Running costs (electricity, fuel, rent…). Expenses above ${inr(Number(limit ?? 5000), 0)} wait for an approver before they reach the books.`} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={`Approved ${date(from)} – ${date(to)}`} value={inr(approved.reduce((s, e) => s + Number(e.amount), 0), 0)} />
        <Stat label="Waiting for approval" value={pending.length} tone={pending.length ? "warn" : "default"} href="/ops/finance/expenses?tab=approve" />
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "list", label: "Expenses", href: `/ops/finance/expenses?from=${from}&to=${to}` },
          { key: "approve", label: `Approvals (${pending.length})`, href: "/ops/finance/expenses?tab=approve" },
          ...(ops.can("expenses", "create") ? [{ key: "new", label: "+ Record expense", href: "/ops/finance/expenses?tab=new" }] : []),
        ]}
      />

      {tab === "list" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card
              actions={
                <form className="flex flex-wrap items-center gap-2 text-sm">
                  <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1" />
                  <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1" />
                  <button className="rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-ink/15">Show</button>
                </form>
              }
            >
              {expenses.length ? (
                <Table head={["No.", "Date", "Category", "Paid to", "Amount", "GST", "Paid from", "Status"]} compact>
                  {expenses.map((e) => (
                    <tr key={e.id}>
                      <Td>
                        {e.expense_no}
                        {e.document_url ? (
                          <a href={e.document_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary-dark hover:underline">
                            bill
                          </a>
                        ) : null}
                      </Td>
                      <Td>{date(e.expense_date)}</Td>
                      <Td>{e.expense_categories?.label}</Td>
                      <Td>
                        {e.payee}
                        {e.description ? <div className="text-dark/55">{e.description}</div> : null}
                      </Td>
                      <Td right>{inr(e.amount)}</Td>
                      <Td right>{Number(e.gst_amount) ? inr(e.gst_amount) : "—"}</Td>
                      <Td>{e.paid_from ? `${e.paid_from} · ${label(e.payment_method)}` : "to pay"}</Td>
                      <Td>
                        <Badge tone={tone[e.status as keyof typeof tone]}>{label(e.status)}</Badge>
                        {e.decision_note && e.status === "rejected" ? <div className="text-dark/55">{e.decision_note}</div> : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No expenses in this period.</Empty>
              )}
            </Card>
          </div>
          <Card title="By category (approved)">
            {byCategory.size ? (
              <Table head={["Category", "Amount"]} compact>
                {[...byCategory.entries()]
                  .sort((a, b) => b[1] - a[1])
                  .map(([c, v]) => (
                    <tr key={c}>
                      <Td>{c}</Td>
                      <Td right>{inr(v, 0)}</Td>
                    </tr>
                  ))}
              </Table>
            ) : (
              <Empty>Nothing yet.</Empty>
            )}
          </Card>
        </div>
      ) : null}

      {tab === "approve" ? (
        <Card description="The person who recorded an expense cannot approve it themselves (except the owner).">
          {pending.length ? (
            <div className="flex flex-col divide-y divide-ink/10">
              {pending.map((e) => (
                <div key={e.id} className="flex flex-col gap-2 py-3 lg:flex-row lg:items-center lg:justify-between">
                  <div className="text-sm">
                    <p className="font-semibold text-ink">
                      {e.expense_no} · {e.payee} · {inr(e.amount)}
                    </p>
                    <p className="text-dark/65">
                      {date(e.expense_date)} · {e.expense_categories?.label}
                      {e.description ? ` · ${e.description}` : ""}
                      {e.document_url ? (
                        <a href={e.document_url} target="_blank" rel="noopener noreferrer" className="ml-1 text-primary-dark hover:underline">
                          view bill
                        </a>
                      ) : null}
                    </p>
                  </div>
                  {ops.can("expenses", "approve") ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <OpsForm fn="fin_decide_expense" submitLabel="Approve" inline success="Approved and posted">
                        <input type="hidden" name="p_expense_id" value={e.id} />
                        <input type="hidden" name="p_approve#bool" value="true" />
                      </OpsForm>
                      <OpsForm fn="fin_decide_expense" submitLabel="Reject" variant="danger" inline success="Rejected">
                        <input type="hidden" name="p_expense_id" value={e.id} />
                        <input type="hidden" name="p_approve#bool" value="false" />
                        <Input label="Reason" name="p_note" required />
                      </OpsForm>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          ) : (
            <Empty>Nothing waiting for approval.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "new" && ops.can("expenses", "create") ? (
        <Card title="Record an expense">
          <OpsForm fn="fin_record_expense" submitLabel="Save expense" idempotent success="Expense recorded" resetOnSuccess>
            <Grid cols={3}>
              <Input label="Date" name="p_date#date" type="date" required defaultValue={todayIST()} />
              <Select label="Category" name="p_category" required placeholder="Choose…" options={categories.map((c) => ({ value: c.code, label: c.label }))} />
              <Input label="Paid to" name="p_payee" required />
              <NumberInput label="Amount incl. GST (₹)" name="p_amount#num" required />
              <NumberInput label="GST in the amount (₹)" name="p_gst_amount#num" hint="Only if the bill shows GST and you are GST registered" />
              <Input label="Description" name="p_description" />
              <Select label="Paid from" name="p_paid_from" placeholder="Not paid yet (owed)" options={accounts} />
              <Select label="Method" name="p_payment_method" placeholder="—" options={paymentMethods} />
              <Input label="Reference" name="p_reference" />
            </Grid>
            <Input label="Link to bill / photo" name="p_document_url" placeholder="https://…" />
          </OpsForm>
        </Card>
      ) : null}
    </>
  );
}
