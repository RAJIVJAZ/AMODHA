import type { Metadata } from "next";
import Link from "next/link";
import { Card, Notice, PageTitle, SupportLinks } from "@/components/b2b/trade-ui";
import { SignOutButton } from "@/components/b2b/trade-shell";
import { ConsentForm } from "@/components/b2b/trade-widgets";
import { customerTypes, paymentTerms } from "@/lib/b2b/labels";
import type { Statement } from "@/lib/b2b/types";
import { date, inr, param, todayIST } from "@/lib/ops/format";
import { ISO_DATE, requireCustomer, rpc } from "../_lib/data";

export const metadata: Metadata = { title: "Account" };

const kinds: Record<string, string> = {
  invoice: "Invoice",
  payment: "Payment received",
  cancellation: "Cancellation",
  credit_note: "Credit note",
  refund: "Refund",
};

const methodLabels: Record<string, string> = { cash: "Cash", upi: "UPI", bank: "Bank transfer", bank_transfer: "Bank transfer", cheque: "Cheque", card: "Card" };

export default async function TradeAccount({ searchParams }: { searchParams: Promise<{ from?: string | string[]; to?: string | string[] }> }) {
  const me = await requireCustomer();
  const sp = await searchParams;
  const fromRaw = param(sp.from);
  const toRaw = param(sp.to);
  const from = fromRaw && ISO_DATE.test(fromRaw) ? fromRaw : todayIST(-90);
  const to = toRaw && ISO_DATE.test(toRaw) ? toRaw : todayIST();
  const { data: st, error } = await rpc<Statement>("b2b_statement", { p_customer_id: me.customer.id, p_from: from, p_to: to });
  const c = me.customer;
  const credit = st?.credit ?? me.credit;
  const onCredit = c.payment_terms === "credit";
  const address = [c.business_address, c.locality, c.city, c.pincode].filter(Boolean).join(", ");
  const delivery = [c.delivery_address, c.locality, c.city, c.pincode].filter(Boolean).join(", ");
  const dateInput = "min-h-11 rounded-xl border-2 border-ink/15 bg-white px-3 text-base text-ink focus:border-primary focus:outline-none";

  return (
    <div className="flex flex-col gap-4">
      <PageTitle title="Account" subtitle={`${c.shop_name} · ${c.customer_code}`} />

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Business details">
          <dl className="grid gap-x-4 gap-y-2 text-sm sm:grid-cols-2">
            <Row label="Shop" value={c.shop_name} />
            <Row label="Customer code" value={c.customer_code} />
            <Row label="Owner" value={c.owner_name} />
            <Row label="Mobile" value={c.mobile} />
            {c.whatsapp ? <Row label="WhatsApp" value={c.whatsapp} /> : null}
            {c.email ? <Row label="Email" value={c.email} /> : null}
            <Row label="GSTIN" value={c.gstin ?? "Not registered"} />
            <Row label="Business type" value={customerTypes[c.customer_type] ?? c.customer_type} />
            <Row label="Business address" value={address || "—"} wide />
            <Row label="Delivery address" value={delivery || address || "—"} wide />
          </dl>
          <p className="mt-3 text-xs text-dark/55">To change these details, contact your salesperson or customer support.</p>
        </Card>

        <Card title="Credit & balance">
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <Row label="Payment terms" value={paymentTerms[c.payment_terms] ?? c.payment_terms} />
            {onCredit ? <Row label="Credit period" value={`${c.credit_days} days`} /> : <span />}
            <div>
              <dt className="text-dark/55">Outstanding balance</dt>
              <dd className="font-heading text-xl font-bold text-ink">{inr(credit.balance ?? 0)}</dd>
            </div>
            <div>
              <dt className="text-dark/55">Overdue</dt>
              <dd className={`font-heading text-xl font-bold ${(credit.overdue ?? 0) > 0 ? "text-red-700" : "text-ink"}`}>{inr(credit.overdue ?? 0)}</dd>
            </div>
            {onCredit ? (
              <>
                <Row label="Credit limit" value={inr(credit.credit_limit ?? 0)} />
                <Row label="Available to order on credit" value={inr(credit.available ?? 0)} />
              </>
            ) : null}
            {(credit.not_invoiced ?? 0) > 0 ? <Row label="Orders not invoiced yet" value={inr(credit.not_invoiced)} /> : null}
          </dl>
          <p className="mt-3 rounded-lg bg-[#f6f4f1] px-3 py-2 text-xs text-dark/65">
            Payments and balances are maintained by our accounts team. If something looks wrong, please contact customer support.
          </p>
        </Card>
      </div>

      {error ? <Notice tone="bad">Could not load your statement: {error}</Notice> : null}

      {st ? (
        <>
          <Card title="Open invoices">
            {st.open_invoices.length === 0 ? (
              <p className="text-sm text-dark/60">No unpaid invoices. Thank you!</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {st.open_invoices.map((i) => (
                  <li key={i.invoice_number} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <div>
                      <a href={`/invoice/${i.order_id}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center font-semibold text-primary-dark underline">
                        {i.invoice_number}
                      </a>
                      <p className="text-xs text-dark/55">
                        {i.order_no ? (
                          <Link href={`/trade/orders/${i.order_id}`} className="underline">
                            {i.order_no}
                          </Link>
                        ) : null}
                        {` · ${date(i.invoice_date)} · Total ${inr(i.total)}`}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-heading font-bold text-ink">{inr(i.outstanding)}</p>
                      <p className="text-xs">
                        {i.overdue ? (
                          <span className="rounded-full bg-red-100 px-2 py-0.5 font-bold text-red-800">Overdue · due {date(i.due_date)}</span>
                        ) : (
                          <span className="text-dark/55">Due {date(i.due_date)}</span>
                        )}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Account statement">
            <form action="/trade/account" className="mb-3 flex flex-wrap items-end gap-2">
              <label className="flex flex-col text-xs font-semibold text-dark/60">
                From
                <input type="date" name="from" defaultValue={st.from} className={dateInput} />
              </label>
              <label className="flex flex-col text-xs font-semibold text-dark/60">
                To
                <input type="date" name="to" defaultValue={st.to} className={dateInput} />
              </label>
              <button className="min-h-11 rounded-xl bg-ink px-4 text-sm font-semibold text-white">Show</button>
            </form>
            <div className="-mx-4 overflow-x-auto sm:mx-0">
              <table className="w-full min-w-[560px] text-sm">
                <thead>
                  <tr className="border-b border-ink/10 text-left text-xs text-dark/55">
                    <th className="px-4 py-2 font-semibold sm:px-0">Date</th>
                    <th className="px-2 py-2 font-semibold">Details</th>
                    <th className="px-2 py-2 text-right font-semibold">Debit</th>
                    <th className="px-2 py-2 text-right font-semibold">Credit</th>
                    <th className="px-4 py-2 text-right font-semibold sm:px-0">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-ink/5 bg-[#f6f4f1]">
                    <td className="px-4 py-2 sm:px-0">{date(st.from)}</td>
                    <td className="px-2 py-2 font-semibold" colSpan={3}>
                      Opening balance
                    </td>
                    <td className="px-4 py-2 text-right font-semibold sm:px-0">{inr(st.opening)}</td>
                  </tr>
                  {st.lines.map((l) => (
                    <tr key={`${l.entry_no}-${l.date}-${l.debit}-${l.credit}`} className="border-b border-ink/5 align-top">
                      <td className="whitespace-nowrap px-4 py-2 sm:px-0">{date(l.date)}</td>
                      <td className="px-2 py-2">
                        <p className="font-semibold text-ink">{kinds[l.kind] ?? l.kind}</p>
                        <p className="text-xs text-dark/55">
                          {l.memo}
                          {l.order_id ? (
                            <>
                              {" · "}
                              <Link href={`/trade/orders/${l.order_id}`} className="underline">
                                order
                              </Link>
                            </>
                          ) : null}
                        </p>
                      </td>
                      <td className="px-2 py-2 text-right">{Number(l.debit) ? inr(l.debit) : ""}</td>
                      <td className="px-2 py-2 text-right text-emerald-700">{Number(l.credit) ? inr(l.credit) : ""}</td>
                      <td className="px-4 py-2 text-right font-semibold sm:px-0">{inr(l.balance)}</td>
                    </tr>
                  ))}
                  <tr className="bg-[#f6f4f1]">
                    <td className="px-4 py-2 sm:px-0">{date(st.to)}</td>
                    <td className="px-2 py-2 font-semibold" colSpan={3}>
                      Closing balance
                    </td>
                    <td className="px-4 py-2 text-right font-heading font-bold text-ink sm:px-0">{inr(st.closing)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            {st.lines.length === 0 ? <p className="mt-2 text-sm text-dark/60">No entries in this period.</p> : null}
          </Card>

          <Card title="Payment history">
            {st.payments.length === 0 ? (
              <p className="text-sm text-dark/60">No payments recorded yet.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {st.payments.slice(0, 30).map((p) => (
                  <li key={p.payment_no} className="flex items-center justify-between gap-2 py-2.5 text-sm">
                    <div>
                      <p className="font-semibold text-ink">{date(p.paid_on)}</p>
                      <p className="text-xs text-dark/55">
                        {p.payment_no} · {methodLabels[p.method] ?? p.method}
                        {p.reference ? ` · Ref ${p.reference}` : ""}
                      </p>
                    </div>
                    <span className="font-heading font-bold text-emerald-700">{inr(p.amount)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Offers & updates">
          <ConsentForm customerId={c.id} consent={c.marketing_consent} channels={c.consent_channels ?? []} />
        </Card>
        <Card title="Customer support">
          <SupportLinks support={me.support} />
          {me.salesperson ? (
            <p className="mt-3 text-sm text-dark/65">
              Your salesperson: <strong className="text-ink">{me.salesperson.name}</strong>
              {me.salesperson.phone ? (
                <>
                  {" · "}
                  <a href={`tel:${me.salesperson.phone.replace(/[^\d+]/g, "")}`} className="font-semibold text-primary-dark underline">
                    {me.salesperson.phone}
                  </a>
                </>
              ) : null}
            </p>
          ) : null}
          <Link href="/account" className="mt-3 inline-flex min-h-11 items-center text-sm font-semibold text-primary-dark underline">
            Help & support requests
          </Link>
          <div className="mt-4 border-t border-ink/10 pt-4">
            <SignOutButton className="min-h-11 rounded-xl border-2 border-ink/15 bg-white px-4 text-sm font-semibold text-ink" />
          </div>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, wide }: { label: string; value: string; wide?: boolean }) {
  return (
    <div className={wide ? "sm:col-span-2" : ""}>
      <dt className="text-dark/55">{label}</dt>
      <dd className="font-semibold text-ink">{value}</dd>
    </div>
  );
}
