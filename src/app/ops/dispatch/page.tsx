import Link from "next/link";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, ButtonLink, Card, Empty, NumberInput, PageHeader, Select, StatusBadge, Table, Tabs, Td } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, param, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Orders & dispatch" };

type QueueRow = {
  id: string; order_number: number; created_at: string; source: string; customer_name: string; phone: string; address: string; city: string; pincode: string;
  notes: string | null; total: number; payment_method: string; payment_status: string; fulfilment_status: string; on_hold: boolean; hold_reason: string | null;
  milk_subscriber: boolean; delivery_date: string | null; delivery_slot: string | null; due_date: string; units_ordered: number; units_reserved: number; units_dispatched: number;
};
type DispatchRow = { id: string; dispatch_no: string; status: string; delivery_person: string | null; dispatched_at: string; expected_at: string | null; delivered_at: string | null;
  remarks: string | null; cash_collected: number | null; orders: { id: string; order_number: number; customer_name: string; address: string; pincode: string; phone: string; total: number; payment_method: string } | null };

export default async function DispatchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("dispatch");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "queue";
  const day = param(sp.date) ?? todayIST();

  const [{ data: queue }, { data: dispatches }] = await Promise.all([
    ops.supabase.from("v_dispatch_queue").select("*").lte("due_date", day).order("milk_subscriber", { ascending: false }).order("due_date").order("order_number").limit(300),
    ops.supabase
      .from("dispatches")
      .select("id, dispatch_no, status, delivery_person, dispatched_at, expected_at, delivered_at, remarks, cash_collected, orders(id, order_number, customer_name, address, pincode, phone, total, payment_method)")
      .gte("dispatched_at", `${day}T00:00:00+05:30`)
      .lte("dispatched_at", `${day}T23:59:59+05:30`)
      .order("dispatched_at"),
  ]);
  const rows = (queue ?? []) as QueueRow[];
  const sent = (dispatches ?? []) as unknown as DispatchRow[];
  const open = sent.filter((d) => ["dispatched", "out_for_delivery"].includes(d.status));

  return (
    <>
      <PageHeader
        title="Orders & dispatch"
        description={`Daily dispatch sheet for ${date(day)}. Milk-subscriber orders come first.`}
        actions={
          <>
            <form className="flex items-center gap-2">
              <input type="hidden" name="tab" value={tab} />
              <input type="date" name="date" defaultValue={day} aria-label="Date" className="rounded-lg border-2 border-ink/15 px-2 py-1.5 text-sm" />
              <button className="rounded-lg bg-white px-3 py-1.5 text-sm font-semibold ring-1 ring-ink/15">Go</button>
            </form>
            {ops.can("dispatch", "export") ? (
              <a href={`/ops/export/dispatch-sheet?date=${day}`} className="rounded-lg border-2 border-ink/20 bg-white px-3 py-1.5 text-sm font-semibold text-ink">
                Export sheet
              </a>
            ) : null}
            {ops.can("dispatch", "create") ? <ButtonLink href="/ops/dispatch/new">+ Phone / walk-in order</ButtonLink> : null}
          </>
        }
      />
      <Tabs
        current={tab}
        items={[
          { key: "queue", label: `To dispatch (${rows.length})`, href: `/ops/dispatch?date=${day}` },
          { key: "out", label: `Out for delivery (${open.length})`, href: `/ops/dispatch?tab=out&date=${day}` },
          { key: "all", label: `Dispatched on ${date(day)} (${sent.length})`, href: `/ops/dispatch?tab=all&date=${day}` },
        ]}
      />

      {tab === "queue" ? (
        <Card>
          {rows.length ? (
            <Table head={["Order", "Due", "Customer", "Area", "Units", "Reserved", "Sent", "Payment", "Status"]}>
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-blush/40">
                  <Td>
                    <Link href={`/ops/dispatch/${o.id}`} className="font-semibold text-primary-dark hover:underline">
                      #{o.order_number}
                    </Link>
                    <div className="flex flex-wrap gap-1">
                      {o.milk_subscriber ? <Badge tone="info">⭐ subscriber</Badge> : null}
                      {o.source !== "website" ? <Badge>{o.source}</Badge> : null}
                      {o.on_hold ? <Badge tone="bad">on hold</Badge> : null}
                    </div>
                  </Td>
                  <Td>
                    {date(o.due_date)}
                    {o.delivery_slot ? ` · ${o.delivery_slot}` : ""}
                  </Td>
                  <Td>
                    {o.customer_name}
                    <div className="text-xs text-dark/55">{o.phone}</div>
                  </Td>
                  <Td>
                    {o.pincode}
                    <div className="max-w-48 truncate text-xs text-dark/55" title={o.address}>
                      {o.address}
                    </div>
                  </Td>
                  <Td right>{Number(o.units_ordered)}</Td>
                  <Td right className={Number(o.units_reserved) + Number(o.units_dispatched) < Number(o.units_ordered) ? "font-semibold text-accent-dark" : ""}>
                    {Number(o.units_reserved)}
                  </Td>
                  <Td right>{Number(o.units_dispatched)}</Td>
                  <Td>
                    {o.payment_method === "cod" ? "Collect " + inr(o.total, 0) : "Paid online"}
                  </Td>
                  <Td>
                    <StatusBadge status={o.fulfilment_status} />
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>Nothing waiting to be dispatched.</Empty>
          )}
        </Card>
      ) : (
        <Card>
          {(tab === "out" ? open : sent).length ? (
            <Table head={["Dispatch", "Order", "Customer", "Delivery person", "Sent", "Status", ""]}>
              {(tab === "out" ? open : sent).map((d) => (
                <tr key={d.id}>
                  <Td>{d.dispatch_no}</Td>
                  <Td>
                    {d.orders ? (
                      <Link href={`/ops/dispatch/${d.orders.id}`} className="font-semibold text-primary-dark hover:underline">
                        #{d.orders.order_number}
                      </Link>
                    ) : null}
                  </Td>
                  <Td>
                    {d.orders?.customer_name} · {d.orders?.pincode}
                    <div className="text-xs text-dark/55">{d.orders?.phone}</div>
                  </Td>
                  <Td>{d.delivery_person}</Td>
                  <Td>
                    {dateTime(d.dispatched_at)}
                    {d.expected_at ? <div className="text-xs text-dark/55">due {dateTime(d.expected_at)}</div> : null}
                  </Td>
                  <Td>
                    <StatusBadge status={d.status} />
                    {d.cash_collected ? <div className="text-xs">collected {inr(d.cash_collected, 0)}</div> : null}
                  </Td>
                  <Td>
                    {["dispatched", "out_for_delivery"].includes(d.status) && ops.can("dispatch", "edit") ? (
                      <OpsForm fn="disp_update_delivery" submitLabel="Delivered" variant="secondary" inline success="Marked delivered">
                        <input type="hidden" name="p_dispatch_id" value={d.id} />
                        <input type="hidden" name="p_status" value="delivered" />
                        {d.orders?.payment_method === "cod" ? (
                          <>
                            <NumberInput label="Collected ₹" name="p_cash_collected#num" defaultValue={d.orders.total} className="w-28" />
                            <Select label="Collected by" name="p_collection_method" options={[{ value: "cash", label: "Cash" }, { value: "upi", label: "UPI" }, { value: "card", label: "Card" }]} />
                          </>
                        ) : null}
                      </OpsForm>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </Table>
          ) : (
            <Empty>No dispatches.</Empty>
          )}
        </Card>
      )}
    </>
  );
}
