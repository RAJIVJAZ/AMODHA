import Link from "next/link";
import { Badge, ButtonLink, Card, Empty, Notice, PageHeader, Table, Tabs, Td } from "@/components/ops/ui";
import { approvalReasons, channels, paymentMethods, statusTone } from "@/lib/b2b/labels";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, label, param, qty } from "@/lib/ops/format";
import { num, priorityTone, qs, queueFilters, type QueueRow, type SearchParams } from "./_lib";

export const metadata = { title: "B2B and retail order operations" };

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export default async function OrderOperationsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const ops = await requireOps("dispatch");
  const sp = await searchParams;
  const filter = queueFilters.some((f) => f.key === param(sp.filter)) ? (param(sp.filter) as string) : "action";
  const q = (param(sp.q) ?? "").trim().slice(0, 80);
  const from = DATE.test(param(sp.from) ?? "") ? param(sp.from) : undefined;
  const to = DATE.test(param(sp.to) ?? "") ? param(sp.to) : undefined;

  const { data, error } = await ops.supabase.rpc("ops_order_queue", {
    p_filter: filter,
    p_search: q || null,
    p_from: from ?? null,
    p_to: to ?? null,
    p_limit: 300,
  });
  const rows = (data ?? []) as QueueRow[];
  const keep = { q, from, to };

  return (
    <>
      <PageHeader
        title="B2B and retail order operations"
        description="Every order in one queue — salesperson orders, direct orders from the Wholesale app, website and staff orders. Urgent and high-priority orders come first, then by delivery date."
        actions={
          <>
            {ops.can("dispatch", "create") ? <ButtonLink href="/ops/dispatch/new" variant="secondary">+ Phone / walk-in order</ButtonLink> : null}
            {ops.can("production") || ops.can("dispatch") ? <ButtonLink href="/ops/b2b/planning" variant="secondary">Production requirements</ButtonLink> : null}
          </>
        }
      />

      <form className="mb-4 flex flex-wrap items-end gap-2" role="search">
        <input type="hidden" name="filter" value={filter} />
        <label className="flex min-w-0 flex-1 flex-col gap-1 text-sm sm:max-w-sm">
          <span className="font-semibold text-ink">Search</span>
          <input
            name="q"
            defaultValue={q}
            placeholder="Order no., customer, phone or customer code"
            className="w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Placed from</span>
          <input type="date" name="from" defaultValue={from} className="rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm" />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">to</span>
          <input type="date" name="to" defaultValue={to} className="rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm" />
        </label>
        <button className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">Search</button>
        {q || from || to ? (
          <Link href={`/ops/b2b${qs({ filter })}`} className="px-2 py-2 text-sm font-semibold text-primary-dark hover:underline">
            Clear
          </Link>
        ) : null}
      </form>

      <Tabs current={filter} items={queueFilters.map((f) => ({ key: f.key, label: f.label, href: `/ops/b2b${qs({ ...keep, filter: f.key === "action" ? undefined : f.key })}` }))} />

      {error ? (
        <div className="mb-4">
          <Notice tone="bad">The order queue could not be loaded: {error.message}</Notice>
        </div>
      ) : null}

      <Card
        title={`${queueFilters.find((f) => f.key === filter)?.label} (${rows.length}${rows.length >= 300 ? "+" : ""})`}
        description="Open a B2B order to accept it, amend it, set priority or record packing. Retail orders open in dispatch."
      >
        {rows.length ? (
          <Table head={["Order", "Channel", "Customer", "Salesperson", "Placed", "Products", "Total", "Payment", "Stock", "Delivery", "Status", "Priority / manager", "Needs approval"]} compact>
            {rows.map((o) => {
              const units = o.lines.reduce((s, l) => s + num(l.ordered), 0);
              const short = o.lines.filter((l) => num(l.reserved) + num(l.dispatched) < num(l.ordered));
              return (
                <tr key={o.id} className="hover:bg-blush/40">
                  <Td>
                    <Link href={o.is_b2b ? `/ops/b2b/orders/${o.id}` : `/ops/dispatch/${o.id}`} className="font-semibold text-primary-dark hover:underline">
                      {o.order_no}
                    </Link>
                    {o.on_hold ? (
                      <div>
                        <Badge tone="bad">on hold</Badge>
                      </div>
                    ) : null}
                    {o.invoice_number ? <div className="text-xs text-dark/55">Inv {o.invoice_number}</div> : null}
                  </Td>
                  <Td>
                    <span className="font-mono text-xs">{o.channel}</span>
                    <div className="text-xs text-dark/55">{channels[o.source]?.label ?? label(o.source)}</div>
                  </Td>
                  <Td>
                    {o.is_b2b && o.customer_id ? (
                      <Link href={`/ops/b2b/customers/${o.customer_id}`} className="hover:underline">
                        {o.customer_name}
                      </Link>
                    ) : (
                      o.customer_name
                    )}
                    <div className="text-xs text-dark/55">
                      {o.customer_code ? `${o.customer_code} · ` : ""}
                      {o.phone}
                    </div>
                  </Td>
                  <Td>
                    {o.salesperson ?? "—"}
                    {o.salesperson && !o.entered_by_salesperson ? <div className="text-xs text-dark/55">account owner</div> : null}
                  </Td>
                  <Td>{dateTime(o.created_at)}</Td>
                  <Td>
                    <div className="max-w-56 text-xs">
                      {o.lines.slice(0, 4).map((l, i) => (
                        <div key={i}>
                          {qty(l.ordered)} × {l.name} <span className="text-dark/55">{l.pack}</span>
                        </div>
                      ))}
                      {o.lines.length > 4 ? <div className="text-dark/55">+{o.lines.length - 4} more</div> : null}
                      <div className="text-dark/55">
                        {o.lines.length} line(s) · {qty(units)} units
                      </div>
                    </div>
                  </Td>
                  <Td right>{inr(o.total, 0)}</Td>
                  <Td>
                    <span className="text-xs">{paymentMethods[o.payment_method]?.split(" (")[0] ?? label(o.payment_method)}</span>
                    <div>
                      <Badge tone={o.payment_status === "paid" ? "good" : o.payment_status === "failed" ? "bad" : "muted"}>{label(o.payment_status)}</Badge>
                    </div>
                  </Td>
                  <Td>
                    {o.fully_reserved ? (
                      <Badge tone="good">fully reserved</Badge>
                    ) : o.stock_ok ? (
                      <Badge tone="info">stock ok</Badge>
                    ) : (
                      <Badge tone="bad">short</Badge>
                    )}
                    {!o.fully_reserved && short.length ? <div className="text-xs text-dark/55">{short.length} line(s) not reserved</div> : null}
                  </Td>
                  <Td>
                    {o.delivery_date ? date(o.delivery_date) : o.requested_delivery_date ? `asked ${date(o.requested_delivery_date)}` : "—"}
                    {o.delivery_date && o.requested_delivery_date && o.delivery_date !== o.requested_delivery_date ? (
                      <div className="text-xs text-dark/55">asked {date(o.requested_delivery_date)}</div>
                    ) : null}
                  </Td>
                  <Td>
                    <span className={`inline-flex rounded-full px-2 py-0.5 text-xs font-semibold ${statusTone(o.status_label)}`}>{o.status_label}</span>
                    {o.confirmation === "pending" ? <div className="text-xs text-amber-800">customer to confirm</div> : null}
                  </Td>
                  <Td>
                    <Badge tone={priorityTone[o.priority] ?? "muted"}>{o.priority}</Badge>
                    {o.ops_manager ? <div className="text-xs text-dark/55">{o.ops_manager}</div> : null}
                  </Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {(o.approval_reasons ?? []).map((r) => (
                        <Badge key={r} tone={r === "stock_shortage" ? "warn" : "bad"}>
                          {approvalReasons[r]?.split(" — ")[0] ?? label(r)}
                        </Badge>
                      ))}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        ) : (
          <Empty>No orders here{q ? ` matching “${q}”` : ""}.</Empty>
        )}
      </Card>
    </>
  );
}
