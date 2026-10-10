import { Card, Empty, Notice, PageHeader, Stat, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, inr, label, param, pct, qty, todayIST } from "@/lib/ops/format";
import { monthToDate } from "@/lib/ops/finance";

export const metadata = { title: "Financial reports" };

type PL = {
  lines: { code: string; name: string; type: string; subtype: string | null; amount: number }[];
  net_sales: number; cost_of_goods_sold: number; gross_profit: number; operating_expenses: number; operating_profit: number;
  cash_received: number; inventory_purchased: number; expenses_incurred: number; note: string;
};
type TB = { account_code: string; name: string; type: string; debit: number; credit: number; balance: number };
type CashFlow = { opening: number; closing: number; inflows: Record<string, number>; outflows: Record<string, number>; net_change: number };
type Gst = { output_cgst: number; output_sgst: number; output_igst: number; input_cgst: number; input_sgst: number; input_igst: number; note: string };
type Margin = { item_id: string; code: string; name: string; units_dispatched: number; sales_value: number; cost_value: number; gross_margin: number; margin_pct: number | null };
type Valuation = { by_type: { item_type: string; value: number; ledger: number }[]; work_in_progress: number; total: number };

const exportable: Record<string, string> = { pl: "profit-and-loss", tb: "trial-balance", margins: "product-margins", gst: "gst-summary" };

export default async function FinancialReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("reports");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "pl";
  const range = monthToDate(todayIST());
  const from = param(sp.from) ?? range.from;
  const to = param(sp.to) ?? range.to;

  const call = async <T,>(fn: string, args: Record<string, unknown>) => {
    const { data, error } = await ops.supabase.rpc(fn, args);
    return { data: data as T | null, error: error?.message };
  };
  const result =
    tab === "pl"
      ? await call<PL>("fin_profit_and_loss", { p_from: from, p_to: to })
      : tab === "tb"
        ? await call<TB[]>("fin_trial_balance", { p_to: to })
        : tab === "cash"
          ? await call<CashFlow>("fin_cash_flow", { p_from: from, p_to: to })
          : tab === "gst"
            ? await call<Gst>("fin_gst_summary", { p_from: from, p_to: to })
            : tab === "margins"
              ? await call<Margin[]>("fin_product_margins", { p_from: from, p_to: to })
              : await call<Valuation>("inv_valuation", {});
  const query = `from=${from}&to=${to}`;

  return (
    <>
      <PageHeader
        title="Financial reports"
        description="Straight from the double-entry books. Profit is sales less cost of goods sold and expenses — not the cash received."
        actions={
          <form className="flex flex-wrap items-center gap-2 text-sm">
            <input type="hidden" name="tab" value={tab} />
            <input type="date" name="from" defaultValue={from} aria-label="From" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
            <input type="date" name="to" defaultValue={to} aria-label="To" className="rounded-lg border-2 border-ink/15 px-2 py-1.5" />
            <button className="rounded-lg bg-white px-3 py-1.5 font-semibold ring-1 ring-ink/15">Show</button>
            {ops.can("reports", "export") && exportable[tab] ? (
              <a href={`/ops/export/${exportable[tab]}?${query}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 font-semibold text-ink">
                Export CSV
              </a>
            ) : null}
          </form>
        }
      />
      <Tabs
        current={tab}
        items={[
          { key: "pl", label: "Profit & loss", href: `/ops/finance/reports?${query}` },
          { key: "tb", label: "Trial balance", href: `/ops/finance/reports?tab=tb&${query}` },
          { key: "cash", label: "Cash flow", href: `/ops/finance/reports?tab=cash&${query}` },
          { key: "gst", label: "GST summary", href: `/ops/finance/reports?tab=gst&${query}` },
          { key: "margins", label: "Product margins", href: `/ops/finance/reports?tab=margins&${query}` },
          { key: "stock", label: "Stock valuation", href: `/ops/finance/reports?tab=stock&${query}` },
        ]}
      />
      {result.error ? <Notice tone="bad">{result.error}</Notice> : null}

      {tab === "pl" && result.data ? <ProfitAndLoss pl={result.data as PL} from={from} to={to} /> : null}

      {tab === "tb" && result.data ? <TrialBalance rows={result.data as TB[]} to={to} /> : null}

      {tab === "cash" && result.data ? (
        (() => {
          const cf = result.data as CashFlow;
          return (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={`Cash & bank on ${date(from)}`} value={inr(cf.opening, 0)} />
                <Stat label="Money in" value={inr(Object.values(cf.inflows).reduce((s, v) => s + Number(v), 0), 0)} tone="good" />
                <Stat label="Money out" value={inr(Object.values(cf.outflows).reduce((s, v) => s + Number(v), 0), 0)} tone="warn" />
                <Stat label={`Cash & bank on ${date(to)}`} value={inr(cf.closing, 0)} />
              </div>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <Card title="Money in, by source">
                  <SourceTable values={cf.inflows} />
                </Card>
                <Card title="Money out, by source">
                  <SourceTable values={cf.outflows} />
                </Card>
              </div>
              <p className="text-xs text-dark/55">Transfers between your own accounts are left out.</p>
            </div>
          );
        })()
      ) : null}

      {tab === "gst" && result.data ? (
        (() => {
          const g = result.data as Gst;
          const output = Number(g.output_cgst) + Number(g.output_sgst) + Number(g.output_igst);
          const input = Number(g.input_cgst) + Number(g.input_sgst) + Number(g.input_igst);
          return (
            <Card description={g.note}>
              <Table head={["", "CGST", "SGST", "IGST", "Total"]}>
                <tr>
                  <Td>GST collected on sales (output)</Td>
                  <Td right>{inr(g.output_cgst)}</Td>
                  <Td right>{inr(g.output_sgst)}</Td>
                  <Td right>{inr(g.output_igst)}</Td>
                  <Td right className="font-semibold">
                    {inr(output)}
                  </Td>
                </tr>
                <tr>
                  <Td>GST paid on purchases (input credit)</Td>
                  <Td right>{inr(g.input_cgst)}</Td>
                  <Td right>{inr(g.input_sgst)}</Td>
                  <Td right>{inr(g.input_igst)}</Td>
                  <Td right className="font-semibold">
                    {inr(input)}
                  </Td>
                </tr>
                <tr>
                  <Td className="font-semibold">Net (before set-off rules)</Td>
                  <Td right>{inr(Number(g.output_cgst) - Number(g.input_cgst))}</Td>
                  <Td right>{inr(Number(g.output_sgst) - Number(g.input_sgst))}</Td>
                  <Td right>{inr(Number(g.output_igst) - Number(g.input_igst))}</Td>
                  <Td right className="font-semibold">
                    {inr(output - input)}
                  </Td>
                </tr>
              </Table>
            </Card>
          );
        })()
      ) : null}

      {tab === "margins" && result.data ? (
        <Card description="Dispatched quantity (less returns) at the ex-GST selling price, against the actual cost of the batch lots it came from.">
          {(result.data as Margin[]).length ? (
            <Table head={["Product", "Units", "Sales (ex-GST)", "Cost", "Gross margin", "Margin %"]}>
              {(result.data as Margin[]).map((m) => (
                <tr key={m.item_id}>
                  <Td>
                    {m.name}
                    <div className="text-xs text-dark/55">{m.code}</div>
                  </Td>
                  <Td right>{qty(m.units_dispatched)}</Td>
                  <Td right>{inr(m.sales_value)}</Td>
                  <Td right>{inr(m.cost_value)}</Td>
                  <Td right className={Number(m.gross_margin) < 0 ? "font-semibold text-red-700" : "font-semibold"}>
                    {inr(m.gross_margin)}
                  </Td>
                  <Td right>{pct(m.margin_pct)}</Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing dispatched in this period.</Empty>
          )}
        </Card>
      ) : null}

      {tab === "stock" && result.data ? (
        (() => {
          const v = result.data as Valuation;
          return (
            <Card description="Stock on hand at its lot cost, checked against the inventory accounts in the books. The two should match.">
              <Table head={["Stock type", "From stock lots", "In the books", "Difference"]}>
                {v.by_type.map((t) => (
                  <tr key={t.item_type}>
                    <Td>{label(t.item_type)}</Td>
                    <Td right>{inr(t.value)}</Td>
                    <Td right>{inr(t.ledger)}</Td>
                    <Td right className={Math.abs(Number(t.value) - Number(t.ledger)) >= 1 ? "font-semibold text-red-700" : "text-emerald-700"}>
                      {inr(Number(t.value) - Number(t.ledger))}
                    </Td>
                  </tr>
                ))}
                <tr>
                  <Td>Work in progress (open batches)</Td>
                  <Td right>—</Td>
                  <Td right>{inr(v.work_in_progress)}</Td>
                  <Td />
                </tr>
                <tr>
                  <Td className="font-semibold">Total stock</Td>
                  <Td right className="font-semibold">
                    {inr(v.total)}
                  </Td>
                  <Td />
                  <Td />
                </tr>
              </Table>
            </Card>
          );
        })()
      ) : null}
    </>
  );
}

function SourceTable({ values }: { values: Record<string, number> }) {
  const rows = Object.entries(values).sort((a, b) => Number(b[1]) - Number(a[1]));
  return rows.length ? (
    <Table head={["Source", "Amount"]} compact>
      {rows.map(([k, v]) => (
        <tr key={k}>
          <Td>{label(k)}</Td>
          <Td right>{inr(v)}</Td>
        </tr>
      ))}
    </Table>
  ) : (
    <Empty>None.</Empty>
  );
}

function ProfitAndLoss({ pl, from, to }: { pl: PL; from: string; to: string }) {
  const income = pl.lines.filter((l) => l.type === "income");
  const cogs = pl.lines.filter((l) => l.type === "expense" && l.subtype === "cogs");
  const opex = pl.lines.filter((l) => l.type === "expense" && l.subtype !== "cogs");
  const section = (title: string, rows: PL["lines"], total: number) => (
    <>
      <tr className="bg-ink/5">
        <Td className="font-semibold">{title}</Td>
        <Td />
      </tr>
      {rows.map((l) => (
        <tr key={l.code}>
          <Td className="pl-6">
            {l.code} {l.name}
          </Td>
          <Td right>{inr(l.amount)}</Td>
        </tr>
      ))}
      <tr>
        <Td className="font-semibold">Total {title.toLowerCase()}</Td>
        <Td right className="font-semibold">
          {inr(total)}
        </Td>
      </tr>
    </>
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Net sales (ex-GST)" value={inr(pl.net_sales, 0)} />
        <Stat label="Gross profit" value={inr(pl.gross_profit, 0)} hint={pl.net_sales ? `${((pl.gross_profit / pl.net_sales) * 100).toFixed(1)}% of sales` : undefined} />
        <Stat label="Operating profit" value={inr(pl.operating_profit, 0)} tone={pl.operating_profit < 0 ? "warn" : "good"} />
        <Stat label="Cash received from customers" value={inr(pl.cash_received, 0)} hint="Not the same as sales" />
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Card title={`Profit & loss, ${date(from)} – ${date(to)}`} description={pl.note}>
            <Table head={["Account", "Amount"]}>
              {section("Income", income, pl.net_sales)}
              {section("Cost of goods sold", cogs, pl.cost_of_goods_sold)}
              <tr className="border-t-2 border-ink/20">
                <Td className="font-bold">Gross profit</Td>
                <Td right className="font-bold">
                  {inr(pl.gross_profit)}
                </Td>
              </tr>
              {section("Operating expenses", opex, pl.operating_expenses)}
              <tr className="border-t-2 border-ink/20">
                <Td className="font-bold">Operating profit</Td>
                <Td right className="font-bold">
                  {inr(pl.operating_profit)}
                </Td>
              </tr>
            </Table>
          </Card>
        </div>
        <Card title="Kept separate from profit">
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-2 text-sm">
            <dt>Cash received from customers</dt>
            <dd className="text-right">{inr(pl.cash_received)}</dd>
            <dt>Stock bought (purchases + milk)</dt>
            <dd className="text-right">{inr(pl.inventory_purchased)}</dd>
            <dt>Expenses approved</dt>
            <dd className="text-right">{inr(pl.expenses_incurred)}</dd>
          </dl>
          <p className="mt-3 text-xs text-dark/55">Stock bought is an asset until it is used or sold; only its cost of goods sold is in the profit.</p>
        </Card>
      </div>
    </div>
  );
}

function TrialBalance({ rows, to }: { rows: TB[]; to: string }) {
  const dr = rows.reduce((s, r) => s + Number(r.debit), 0);
  const cr = rows.reduce((s, r) => s + Number(r.credit), 0);
  return (
    <Card title={`Trial balance as at ${date(to)}`} description={Math.abs(dr - cr) < 0.005 ? "Debits equal credits." : "Debits and credits do not match — contact support."}>
      {rows.length ? (
        <Table head={["Account", "Type", "Debits", "Credits", "Balance"]} compact>
          {rows.map((r) => (
            <tr key={r.account_code}>
              <Td>
                {r.account_code} {r.name}
              </Td>
              <Td>{r.type}</Td>
              <Td right>{inr(r.debit)}</Td>
              <Td right>{inr(r.credit)}</Td>
              <Td right className="font-semibold">
                {Number(r.balance) >= 0 ? `${inr(r.balance)} Dr` : `${inr(-Number(r.balance))} Cr`}
              </Td>
            </tr>
          ))}
          <tr className="border-t-2 border-ink/20">
            <Td className="font-bold">Total</Td>
            <Td />
            <Td right className="font-bold">
              {inr(dr)}
            </Td>
            <Td right className="font-bold">
              {inr(cr)}
            </Td>
            <Td />
          </tr>
        </Table>
      ) : (
        <Empty>No postings yet.</Empty>
      )}
    </Card>
  );
}
