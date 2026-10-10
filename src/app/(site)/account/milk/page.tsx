import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { JsonObjectFields } from "@/components/ops/json-fields";
import { LineEditor } from "@/components/ops/line-editor";
import { OpsForm } from "@/components/ops/ops-form";
import { formatInr } from "@/lib/currency";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Milk Subscription",
  robots: { index: false, follow: false },
};

type Line = { item_id: string; name: string; type: "subscription" | "extra" | "addon"; qty: number; unit_price: number };
type Delivery = { id: string; subscription_id: string; date: string; slot: string; status: string; can_change: boolean; order_id: string | null; lines: Line[]; total: number };
type Subscription = {
  id: string; status: string; item_id: string; item_name: string; unit_label: string; qty_units: number; frequency: string; slot: string; address: string; city: string;
  pincode: string; start_date: string; pause_from: string | null; pause_until: string | null; payment_preference: string; bottle_arrangement: string;
  instructions: string | null; price_today: number; price_changes: { price: number; from: string }[]; monthly_estimate: number;
};
type Overview = {
  enabled: boolean; cutoff_time: string; first_open_date: string; bottle_deposit: number; bottle_damage_charge: number; subscriptions: Subscription[];
  upcoming: Delivery[]; history: { date: string; status: string; total: number }[]; bottles_outstanding: number; balance_due: number; notices: { message: string; at: string }[];
};
type Catalogue = {
  first_open_date: string;
  milk: { item_id: string; name: string; unit_label: string; price: number }[];
  addons: { item_id: string; name: string; brand: string; category: string; price: number; in_stock: boolean }[];
};

const frequencyLabels: Record<string, string> = { daily: "Every day", alternate_days: "Alternate days", mon_to_sat: "Monday to Saturday", custom: "Chosen days" };
const statusLabels: Record<string, string> = {
  scheduled: "Scheduled",
  skipped: "Skipped",
  paused: "Paused",
  locked: "Being prepared",
  dispatched: "On the way",
  delivered: "Delivered",
  failed: "Not delivered",
  cancelled: "Cancelled",
};

function day(value: string) {
  return new Date(`${value}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", timeZone: "Asia/Kolkata" });
}

function Panel({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-5 sm:p-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const fieldClass = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

export default async function MyMilkPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account/milk");

  const [{ data: overviewData, error }, { data: catalogueData }, { data: profile }, { data: staffEdit }] = await Promise.all([
    supabase.rpc("sub_my_overview"),
    supabase.rpc("sub_catalogue"),
    supabase.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle(),
    supabase.rpc("has_permission", { p_module: "subscriptions", p_action: "edit" }),
  ]);
  const overview = overviewData as Overview | null;
  const catalogue = catalogueData as Catalogue | null;

  if (error || !overview) {
    return (
      <section className="bg-blush py-10 sm:py-14">
        <div className="container-site">
          <Panel title="Milk subscription">
            <p className="text-sm text-dark/70">Milk subscriptions are not available right now. Please try again later.</p>
          </Panel>
        </div>
      </section>
    );
  }

  const subs = overview.subscriptions;
  const canSubscribe = (overview.enabled || staffEdit === true) && (catalogue?.milk.length ?? 0) > 0;
  const addonOptions = (catalogue?.addons ?? []).map((a) => ({ value: a.item_id, label: `${a.name} — ${formatInr(a.price)}${a.in_stock ? "" : " (out of stock)"}` }));

  return (
    <section className="bg-blush py-10 sm:py-14">
      <div className="container-site flex flex-col gap-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm">
              <Link href="/account" className="font-semibold text-primary-dark hover:underline">
                ← My account
              </Link>
            </p>
            <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">My milk subscription</h1>
            <p className="text-sm text-dark/70">
              Change, skip or add to any delivery until {overview.cutoff_time} the evening before. The next delivery you can still change is on {day(overview.first_open_date)}.
            </p>
          </div>
        </div>

        {!overview.enabled && staffEdit === true ? (
          <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Staff preview: subscriptions are not open to customers yet.
          </p>
        ) : null}

        {overview.notices.length ? (
          <div className="rounded-2xl border-2 border-ink bg-[#fbeec4] p-4 text-sm text-ink">
            {overview.notices.map((n, i) => (
              <p key={i}>📣 {n.message}</p>
            ))}
          </div>
        ) : null}

        {subs.length === 0 ? (
          canSubscribe ? (
            <Panel title="Start your milk subscription">
              <OpsForm fn="sub_create" submitLabel="Start subscription" success="Subscription started" redirectTo="/account/milk">
                <JsonObjectFields
                  name="p#json"
                  fields={[
                    { key: "item_id", label: "Milk", required: true, options: catalogue!.milk.map((m) => ({ value: m.item_id, label: `${m.name} — ${formatInr(m.price)}` })) },
                    { key: "qty_units", label: "Bottles per delivery", type: "number", required: true, defaultValue: 1 },
                    { key: "frequency", label: "How often", required: true, defaultValue: "daily", options: Object.entries(frequencyLabels).filter(([k]) => k !== "custom").map(([value, label]) => ({ value, label })) },
                    { key: "slot", label: "Delivery time", required: true, defaultValue: "morning", options: [{ value: "morning", label: "Morning" }, { value: "evening", label: "Evening" }] },
                    { key: "start_date", label: "Start on", type: "date", required: true, defaultValue: overview.first_open_date },
                    { key: "customer_name", label: "Name", required: true, defaultValue: profile?.full_name ?? "" },
                    { key: "phone", label: "Mobile number", required: true, defaultValue: profile?.phone ?? "" },
                    { key: "address", label: "Delivery address", required: true, wide: true },
                    { key: "city", label: "City", defaultValue: "Prayagraj" },
                    { key: "pincode", label: "Pincode", required: true },
                    {
                      key: "payment_preference",
                      label: "Payment",
                      required: true,
                      defaultValue: "pay_on_delivery",
                      options: [
                        { value: "pay_on_delivery", label: "Pay on delivery (cash / UPI)" },
                        { value: "monthly_bill", label: "Monthly bill" },
                      ],
                    },
                    {
                      key: "bottle_arrangement",
                      label: "Bottles",
                      required: true,
                      defaultValue: "returnable_glass",
                      options: [
                        { value: "returnable_glass", label: "Returnable glass bottles" },
                        { value: "no_bottle", label: "Pour into my container" },
                      ],
                    },
                    { key: "instructions", label: "Delivery instructions", wide: true, placeholder: "Gate, floor, ring the bell…" },
                  ]}
                />
                <p className="text-xs text-dark/60">
                  {Number(overview.bottle_deposit) > 0 ? `Glass bottles carry a refundable deposit of ${formatInr(overview.bottle_deposit)} each. ` : ""}
                  {Number(overview.bottle_damage_charge) > 0 ? `A damaged or lost bottle is charged ${formatInr(overview.bottle_damage_charge)}. ` : ""}
                  You can pause, skip a day or cancel at any time before the cut-off.
                </p>
              </OpsForm>
            </Panel>
          ) : (
            <Panel title="Milk subscription">
              <p className="text-sm text-dark/70">
                Subscriptions have not opened yet.{" "}
                <Link href="/milk-subscription#register" className="font-semibold text-primary-dark hover:underline">
                  Register your interest
                </Link>{" "}
                and we&apos;ll let you know as soon as deliveries start in your area.
              </p>
            </Panel>
          )
        ) : null}

        {subs.map((s) => (
          <Panel
            key={s.id}
            title={`${s.qty_units} × ${s.item_name}`}
            action={
              <span className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold text-ink">
                {s.status === "active" ? (s.pause_from ? "Pause scheduled" : "Active") : s.status === "paused" ? "Paused" : s.status}
              </span>
            }
          >
            <dl className="grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
              <div>
                <dt className="inline text-dark/55">Schedule: </dt>
                <dd className="inline font-semibold text-ink">
                  {frequencyLabels[s.frequency] ?? s.frequency}, {s.slot}
                </dd>
              </div>
              <div>
                <dt className="inline text-dark/55">Price: </dt>
                <dd className="inline font-semibold text-ink">
                  {formatInr(s.price_today)} per bottle ({s.unit_label}) · about {formatInr(s.monthly_estimate)} a month
                </dd>
              </div>
              <div className="sm:col-span-2">
                <dt className="inline text-dark/55">Address: </dt>
                <dd className="inline font-semibold text-ink">
                  {s.address}, {s.city} {s.pincode}
                </dd>
              </div>
              {s.pause_from ? (
                <div className="sm:col-span-2">
                  <dt className="inline text-dark/55">Paused: </dt>
                  <dd className="inline font-semibold text-ink">
                    from {day(s.pause_from)}
                    {s.pause_until ? ` until ${day(s.pause_until)}` : " until you resume"}
                  </dd>
                </div>
              ) : null}
              {s.price_changes.map((p) => (
                <div key={p.from} className="sm:col-span-2 text-accent-dark">
                  Price changes to {formatInr(p.price)} from {day(p.from)}.
                </div>
              ))}
            </dl>

            <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
              <OpsForm fn="sub_change_quantity" submitLabel="Change quantity" variant="secondary" inline success="Quantity updated from the next open day" resetOnSuccess={false}>
                <input type="hidden" name="p_subscription_id" value={s.id} />
                <label className="flex flex-col gap-1 text-sm">
                  <span className="font-semibold text-ink">Bottles per delivery</span>
                  <input name="p_qty_units#int" type="number" min={1} max={20} required defaultValue={s.qty_units} className={`${fieldClass} w-28`} />
                </label>
              </OpsForm>
              {s.pause_from || s.status === "paused" ? (
                <OpsForm fn="sub_resume" submitLabel="Resume deliveries" inline success="Deliveries resumed">
                  <input type="hidden" name="p_subscription_id" value={s.id} />
                </OpsForm>
              ) : (
                <OpsForm fn="sub_pause" submitLabel="Pause" variant="secondary" inline success="Pause saved">
                  <input type="hidden" name="p_subscription_id" value={s.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-ink">From</span>
                    <input name="p_from#date" type="date" required min={overview.first_open_date} defaultValue={overview.first_open_date} className={fieldClass} />
                  </label>
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-ink">Until (optional)</span>
                    <input name="p_until#date" type="date" min={overview.first_open_date} className={fieldClass} />
                  </label>
                </OpsForm>
              )}
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Change address or cancel</summary>
              <div className="mt-3 flex flex-col gap-5">
                <OpsForm fn="sub_change_address" submitLabel="Save address" variant="secondary" success="Address updated from the next open day" resetOnSuccess={false}>
                  <input type="hidden" name="p_subscription_id" value={s.id} />
                  <JsonObjectFields
                    name="p#json"
                    fields={[
                      { key: "address", label: "Address", required: true, wide: true, defaultValue: s.address },
                      { key: "city", label: "City", defaultValue: s.city },
                      { key: "pincode", label: "Pincode", required: true, defaultValue: s.pincode },
                      { key: "slot", label: "Delivery time", defaultValue: s.slot, options: [{ value: "morning", label: "Morning" }, { value: "evening", label: "Evening" }] },
                      { key: "instructions", label: "Instructions", wide: true, defaultValue: s.instructions ?? "" },
                    ]}
                  />
                </OpsForm>
                <OpsForm fn="sub_cancel" submitLabel="Cancel subscription" variant="danger" confirm="Cancel your milk subscription? Deliveries already being prepared will still arrive." success="Subscription cancelled">
                  <input type="hidden" name="p_subscription_id" value={s.id} />
                  <label className="flex flex-col gap-1 text-sm">
                    <span className="font-semibold text-ink">Why are you leaving? (optional)</span>
                    <input name="p_reason" className={fieldClass} />
                  </label>
                </OpsForm>
              </div>
            </details>
          </Panel>
        ))}

        {subs.length ? (
          <Panel title="Next 14 days">
            {overview.upcoming.length ? (
              <ul className="flex flex-col divide-y-2 divide-ink/10">
                {overview.upcoming.map((d) => {
                  const extra = d.lines.find((l) => l.type === "extra")?.qty ?? 0;
                  const addons = d.lines.filter((l) => l.type === "addon");
                  return (
                    <li key={d.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <p className="font-semibold text-ink">
                          {day(d.date)} <span className="font-normal text-dark/60">· {d.slot}</span>
                        </p>
                        <p className="text-sm">
                          <span className={d.status === "skipped" || d.status === "paused" ? "text-dark/50" : "font-semibold text-ink"}>{statusLabels[d.status] ?? d.status}</span>
                          {d.total > 0 && !["skipped", "paused", "cancelled"].includes(d.status) ? ` · ${formatInr(d.total)}` : ""}
                        </p>
                      </div>
                      {!["skipped", "paused", "cancelled"].includes(d.status) ? (
                        <p className="text-sm text-dark/70">
                          {d.lines.map((l) => `${l.qty} × ${l.name}${l.type === "extra" ? " (extra)" : ""}`).join(", ")}
                        </p>
                      ) : null}
                      {d.can_change ? (
                        <div className="flex flex-col gap-3 rounded-xl bg-blush/60 p-3">
                          <div className="flex flex-wrap items-end gap-4">
                            {d.status === "scheduled" ? (
                              <OpsForm fn="sub_skip" submitLabel="Skip this day" variant="secondary" inline success="Skipped">
                                <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                <input type="hidden" name="p_date#date" value={d.date} />
                              </OpsForm>
                            ) : (
                              <OpsForm fn="sub_unskip" submitLabel="Deliver this day after all" variant="secondary" inline success="Back on">
                                <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                <input type="hidden" name="p_date#date" value={d.date} />
                              </OpsForm>
                            )}
                            {d.status === "scheduled" ? (
                              <OpsForm fn="sub_set_extra" submitLabel="Save extra" variant="secondary" inline success="Saved" resetOnSuccess={false}>
                                <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                <input type="hidden" name="p_date#date" value={d.date} />
                                <label className="flex flex-col gap-1 text-sm">
                                  <span className="font-semibold text-ink">Extra bottles</span>
                                  <input name="p_extra_units#int" type="number" min={0} max={20} defaultValue={extra} className={`${fieldClass} w-24`} />
                                </label>
                              </OpsForm>
                            ) : null}
                          </div>
                          {d.status === "scheduled" && addonOptions.length ? (
                            <details>
                              <summary className="cursor-pointer text-sm font-semibold text-primary-dark">
                                Add products to this delivery{addons.length ? ` (${addons.length} added)` : ""}
                              </summary>
                              <div className="mt-2">
                                <OpsForm fn="sub_set_addons" submitLabel="Save products" variant="secondary" success="Products saved" resetOnSuccess={false}>
                                  <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                  <input type="hidden" name="p_date#date" value={d.date} />
                                  <LineEditor
                                    name="p_items#json"
                                    addLabel="Add another product"
                                    initial={addons.map((a) => ({ item_id: a.item_id, qty: String(a.qty) }))}
                                    columns={[
                                      { key: "item_id", label: "Product", type: "select", required: true, options: addonOptions },
                                      { key: "qty", label: "Qty", type: "number", width: "6rem" },
                                    ]}
                                  />
                                </OpsForm>
                              </div>
                            </details>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-sm text-dark/60">No deliveries scheduled in the next two weeks.</p>
            )}
          </Panel>
        ) : null}

        {subs.length ? (
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Bottles & balance">
              <dl className="grid grid-cols-[1fr_auto] gap-y-2 text-sm">
                <dt className="text-dark/65">Glass bottles with you</dt>
                <dd className="font-semibold text-ink">{overview.bottles_outstanding}</dd>
                <dt className="text-dark/65">Amount due on your account</dt>
                <dd className="font-semibold text-ink">{formatInr(Math.max(Number(overview.balance_due), 0))}</dd>
              </dl>
              <p className="mt-3 text-xs text-dark/55">Please rinse and return empty bottles to the delivery person.</p>
            </Panel>
            <Panel title="Recent deliveries">
              {overview.history.length ? (
                <ul className="flex flex-col gap-1 text-sm">
                  {overview.history.slice(0, 10).map((h) => (
                    <li key={h.date} className="flex justify-between gap-3">
                      <span>{day(h.date)}</span>
                      <span className="text-dark/70">
                        {statusLabels[h.status] ?? h.status}
                        {h.total > 0 && h.status === "delivered" ? ` · ${formatInr(h.total)}` : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-dark/60">No deliveries yet.</p>
              )}
            </Panel>
          </div>
        ) : null}
      </div>
    </section>
  );
}
