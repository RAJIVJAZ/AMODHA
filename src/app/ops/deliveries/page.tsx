import Link from "next/link";
import { FailReason } from "@/components/ops/delivery-fields";
import { Icon } from "@/components/ops/icons";
import { OpsForm } from "@/components/ops/ops-form";
import { Badge, Empty, StatusBadge } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { date, dateTime, inr, param, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Delivery run" };

type DispatchCard = {
  id: string;
  dispatch_no: string;
  status: string;
  delivery_person: string | null;
  dispatched_at: string;
  expected_at: string | null;
  delivered_at: string | null;
  remarks: string | null;
  cash_collected: number | null;
  collection_method: string | null;
  orders: {
    id: string; order_number: number; customer_name: string; phone: string; address: string; city: string; pincode: string; notes: string | null;
    total: number; payment_method: string; source: string; milk_subscriber: boolean; delivery_slot: string | null; user_id: string | null;
  } | null;
  dispatch_lines: { id: string; qty: number; qty_returned: number; items: { name: string; products: { is_subscribable: boolean } | null } | null }[];
};
type QueueRow = {
  id: string; order_number: number; customer_name: string; phone: string; pincode: string; address: string; due_date: string; delivery_slot: string | null;
  total: number; payment_method: string; milk_subscriber: boolean; on_hold: boolean; units_ordered: number; units_reserved: number; fulfilment_status: string;
};

const SELECT =
  "id, dispatch_no, status, delivery_person, dispatched_at, expected_at, delivered_at, remarks, cash_collected, collection_method, " +
  "orders(id, order_number, customer_name, phone, address, city, pincode, notes, total, payment_method, source, milk_subscriber, delivery_slot, user_id), " +
  "dispatch_lines(id, qty, qty_returned, items(name, products(is_subscribable)))";

const mapUrl = (o: NonNullable<DispatchCard["orders"]>) =>
  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${o.address}, ${o.city} ${o.pincode}`)}`;

export default async function DeliveriesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const ops = await requireOps("dispatch");
  const sp = await searchParams;
  const tab = param(sp.tab) ?? "road";
  const person = param(sp.person);
  const today = todayIST();
  const canEdit = ops.can("dispatch", "edit");

  const [{ data: roadData }, { data: doneData }, { data: queueData }] = await Promise.all([
    ops.supabase.from("dispatches").select(SELECT).in("status", ["dispatched", "out_for_delivery"]).order("dispatched_at").limit(300),
    ops.supabase
      .from("dispatches")
      .select(SELECT)
      .in("status", ["delivered", "partially_delivered", "delivery_failed", "returned"])
      .gte("dispatched_at", `${todayIST(-1)}T00:00:00+05:30`)
      .order("delivered_at", { ascending: false, nullsFirst: false })
      .limit(300),
    ops.supabase.from("v_dispatch_queue").select("*").lte("due_date", today).order("milk_subscriber", { ascending: false }).order("due_date").limit(300),
  ]);
  const road = (roadData ?? []) as unknown as DispatchCard[];
  const done = (doneData ?? []) as unknown as DispatchCard[];
  const queue = (queueData ?? []) as QueueRow[];

  // Subscription deliveries: which delivery each order is, and whether the customer uses our glass bottles.
  const subOrders = [...road, ...done].filter((d) => d.orders?.source === "subscription" && d.orders.user_id);
  const subOrderIds = subOrders.map((d) => d.orders!.id);
  const [{ data: subDeliveries }, { data: glass }] = subOrderIds.length
    ? await Promise.all([
        ops.supabase.from("subscription_deliveries").select("id, order_id").in("order_id", subOrderIds),
        ops.supabase
          .from("subscriptions")
          .select("user_id")
          .eq("bottle_arrangement", "returnable_glass")
          .neq("status", "cancelled")
          .in("user_id", [...new Set(subOrders.map((d) => d.orders!.user_id!))]),
      ])
    : [{ data: [] }, { data: [] }];
  const deliveryFor = new Map(((subDeliveries ?? []) as { id: string; order_id: string }[]).map((s) => [s.order_id, s.id]));
  const glassUsers = new Set(((glass ?? []) as { user_id: string }[]).map((g) => g.user_id));
  const { data: bottleRows } = deliveryFor.size
    ? await ops.supabase.from("bottle_ledger").select("delivery_id, issued, returned, damaged").in("delivery_id", [...deliveryFor.values()])
    : { data: [] };
  const bottlesFor = new Map<string, { issued: number; returned: number; damaged: number }>();
  for (const b of (bottleRows ?? []) as { delivery_id: string; issued: number; returned: number; damaged: number }[]) {
    const t = bottlesFor.get(b.delivery_id) ?? { issued: 0, returned: 0, damaged: 0 };
    bottlesFor.set(b.delivery_id, { issued: t.issued + b.issued, returned: t.returned + b.returned, damaged: t.damaged + b.damaged });
  }

  const people = [...new Set(road.map((d) => d.delivery_person?.trim()).filter(Boolean) as string[])].sort();
  const forPerson = (rows: DispatchCard[]) => (person ? rows.filter((d) => d.delivery_person?.trim() === person) : rows);
  const roadRows = forPerson(road).sort((a, b) => (a.orders?.pincode ?? "").localeCompare(b.orders?.pincode ?? "") || a.dispatched_at.localeCompare(b.dispatched_at));
  const doneRows = forPerson(done);
  const toCollect = roadRows.filter((d) => d.orders?.payment_method === "cod").reduce((s, d) => s + Number(d.orders?.total ?? 0), 0);
  const startOfToday = new Date(`${today}T00:00:00+05:30`).getTime();
  const collected = doneRows
    .filter((d) => d.delivered_at && new Date(d.delivered_at).getTime() >= startOfToday)
    .reduce((s, d) => s + Number(d.cash_collected ?? 0), 0);

  const href = (t: string, p = person) => `/ops/deliveries?${new URLSearchParams({ ...(t !== "road" ? { tab: t } : {}), ...(p ? { person: p } : {}) })}`;
  const tabs = [
    { key: "road", label: `On the road (${forPerson(road).length})` },
    { key: "send", label: `To send (${queue.length})` },
    { key: "done", label: `Done (${doneRows.length})` },
  ];

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Delivery run</h1>
        <p className="text-sm text-dark/60">
          {roadRows.length ? `${roadRows.length} to deliver · collect ${inr(toCollect, 0)} on delivery` : "Nothing out for delivery right now"}
          {collected ? ` · ${inr(collected, 0)} collected today` : ""}
        </p>
      </div>

      <nav className="-mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:px-0" aria-label="Deliveries">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={href(t.key)}
            aria-current={tab === t.key ? "page" : undefined}
            className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${tab === t.key ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {tab !== "send" && people.length > 1 ? (
        <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <span className="shrink-0 self-center text-xs font-semibold text-dark/55">Delivered by:</span>
          {[null, ...people].map((p) => (
            <Link
              key={p ?? "all"}
              href={href(tab, p ?? undefined)}
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${(person ?? null) === p ? "bg-primary-light text-ink" : "bg-white text-dark/70 ring-1 ring-ink/10"}`}
            >
              {p ?? "Everyone"}
            </Link>
          ))}
        </div>
      ) : null}

      {tab === "road" ? (
        roadRows.length ? (
          roadRows.map((d) => {
            const deliveryId = d.orders ? deliveryFor.get(d.orders.id) : undefined;
            return (
              <Card
                key={d.id}
                d={d}
                canEdit={canEdit}
                deliveryId={deliveryId}
                glass={Boolean(d.orders?.user_id && glassUsers.has(d.orders.user_id))}
                bottles={deliveryId ? bottlesFor.get(deliveryId) : undefined}
              />
            );
          })
        ) : (
          <Empty>
            Nothing is out for delivery. Orders are dispatched from the{" "}
            <Link href="/ops/dispatch" className="font-semibold text-primary-dark underline">
              dispatch sheet
            </Link>
            .
          </Empty>
        )
      ) : null}

      {tab === "done" ? (
        doneRows.length ? (
          doneRows.map((d) => {
            const deliveryId = d.orders ? deliveryFor.get(d.orders.id) : undefined;
            return (
              <Card
                key={d.id}
                d={d}
                canEdit={canEdit}
                deliveryId={deliveryId}
                glass={Boolean(d.orders?.user_id && glassUsers.has(d.orders.user_id))}
                bottles={deliveryId ? bottlesFor.get(deliveryId) : undefined}
              />
            );
          })
        ) : (
          <Empty>No deliveries finished today or yesterday.</Empty>
        )
      ) : null}

      {tab === "send" ? (
        queue.length ? (
          <>
            <p className="text-sm text-dark/60">Reserve stock and dispatch each order from its page; it then appears under On the road.</p>
            {queue.map((o) => (
              <Link key={o.id} href={`/ops/dispatch/${o.id}`} className="block rounded-2xl border border-ink/10 bg-white p-4 shadow-sm active:bg-blush/40">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-heading text-base font-bold text-ink">
                      #{o.order_number} · {o.customer_name}
                    </p>
                    <p className="text-sm text-dark/60">
                      {o.pincode} · due {date(o.due_date)}
                      {o.delivery_slot ? ` · ${o.delivery_slot}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={o.fulfilment_status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  {o.milk_subscriber ? <Badge tone="info">⭐ subscriber</Badge> : null}
                  {o.on_hold ? <Badge tone="bad">on hold</Badge> : null}
                  <Badge tone={Number(o.units_reserved) < Number(o.units_ordered) ? "warn" : "good"}>
                    {qty(o.units_reserved)} of {qty(o.units_ordered)} reserved
                  </Badge>
                  <span className="text-dark/60">{o.payment_method === "cod" ? `Collect ${inr(o.total, 0)}` : "Paid online"}</span>
                </div>
              </Link>
            ))}
          </>
        ) : (
          <Empty>Nothing waiting to be sent out.</Empty>
        )
      ) : null}
    </div>
  );
}

function Card({ d, canEdit, deliveryId, glass, bottles }: {
  d: DispatchCard; canEdit: boolean; deliveryId?: string; glass: boolean; bottles?: { issued: number; returned: number; damaged: number };
}) {
  const o = d.orders;
  if (!o) return null;
  const onRoad = ["dispatched", "out_for_delivery"].includes(d.status);
  const cod = o.payment_method === "cod";
  const milkBottles = d.dispatch_lines.filter((l) => l.items?.products?.is_subscribable).reduce((s, l) => s + Number(l.qty) - Number(l.qty_returned), 0);
  const chip = "flex items-center gap-1.5 rounded-full bg-[#f5f6f7] px-3 py-2 text-sm font-semibold text-ink active:bg-primary-light/50";

  return (
    <article className={`rounded-2xl border bg-white p-4 shadow-sm ${onRoad ? "border-ink/10" : "border-ink/5 opacity-90"}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-dark/55">
            <Link href={`/ops/dispatch/${o.id}`} className="text-primary-dark">
              #{o.order_number}
            </Link>
            <span>· {d.dispatch_no}</span>
            {o.milk_subscriber ? <Badge tone="info">⭐ subscriber</Badge> : null}
            {o.source === "subscription" ? <Badge tone="info">milk{o.delivery_slot ? ` · ${o.delivery_slot}` : ""}</Badge> : null}
          </p>
          <h2 className="mt-0.5 font-heading text-lg font-bold leading-snug text-ink">{o.customer_name}</h2>
          <p className="text-sm text-dark/70">
            {o.address}, {o.city} – {o.pincode}
          </p>
        </div>
        <StatusBadge status={d.status} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:+91${o.phone}`} className={chip}>
          <Icon name="phone" className="h-4 w-4" /> Call
        </a>
        <a href={`https://wa.me/91${o.phone}`} target="_blank" rel="noopener noreferrer" className={chip}>
          💬 WhatsApp
        </a>
        <a href={mapUrl(o)} target="_blank" rel="noopener noreferrer" className={chip}>
          📍 Map
        </a>
      </div>

      <ul className="mt-3 text-sm text-ink">
        {d.dispatch_lines.map((l) => (
          <li key={l.id}>
            {qty(Number(l.qty) - Number(l.qty_returned))} × {l.items?.name}
          </li>
        ))}
      </ul>
      {o.notes ? <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">Note: {o.notes}</p> : null}

      <p className={`mt-3 rounded-xl px-3 py-2 text-sm font-bold ${cod ? "bg-accent/10 text-accent-dark" : "bg-emerald-50 text-emerald-800"}`}>
        {cod ? `Collect ${inr(o.total, 0)} (pay on delivery)` : "Paid online — nothing to collect"}
      </p>

      {!onRoad ? (
        <p className="mt-2 text-xs text-dark/60">
          {d.delivered_at ? `Delivered ${dateTime(d.delivered_at)}` : `Sent ${dateTime(d.dispatched_at)}`}
          {d.cash_collected ? ` · collected ${inr(d.cash_collected, 0)} by ${d.collection_method ?? "cash"}` : ""}
          {d.remarks ? ` · ${d.remarks}` : ""}
          {d.delivery_person ? ` · ${d.delivery_person}` : ""}
        </p>
      ) : d.delivery_person ? (
        <p className="mt-2 text-xs text-dark/55">
          With {d.delivery_person} · sent {dateTime(d.dispatched_at)}
        </p>
      ) : null}

      {onRoad && canEdit ? (
        <div className="mt-3 flex flex-col gap-3 border-t border-dashed border-ink/15 pt-3">
          <OpsForm fn="disp_update_delivery" submitLabel="✓ Delivered" success="Marked delivered" large>
            <input type="hidden" name="p_dispatch_id" value={d.id} />
            <input type="hidden" name="p_status" value="delivered" />
            {cod ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-1 flex-col gap-1 text-sm font-semibold text-ink">
                  Amount collected (₹)
                  <input
                    name="p_cash_collected#num"
                    type="number"
                    inputMode="decimal"
                    step="any"
                    min="0"
                    defaultValue={o.total}
                    className="w-full rounded-lg border-2 border-ink/15 px-3 py-2.5 text-base"
                  />
                </label>
                <fieldset className="flex gap-1.5">
                  <legend className="sr-only">Paid by</legend>
                  {(["cash", "upi"] as const).map((m) => (
                    <label
                      key={m}
                      className="cursor-pointer rounded-lg px-4 py-2.5 text-sm font-bold text-ink ring-1 ring-ink/20 has-[:checked]:bg-ink has-[:checked]:text-white has-[:checked]:ring-ink"
                    >
                      <input type="radio" name="p_collection_method" value={m} defaultChecked={m === "cash"} className="sr-only" />
                      {m === "cash" ? "Cash" : "UPI"}
                    </label>
                  ))}
                </fieldset>
              </div>
            ) : null}
          </OpsForm>

          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {d.status === "dispatched" ? (
              <OpsForm fn="disp_update_delivery" submitLabel="Mark out for delivery" variant="quiet" inline success="On the way">
                <input type="hidden" name="p_dispatch_id" value={d.id} />
                <input type="hidden" name="p_status" value="out_for_delivery" />
              </OpsForm>
            ) : null}
          </div>

          <details className="rounded-xl bg-red-50/60 px-3 py-2">
            <summary className="cursor-pointer text-sm font-semibold text-accent-dark">Couldn&apos;t deliver</summary>
            <div className="mt-2">
              <OpsForm fn="disp_update_delivery" submitLabel="Bring it back — not delivered" variant="danger" success="Marked not delivered; stock is back">
                <input type="hidden" name="p_dispatch_id" value={d.id} />
                <input type="hidden" name="p_status" value="delivery_failed" />
                <input type="hidden" name="p_restock#bool" value="true" />
                <FailReason />
              </OpsForm>
            </div>
          </details>
        </div>
      ) : null}

      {bottles ? (
        <p className="mt-3 rounded-xl bg-primary-light/15 px-3 py-2 text-sm text-ink">
          Bottles recorded: {bottles.issued} given · {bottles.returned} empties back{bottles.damaged ? ` · ${bottles.damaged} broken / lost` : ""}
        </p>
      ) : canEdit && o.source === "subscription" && o.user_id ? (
        <details className="mt-3 rounded-xl bg-primary-light/15 px-3 py-2" open={onRoad && glass}>
          <summary className="cursor-pointer text-sm font-semibold text-ink">Glass bottles</summary>
          <div className="mt-2">
            <OpsForm fn="sub_record_bottles" submitLabel="Save bottles" variant="secondary" success="Bottles recorded">
              <input type="hidden" name="p_user_id" value={o.user_id} />
              {deliveryId ? <input type="hidden" name="p_delivery_id" value={deliveryId} /> : null}
              <div className="grid grid-cols-3 gap-2">
                {[
                  { name: "p_issued#int", label: "Given", value: glass ? milkBottles : 0 },
                  { name: "p_returned#int", label: "Empties back", value: 0 },
                  { name: "p_damaged#int", label: "Broken / lost", value: 0 },
                ].map((f) => (
                  <label key={f.name} className="flex flex-col gap-1 text-xs font-semibold text-ink">
                    {f.label}
                    <input name={f.name} type="number" inputMode="numeric" min="0" step="1" defaultValue={f.value} className="w-full rounded-lg border-2 border-ink/15 px-2 py-2 text-base" />
                  </label>
                ))}
              </div>
              <input type="hidden" name="p_note" value={`${d.dispatch_no} · order #${o.order_number}`} />
            </OpsForm>
          </div>
        </details>
      ) : null}
    </article>
  );
}
