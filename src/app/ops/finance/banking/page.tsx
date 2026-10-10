import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Card, Checkbox, Empty, Grid, Input, NumberInput, PageHeader, Select, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, param, todayIST } from "@/lib/ops/format";
import { moneyAccounts, monthToDate } from "@/lib/ops/finance";

export const metadata = { title: "Cash & bank" };

type Balance = { account_code: string; name: string; kind: string; balance: number; unreconciled: number | null; last_counted: string | null; last_count_difference: number | null };
type LedgerRow = { entry_date: string; entry_no: string; memo: string | null; party: string | null; debit: number; credit: number; running_balance: number; line_id: number; reconciled: boolean };
type Entry = { id: string; entry_no: string; entry_date: string; source_type: string; memo: string | null; reversal_of: string | null; reason: string | null; posted_at: string };

export default async function BankingPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("banking");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "balances";
  const range = monthToDate(todayIST());
  const from = param(sp.from) ?? range.from;
  const to = param(sp.to) ?? range.to;
  const account = param(sp.account) ?? "1010";

  const [{ data: balData }, accounts, { data: ledgerData }, { data: entryData }, { data: acctData }] = await Promise.all([
    ops.supabase.rpc("fin_money_balances"),
    moneyAccounts(ops),
    tab === "ledger" ? ops.supabase.rpc("fin_account_ledger", { p_code: account, p_from: from, p_to: to }) : Promise.resolve({ data: [] }),
    tab === "journal"
      ? ops.supabase.from("journal_entries").select("id, entry_no, entry_date, source_type, memo, reversal_of, reason, posted_at").gte("entry_date", from).lte("entry_date", to).order("posted_at", { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
    tab === "journal" || tab === "ledger" ? ops.supabase.from("ledger_accounts").select("code, name, type, subtype").eq("is_active", true).order("code") : Promise.resolve({ data: [] }),
  ]);
  const balances = (balData ?? []) as Balance[];
  const ledger = (ledgerData ?? []) as LedgerRow[];
  const entries = (entryData ?? []) as Entry[];
  const allAccounts = (acctData ?? []) as { code: string; name: string; type: string; subtype: string | null }[];
  const reversed = new Set(entries.filter((e) => e.reversal_of).map((e) => e.reversal_of));
  const isBank = balances.find((b) => b.account_code === account)?.kind !== "cash" && balances.some((b) => b.account_code === account);
  const reconcile = isBank && ops.can("banking", "approve");
  const ledgerTable = (
    <div className="-mx-1 overflow-x-auto">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-dark/55">
            {isBank ? <th className="w-8 px-1 pb-1">✓</th> : null}
            <th className="px-1 pb-1">Date</th>
            <th className="px-1 pb-1">Entry</th>
            <th className="px-1 pb-1">Details</th>
            <th className="px-1 pb-1 text-right">In / debit</th>
            <th className="px-1 pb-1 text-right">Out / credit</th>
            <th className="px-1 pb-1 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {ledger.map((l) => (
            <tr key={l.line_id} className="border-t border-ink/5">
              {isBank ? (
                <td className="px-1 py-1">
                  {l.reconciled ? (
                    <Badge tone="good">✓</Badge>
                  ) : ops.can("banking", "approve") ? (
                    <input type="checkbox" name="p_line_ids#intlist" value={l.line_id} aria-label={`Matched ${l.entry_no}`} className="h-4 w-4 accent-ink" />
                  ) : null}
                </td>
              ) : null}
              <td className="px-1 py-1">{date(l.entry_date)}</td>
              <td className="px-1 py-1">{l.entry_no}</td>
              <td className="px-1 py-1">
                {l.memo}
                {l.party ? <span className="text-dark/50"> · {l.party}</span> : null}
              </td>
              <td className="px-1 py-1 text-right">{Number(l.debit) ? inr(l.debit) : ""}</td>
              <td className="px-1 py-1 text-right">{Number(l.credit) ? inr(l.credit) : ""}</td>
              <td className="px-1 py-1 text-right font-semibold">{inr(l.running_balance)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  const rangeForm = (extra: React.ReactNode) => (
    <form className="flex flex-wrap items-center gap-2 text-sm">
      <input type="hidden" name="tab" value={tab} />
      {extra}
      <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1" />
      <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1" />
      <button className="rounded-lg bg-white px-3 py-1 font-semibold ring-1 ring-ink/15">Show</button>
    </form>
  );

  return (
    <>
      <PageHeader title="Cash & bank" description="Balances from the books, transfers, cash counts, bank reconciliation and accountant's journal entries." />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {balances.map((b) => (
          <div key={b.account_code} className="rounded-2xl border-2 border-ink/10 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">{b.name}</p>
            <p className="font-heading text-xl font-bold text-ink">{inr(b.balance)}</p>
            {b.kind === "cash" ? (
              <p className="text-xs text-dark/55">
                {b.last_counted ? `counted ${date(b.last_counted)}${Number(b.last_count_difference) ? ` · diff ${inr(b.last_count_difference)}` : ""}` : "not counted yet"}
              </p>
            ) : (
              <p className="text-xs text-dark/55">{inr(b.unreconciled)} not matched to statement</p>
            )}
          </div>
        ))}
      </div>
      <Tabs
        current={tab}
        items={[
          { key: "balances", label: "Transfer & cash count", href: "/ops/finance/banking" },
          { key: "ledger", label: "Account statement / reconcile", href: `/ops/finance/banking?tab=ledger&account=${account}` },
          { key: "journal", label: "Journal entries", href: "/ops/finance/banking?tab=journal" },
        ]}
      />

      {tab === "balances" ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ops.can("banking", "create") ? (
            <Card title="Move money between accounts" description="E.g. cash deposited in the bank, or Razorpay settlement received.">
              <OpsForm fn="fin_transfer" submitLabel="Record transfer" idempotent success="Transfer recorded">
                <Grid cols={2}>
                  <Select label="From" name="p_from" options={accounts} defaultValue="1000" />
                  <Select label="To" name="p_to" options={accounts} defaultValue="1010" />
                  <NumberInput label="Amount (₹)" name="p_amount#num" required />
                  <Input label="Date" name="p_date#date" type="date" required defaultValue={todayIST()} />
                </Grid>
                <Input label="Reference / note" name="p_reference" />
              </OpsForm>
            </Card>
          ) : null}
          {ops.can("banking", "create") ? (
            <Card title="Cash count" description="Count the cash and record it. A difference can be posted to the books by an approver.">
              <OpsForm fn="fin_cash_count" submitLabel="Save count" success="Count saved">
                <Grid cols={2}>
                  <Select label="Account" name="p_account_code" options={accounts.filter((a) => a.kind === "cash")} />
                  <NumberInput label="Cash counted (₹)" name="p_counted#num" required />
                  <Input label="Date" name="p_date#date" type="date" defaultValue={todayIST()} />
                  <Input label="Notes" name="p_notes" />
                </Grid>
                {ops.can("banking", "approve") ? <Checkbox label="Post any difference to the books" name="p_post_difference#bool" /> : null}
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "ledger" ? (
        <Card
          actions={rangeForm(
            <select name="account" defaultValue={account} aria-label="Account" className="rounded-lg border-2 border-ink/15 bg-white px-2 py-1">
              {(allAccounts.length ? allAccounts.map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })) : accounts).map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </select>
          )}
        >
          {ledger.length ? (
            reconcile ? (
              <OpsForm fn="fin_reconcile" submitLabel="Mark ticked lines as matched to the bank statement" success="Lines reconciled" variant="secondary">
                {ledgerTable}
                <Grid cols={2}>
                  <Input label="Statement date" name="p_statement_date#date" type="date" required defaultValue={todayIST()} />
                  <Input label="Statement reference" name="p_statement_ref" />
                </Grid>
              </OpsForm>
            ) : (
              ledgerTable
            )
          ) : (
            <Empty>No entries for this account in the period.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "journal" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2">
            <Card actions={rangeForm(null)} description="Every posting in the books. Entries are permanent; corrections are reversing entries.">
              {entries.length ? (
                <Table head={["Entry", "Date", "Source", "Details", ""]} compact>
                  {entries.map((e) => (
                    <tr key={e.id}>
                      <Td>{e.entry_no}</Td>
                      <Td>
                        {date(e.entry_date)}
                        <div className="text-dark/50">{dateTime(e.posted_at)}</div>
                      </Td>
                      <Td>{label(e.source_type)}</Td>
                      <Td>
                        {e.memo}
                        {e.reason ? <div className="text-dark/55">{e.reason}</div> : null}
                      </Td>
                      <Td>
                        {ops.can("banking", "approve") && ["manual", "transfer", "cash_count"].includes(e.source_type) && !e.reversal_of && !reversed.has(e.id) ? (
                          <OpsForm fn="fin_reverse_entry" submitLabel="Reverse" variant="quiet" inline confirm="Reverse this entry?" success="Reversed">
                            <input type="hidden" name="p_entry_id" value={e.id} />
                            <Input label="Reason" name="p_reason" required className="w-36" />
                          </OpsForm>
                        ) : null}
                      </Td>
                    </tr>
                  ))}
                </Table>
              ) : (
                <Empty>No entries in this period.</Empty>
              )}
            </Card>
          </div>
          {ops.can("banking", "approve") ? (
            <Card title="Journal entry" description="For opening balances, accruals and corrections advised by your accountant. Debits must equal credits. Stock accounts change only through stock movements.">
              <OpsForm fn="fin_manual_journal" submitLabel="Post entry" idempotent confirm="Post this journal entry?" success="Entry posted">
                <Input label="Date" name="p_date#date" type="date" required defaultValue={todayIST()} />
                <Input label="Description" name="p_memo" required />
                <LineEditor
                  name="p_lines#json"
                  minRows={2}
                  columns={[
                    {
                      key: "account",
                      label: "Account",
                      type: "select",
                      required: true,
                      options: allAccounts.filter((a) => !["inventory"].includes(a.subtype ?? "")).map((a) => ({ value: a.code, label: `${a.code} ${a.name}` })),
                    },
                    { key: "debit", label: "Debit ₹", type: "number", width: "7rem" },
                    { key: "credit", label: "Credit ₹", type: "number", width: "7rem" },
                    { key: "memo", label: "Note", type: "text" },
                  ]}
                />
              </OpsForm>
            </Card>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
