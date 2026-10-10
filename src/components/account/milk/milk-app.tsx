import Link from "next/link";
import type { ReactNode } from "react";
import { AddonPicker, PrintButton, QtyStepper, ScheduleFields, SubscribeFields } from "./milk-fields";
import { weekdays } from "./schedule";
import { JsonObjectFields } from "@/components/ops/json-fields";
import { OpsForm } from "@/components/ops/ops-form";
import { milkSubscriberBenefits } from "@/data/milk-subscription";
import { formatInr } from "@/lib/currency";

export type Line = { item_id: string; name: string; type: "subscription" | "extra" | "addon"; qty: number; unit_price: number };
export type Delivery = { id: string; subscription_id: string; date: string; slot: string; status: string; can_change: boolean; order_id: string | null; lines: Line[]; total: number };
export type Subscription = {
  id: string; status: string; item_id: string; item_name: string; unit_label: string; qty_units: number; frequency: string; days_of_week: number[] | null;
  slot: string; address: string; city: string; pincode: string; start_date: string; pause_from: string | null; pause_until: string | null;
  payment_preference: string; bottle_arrangement: string; instructions: string | null; price_today: number; price_changes: { price: number; from: string }[];
  monthly_estimate: number;
};
export type Overview = {
  enabled: boolean; cutoff_time: string; first_open_date: string; bottle_deposit: number; bottle_damage_charge: number; subscriptions: Subscription[];
  upcoming: Delivery[]; history: { date: string; status: string; total: number }[]; bottles_outstanding: number; balance_due: number; notices: { message: string; at: string }[];
};
export type Catalogue = {
  first_open_date: string;
  milk: { item_id: string; name: string; unit_label: string; price: number }[];
  addons: { item_id: string; name: string; brand: string; category: string; price: number; in_stock: boolean }[];
};
export type Statement = {
  month: string; months: string[];
  days: { date: string; slot: string; status: string; order_id: string | null; invoice_number: string | null; lines: { name: string; type: string; qty: number; unit_price: number }[]; total: number }[];
  delivered_value: number; milk_units_delivered: number; billed: number; paid_or_credited: number; balance_due: number;
};

const statusText: Record<string, string> = {
  scheduled: "Scheduled",
  skipped: "Skipped",
  paused: "Paused",
  locked: "Being prepared",
  dispatched: "On the way",
  delivered: "Delivered",
  failed: "Not delivered",
  cancelled: "No delivery",
};
const statusStyle: Record<string, string> = {
  scheduled: "bg-white text-ink border-ink",
  skipped: "bg-ink/5 text-dark/50 border-ink/20 line-through",
  paused: "bg-ink/5 text-dark/50 border-ink/20",
  locked: "bg-[#fbeec4] text-ink border-ink",
  dispatched: "bg-sky-100 text-sky-900 border-sky-700",
  delivered: "bg-emerald-100 text-emerald-900 border-emerald-700",
  failed: "bg-red-100 text-red-900 border-red-700",
  cancelled: "bg-transparent text-dark/30 border-ink/10",
};

const IST = "Asia/Kolkata";
const asDate = (iso: string) => new Date(`${iso}T00:00:00+05:30`);
const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const fmt = (iso: string, opts: Intl.DateTimeFormatOptions) => asDate(iso).toLocaleDateString("en-IN", { ...opts, timeZone: IST });
const longDay = (iso: string) => fmt(iso, { weekday: "long", day: "numeric", month: "short" });
const shortDay = (iso: string) => fmt(iso, { weekday: "short", day: "numeric", month: "short" });

function dayName(iso: string, today: string) {
  if (iso === today) return "Today";
  if (iso === addDays(today, 1)) return "Tomorrow";
  return fmt(iso, { weekday: "long" });
}

function scheduleText(s: Pick<Subscription, "frequency" | "days_of_week" | "slot">) {
  const how =
    s.frequency === "daily" ? "Every day"
    : s.frequency === "alternate_days" ? "Alternate days"
    : s.frequency === "mon_to_sat" ? "Monday to Saturday"
    : weekdays.filter((d) => (s.days_of_week ?? []).includes(d.value)).map((d) => d.short).join(", ");
  return `${how} · ${s.slot}`;
}

/** "1.000 l" → "1 L", "0.500 l" → "500 ml". */
function packSize(label: string | null | undefined) {
  const m = /^([\d.]+)\s*(\w+)$/.exec((label ?? "").trim());
  if (!m) return label ?? "";
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  if (unit === "l") return n < 1 ? `${Math.round(n * 1000)} ml` : `${Number(n.toFixed(2))} L`;
  if (unit === "kg") return n < 1 ? `${Math.round(n * 1000)} g` : `${Number(n.toFixed(2))} kg`;
  return `${Number(n.toFixed(2))} ${unit}`;
}

const milkUnits = (d: Delivery) => d.lines.filter((l) => l.type !== "addon").reduce((n, l) => n + Number(l.qty), 0);

function Panel({ title, children, action, tone = "white" }: { title?: string; children: ReactNode; action?: ReactNode; tone?: "white" | "cream" }) {
  return (
    <section className={`sticker-shadow rounded-2xl border-2 border-ink p-4 sm:p-6 ${tone === "cream" ? "bg-[#fbeec4]" : "bg-white"}`}>
      {title ? (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

function Pill({ status }: { status: string }) {
  return <span className={`inline-block rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${statusStyle[status] ?? statusStyle.scheduled}`}>{statusText[status] ?? status}</span>;
}

function Tile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border-2 border-ink/15 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">{label}</p>
      <p className="font-heading text-xl font-bold text-ink">{value}</p>
      {hint ? <p className="text-xs text-dark/55">{hint}</p> : null}
    </div>
  );
}

export type MilkAppProps = {
  overview: Overview | null;
  catalogue: Catalogue | null;
  statement: Statement | null;
  statementFailed: boolean;
  profile: { full_name: string | null; phone: string | null } | null;
  staffPreview: boolean;
  tab: string;
  day?: string;
  today: string;
};

/** The milk subscriber app: deliveries, bills and plan. Data comes from the page; every change goes through the database functions. */
export function MilkApp({ overview, catalogue, statement, statementFailed, profile, staffPreview, tab, day, today }: MilkAppProps) {
  const error = !overview;
  if (error || !overview) {
    return (
      <section className="bg-blush py-10 sm:py-14">
        <div className="container-site">
          <Panel title="My milk">
            <p className="text-sm text-dark/70">Milk subscriptions are not available right now. Please try again later.</p>
          </Panel>
        </div>
      </section>
    );
  }

  const subs = overview.subscriptions;
  const main = subs[0];
  const canSubscribe = (overview.enabled || staffPreview) && (catalogue?.milk.length ?? 0) > 0;
  const hasAddons = (catalogue?.addons.length ?? 0) > 0;
  const byDate = new Map<string, Delivery[]>();
  for (const d of overview.upcoming) byDate.set(d.date, [...(byDate.get(d.date) ?? []), d]);
  const requested = day;
  const firstChangeable = overview.upcoming.find((d) => d.can_change && ["scheduled", "skipped"].includes(d.status));
  const selected = requested && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : (firstChangeable ?? overview.upcoming[0])?.date ?? overview.first_open_date;
  const selectedDeliveries = byDate.get(selected) ?? [];
  const subById = new Map(subs.map((s) => [s.id, s]));
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i));
  const tabs = [
    { key: "deliveries", label: "Deliveries", href: "/account/milk" },
    { key: "bills", label: "Bills", href: "/account/milk?tab=bills" },
    { key: "plan", label: "My plan", href: "/account/milk?tab=plan" },
  ];

  return (
    <section className="bg-blush py-6 sm:py-12">
      <div className="container-site flex max-w-3xl flex-col gap-5">
        <div className="flex flex-col gap-1 print:hidden">
          <Link href="/account" className="text-sm font-semibold text-primary-dark hover:underline">
            ← My account
          </Link>
          <h1 className="font-heading text-3xl font-bold text-ink">My milk 🥛</h1>
          {main ? (
            <p className="text-sm text-dark/70">
              {main.qty_units} × {main.item_name} · {scheduleText(main)}
              {main.pause_from ? ` · paused from ${shortDay(main.pause_from)}` : ""}
            </p>
          ) : null}
        </div>

        {!overview.enabled && staffPreview ? (
          <p className="rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900 print:hidden">
            Staff preview: subscriptions are not open to customers yet.
          </p>
        ) : null}

        {overview.notices.length ? (
          <div className="rounded-2xl border-2 border-ink bg-[#fbeec4] p-4 text-sm text-ink print:hidden">
            {overview.notices.map((n, i) => (
              <p key={i}>📣 {n.message}</p>
            ))}
          </div>
        ) : null}

        {subs.length === 0 ? (
          canSubscribe ? (
            <Panel title="Start your milk subscription">
              <p className="mb-4 text-sm text-dark/70">
                Fresh milk from local farmers, delivered every morning or evening. Skip a day, add extra or pause any time until {overview.cutoff_time} the
                evening before.
              </p>
              <OpsForm fn="sub_create" submitLabel="Start my subscription" success="Subscription started" redirectTo="/account/milk">
                <SubscribeFields milk={catalogue!.milk} firstOpenDate={overview.first_open_date} name={profile?.full_name ?? ""} phone={profile?.phone ?? ""} />
                <p className="text-xs text-dark/60">
                  {Number(overview.bottle_deposit) > 0 ? `Glass bottles carry a refundable deposit of ${formatInr(overview.bottle_deposit)} each. ` : ""}
                  {Number(overview.bottle_damage_charge) > 0 ? `A damaged or lost bottle is charged ${formatInr(overview.bottle_damage_charge)}. ` : ""}
                  Nothing is charged now: you pay for what is delivered.
                </p>
              </OpsForm>
            </Panel>
          ) : (
            <Panel title="Milk subscription">
              {staffPreview && !catalogue?.milk.length ? (
                <p className="mb-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                  Staff: customers can&apos;t subscribe because no milk pack size has a price. In{" "}
                  <Link href="/ops/subscriptions" className="font-semibold underline">
                    Ops → Milk subscriptions
                  </Link>{" "}
                  follow the setup note.
                </p>
              ) : null}
              {overview.enabled ? (
                <p className="text-sm text-dark/70">
                  Milk subscriptions are opening very soon. Meanwhile you can{" "}
                  <Link href="/dairy-products/milk" className="font-semibold text-primary-dark hover:underline">
                    order single bottles in our shop
                  </Link>
                  .
                </p>
              ) : (
                <p className="text-sm text-dark/70">
                  Subscriptions have not opened yet.{" "}
                  <Link href="/milk-subscription#register" className="font-semibold text-primary-dark hover:underline">
                    Register your interest
                  </Link>{" "}
                  and we&apos;ll let you know as soon as deliveries start in your area.
                </p>
              )}
            </Panel>
          )
        ) : (
          <>
            <nav aria-label="My milk" className="sticky top-[76px] z-10 -mx-1 flex gap-1 rounded-full border-2 border-ink bg-white p-1 print:hidden sm:top-[84px]">
              {tabs.map((t) => (
                <Link
                  key={t.key}
                  href={t.href}
                  aria-current={tab === t.key ? "page" : undefined}
                  className={`font-heading flex-1 rounded-full px-3 py-2 text-center text-sm font-bold ${tab === t.key ? "bg-ink text-white" : "text-ink hover:bg-blush"}`}
                >
                  {t.label}
                </Link>
              ))}
            </nav>

            {tab === "deliveries" ? (
              <>
                <Panel tone="cream">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide text-dark/60">{dayName(selected, today)}</p>
                      <h2 className="font-heading text-2xl font-bold text-ink">{longDay(selected)}</h2>
                    </div>
                    {selectedDeliveries[0] ? <Pill status={selectedDeliveries[0].status} /> : null}
                  </div>

                  {selectedDeliveries.length === 0 ? (
                    <p className="mt-3 text-sm text-dark/70">No delivery on this day with your current plan.</p>
                  ) : (
                    selectedDeliveries.map((d) => {
                      const s = subById.get(d.subscription_id);
                      const extra = d.lines.find((l) => l.type === "extra")?.qty ?? 0;
                      const addons = d.lines.filter((l) => l.type === "addon");
                      const active = !["skipped", "paused", "cancelled"].includes(d.status);
                      return (
                        <div key={d.id} className="mt-3 flex flex-col gap-4">
                          {active ? (
                            <ul className="divide-y-2 divide-ink/10 rounded-xl border-2 border-ink/15 bg-white">
                              {d.lines.map((l) => (
                                <li key={`${l.type}-${l.item_id}`} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                                  <span className="text-ink">
                                    <span className="font-bold">{l.qty} ×</span> {l.name}
                                    {l.type === "extra" ? <span className="ml-1 rounded bg-primary-light/50 px-1.5 text-xs font-semibold">extra</span> : null}
                                    {l.type === "addon" ? <span className="ml-1 rounded bg-accent/15 px-1.5 text-xs font-semibold">add-on</span> : null}
                                  </span>
                                  <span className="text-dark/70">{formatInr(Number(l.qty) * Number(l.unit_price))}</span>
                                </li>
                              ))}
                              <li className="flex items-center justify-between px-3 py-2 text-sm font-bold text-ink">
                                <span>
                                  Total · {d.slot}
                                </span>
                                <span>{formatInr(d.total)}</span>
                              </li>
                            </ul>
                          ) : (
                            <p className="text-sm text-dark/70">
                              {d.status === "skipped" ? "You've skipped this day." : d.status === "paused" ? "Your deliveries are paused on this day." : "No delivery on this day."}
                            </p>
                          )}

                          {d.can_change && d.status === "scheduled" ? (
                            <>
                              <div className="flex flex-wrap items-end gap-3">
                                <OpsForm fn="sub_set_extra" submitLabel="Save" variant="secondary" inline success="Saved" resetOnSuccess={false}>
                                  <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                  <input type="hidden" name="p_date#date" value={d.date} />
                                  <div className="flex flex-col gap-1">
                                    <span className="text-sm font-semibold text-ink">Extra bottles</span>
                                    <QtyStepper name="p_extra_units#int" initial={Number(extra)} min={0} max={20} />
                                  </div>
                                </OpsForm>
                                <OpsForm fn="sub_skip" submitLabel="Skip this day" variant="secondary" inline success="Skipped">
                                  <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                  <input type="hidden" name="p_date#date" value={d.date} />
                                </OpsForm>
                              </div>
                              {hasAddons ? (
                                <details className="rounded-xl border-2 border-ink/15 bg-white p-3" open={addons.length > 0}>
                                  <summary className="cursor-pointer text-sm font-bold text-ink">
                                    🧺 Add paneer, curd, butter… to this delivery{addons.length ? ` (${addons.length} added)` : ""}
                                  </summary>
                                  <div className="mt-3">
                                    <OpsForm fn="sub_set_addons" submitLabel="Save products" variant="secondary" success="Products saved" resetOnSuccess={false}>
                                      <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                                      <input type="hidden" name="p_date#date" value={d.date} />
                                      <AddonPicker addons={catalogue?.addons ?? []} current={Object.fromEntries(addons.map((a) => [a.item_id, Number(a.qty)]))} />
                                    </OpsForm>
                                  </div>
                                </details>
                              ) : null}
                            </>
                          ) : null}
                          {d.can_change && d.status === "skipped" ? (
                            <OpsForm fn="sub_unskip" submitLabel="Deliver this day after all" inline success="Back on">
                              <input type="hidden" name="p_subscription_id" value={d.subscription_id} />
                              <input type="hidden" name="p_date#date" value={d.date} />
                            </OpsForm>
                          ) : null}
                          {d.can_change && d.status === "paused" ? (
                            <Link href="/account/milk?tab=plan#pause" className="text-sm font-semibold text-primary-dark hover:underline">
                              Change your pause →
                            </Link>
                          ) : null}
                          {!d.can_change && ["scheduled", "locked"].includes(d.status) ? (
                            <p className="text-xs text-dark/60">
                              Changes for this day closed at {overview.cutoff_time} the evening before. Need something? Call or WhatsApp us.
                            </p>
                          ) : null}
                          {d.can_change ? (
                            <p className="text-xs text-dark/60">
                              You can change this until {overview.cutoff_time} on {shortDay(addDays(d.date, -1))}.
                              {s && s.price_today ? ` ${formatInr(s.price_today)} per bottle.` : ""}
                            </p>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </Panel>

                <Panel title="Next two weeks">
                  <div className="grid grid-cols-7 gap-1.5">
                    {days.map((iso) => {
                      const ds = byDate.get(iso) ?? [];
                      const status = ds[0]?.status ?? "cancelled";
                      const units = ds.filter((d) => !["skipped", "paused", "cancelled"].includes(d.status)).reduce((n, d) => n + milkUnits(d), 0);
                      const hasAddon = ds.some((d) => d.lines.some((l) => l.type === "addon"));
                      const isSel = iso === selected;
                      return (
                        <Link
                          key={iso}
                          href={`/account/milk?day=${iso}`}
                          aria-label={`${longDay(iso)}: ${statusText[status] ?? status}${units ? `, ${units} bottles` : ""}`}
                          className={`flex flex-col items-center rounded-xl border-2 px-0.5 py-1.5 text-center ${statusStyle[status] ?? statusStyle.scheduled} ${isSel ? "ring-2 ring-accent ring-offset-2" : ""}`}
                        >
                          <span className="text-[10px] font-bold uppercase">{fmt(iso, { weekday: "short" })}</span>
                          <span className="font-heading text-base font-bold leading-tight">{fmt(iso, { day: "numeric" })}</span>
                          <span className="text-[10px] font-semibold leading-tight">
                            {status === "delivered" ? "✓" : status === "skipped" ? "skip" : status === "paused" ? "pause" : units ? `${units}🥛${hasAddon ? "+" : ""}` : "—"}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                  <p className="mt-3 text-xs text-dark/60">Tap a day to skip it, add extra milk or add products. 🥛 = bottles, + = products added.</p>
                </Panel>

                {overview.history.length ? (
                  <Panel title="Recent deliveries">
                    <ul className="flex flex-col divide-y-2 divide-ink/10 text-sm">
                      {overview.history.slice(0, 7).map((h) => (
                        <li key={h.date} className="flex items-center justify-between gap-3 py-2">
                          <span className="text-ink">{shortDay(h.date)}</span>
                          <span className="flex items-center gap-2">
                            {h.status === "delivered" && Number(h.total) > 0 ? <span className="text-dark/70">{formatInr(h.total)}</span> : null}
                            <Pill status={h.status} />
                          </span>
                        </li>
                      ))}
                    </ul>
                    <Link href="/account/milk?tab=bills" className="mt-2 inline-block text-sm font-semibold text-primary-dark hover:underline">
                      See this month&apos;s bill →
                    </Link>
                  </Panel>
                ) : null}
              </>
            ) : null}

            {tab === "bills" ? <Bills statement={statement} failed={statementFailed} main={main} /> : null}

            {tab === "plan"
              ? subs.map((s) => <Plan key={s.id} s={s} overview={overview} />)
              : null}
          </>
        )}
      </div>
    </section>
  );
}

function Bills({ statement, failed, main }: { statement: Statement | null; failed: boolean; main?: Subscription }) {
  if (failed || !statement) {
    return (
      <Panel title="Bills">
        <p className="text-sm text-dark/70">Your bill could not be loaded right now. Please try again later.</p>
      </Panel>
    );
  }
  const monthLabel = (iso: string) => fmt(iso, { month: "long", year: "numeric" });
  const shown = statement.days.filter((d) => d.status !== "cancelled");
  const due = Math.max(Number(statement.balance_due), 0);
  return (
    <>
      <div className="flex flex-wrap gap-2 print:hidden">
        {statement.months.map((m) => (
          <Link
            key={m}
            href={`/account/milk?tab=bills&month=${m.slice(0, 7)}`}
            className={`rounded-full border-2 px-3 py-1 text-sm font-semibold ${m === statement.month ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink"}`}
          >
            {fmt(m, { month: "short", year: "numeric" })}
          </Link>
        ))}
      </div>
      <Panel title={`Milk bill · ${monthLabel(statement.month)}`} action={<PrintButton />}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Tile label="Milk delivered" value={`${Number(statement.milk_units_delivered)} bottles`} hint={main ? packSize(main.unit_label) : undefined} />
          <Tile label="Delivered value" value={formatInr(statement.delivered_value)} />
          <Tile label="Billed" value={formatInr(statement.billed)} hint="Tax invoices for the month" />
          <Tile label="Paid this month" value={formatInr(statement.paid_or_credited)} hint="Payments and credits" />
        </div>
        <div className={`mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border-2 px-4 py-3 ${due > 0 ? "border-accent bg-accent/10" : "border-emerald-600 bg-emerald-50"}`}>
          <span className="text-sm font-semibold text-ink">{due > 0 ? "Amount due now (all months)" : "Nothing due — thank you!"}</span>
          {due > 0 ? <span className="font-heading text-2xl font-bold text-ink">{formatInr(due)}</span> : null}
        </div>
        <p className="mt-2 text-xs text-dark/60">
          {main?.payment_preference === "monthly_bill"
            ? "Pay your monthly bill to the delivery person by cash or UPI, or by UPI to our number; it shows here once recorded."
            : "Pay the delivery person by cash or UPI when your milk arrives; payments show here once recorded."}
        </p>

        {shown.length ? (
          <ul className="mt-4 divide-y-2 divide-ink/10 border-y-2 border-ink/10 text-sm">
            {shown.map((d) => {
              const none = ["skipped", "paused"].includes(d.status);
              return (
                <li key={`${d.date}-${d.slot}`} className="flex items-start gap-3 py-2.5">
                  <div className="w-20 shrink-0">
                    <p className="font-semibold text-ink">{shortDay(d.date)}</p>
                    <div className="mt-1">
                      <Pill status={d.status} />
                    </div>
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-dark/75">{none ? "No delivery" : d.lines.map((l) => `${Number(l.qty)} × ${l.name}`).join(", ")}</p>
                    {d.order_id && d.invoice_number ? (
                      <a href={`/invoice/${d.order_id}`} target="_blank" rel="noopener" className="mt-0.5 inline-block text-xs font-semibold text-primary-dark hover:underline">
                        Invoice {d.invoice_number}
                      </a>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right font-semibold whitespace-nowrap text-ink">{none ? "—" : formatInr(d.total)}</p>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="mt-4 text-sm text-dark/60">No deliveries in this month.</p>
        )}
      </Panel>
    </>
  );
}

function Plan({ s, overview }: { s: Subscription; overview: Overview }) {
  const fo = overview.first_open_date;
  const presets = [
    { label: "3 days", until: addDays(fo, 2) },
    { label: "1 week", until: addDays(fo, 6) },
    { label: "2 weeks", until: addDays(fo, 13) },
  ];
  return (
    <>
      <Panel
        title={`${s.qty_units} × ${s.item_name}`}
        action={
          <span className={`rounded-full border-2 px-2.5 py-0.5 text-xs font-bold ${s.pause_from ? "border-ink/20 bg-ink/5 text-dark/60" : "border-emerald-700 bg-emerald-100 text-emerald-900"}`}>
            {s.pause_from ? "Paused" : "Active"}
          </span>
        }
      >
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-2">
          {[
            ["Schedule", scheduleText(s)],
            ["Price", `${formatInr(s.price_today)} a bottle (${packSize(s.unit_label)}) · about ${formatInr(s.monthly_estimate)} a month`],
            ["Since", longDay(s.start_date)],
            ["Payment", s.payment_preference === "monthly_bill" ? "Monthly bill" : "Pay on delivery"],
            ["Bottles", s.bottle_arrangement === "returnable_glass" ? "Returnable glass" : "Poured into your container"],
            ["Address", `${s.address}, ${s.city} ${s.pincode}`],
          ].map(([k, v]) => (
            <div key={k}>
              <dt className="inline text-dark/55">{k}: </dt>
              <dd className="inline font-semibold text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        {s.price_changes.map((p) => (
          <p key={p.from} className="mt-2 text-sm font-semibold text-accent-dark">
            Price changes to {formatInr(p.price)} from {shortDay(p.from)}.
          </p>
        ))}
        <p className="mt-3 text-xs text-dark/60">Changes apply from {longDay(fo)}, the next delivery that can still be changed.</p>
      </Panel>

      <Panel title="Bottles each delivery">
        <OpsForm fn="sub_change_quantity" submitLabel="Save" inline success="Updated" resetOnSuccess={false}>
          <input type="hidden" name="p_subscription_id" value={s.id} />
          <QtyStepper name="p_qty_units#int" initial={s.qty_units} min={1} max={20} unit={`× ${packSize(s.unit_label)}`} />
        </OpsForm>
      </Panel>

      <Panel title="Delivery days & time">
        <OpsForm fn="sub_change_schedule" submitLabel="Save schedule" success="Schedule updated" resetOnSuccess={false}>
          <input type="hidden" name="p_subscription_id" value={s.id} />
          <ScheduleFields frequency={s.frequency} days={s.days_of_week} slot={s.slot} />
        </OpsForm>
      </Panel>

      <div id="pause" className="scroll-mt-32">
        <Panel title="Going away?">
          {s.pause_from ? (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-ink">
                Paused from <strong>{longDay(s.pause_from)}</strong>
                {s.pause_until ? (
                  <>
                    {" "}
                    until <strong>{longDay(s.pause_until)}</strong>; deliveries restart the day after.
                  </>
                ) : (
                  " until you resume."
                )}
              </p>
              <OpsForm fn="sub_resume" submitLabel="Resume deliveries now" inline success="Deliveries resumed">
                <input type="hidden" name="p_subscription_id" value={s.id} />
              </OpsForm>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              <p className="text-sm text-dark/70">Pause from {longDay(fo)} for:</p>
              <div className="flex flex-wrap gap-2">
                {presets.map((p) => (
                  <OpsForm key={p.label} fn="sub_pause" submitLabel={p.label} variant="secondary" inline success={`Paused until ${shortDay(p.until)}`}>
                    <input type="hidden" name="p_subscription_id" value={s.id} />
                    <input type="hidden" name="p_from#date" value={fo} />
                    <input type="hidden" name="p_until#date" value={p.until} />
                  </OpsForm>
                ))}
                <OpsForm fn="sub_pause" submitLabel="Until I resume" variant="secondary" inline success="Paused">
                  <input type="hidden" name="p_subscription_id" value={s.id} />
                  <input type="hidden" name="p_from#date" value={fo} />
                </OpsForm>
              </div>
              <details>
                <summary className="cursor-pointer text-sm font-semibold text-primary-dark">Choose dates</summary>
                <div className="mt-2">
                  <OpsForm fn="sub_pause" submitLabel="Pause" variant="secondary" inline success="Pause saved">
                    <input type="hidden" name="p_subscription_id" value={s.id} />
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-ink">From</span>
                      <input name="p_from#date" type="date" required min={fo} defaultValue={fo} className="rounded-xl border-2 border-ink/20 px-3 py-2" />
                    </label>
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="font-semibold text-ink">Until</span>
                      <input name="p_until#date" type="date" min={fo} className="rounded-xl border-2 border-ink/20 px-3 py-2" />
                    </label>
                  </OpsForm>
                </div>
              </details>
            </div>
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <Panel title="Glass bottles">
          <p className="font-heading text-3xl font-bold text-ink">{overview.bottles_outstanding}</p>
          <p className="text-sm text-dark/70">bottles with you</p>
          <p className="mt-2 text-xs text-dark/60">
            Rinse and hand back empties to the delivery person.
            {Number(overview.bottle_deposit) > 0 ? ` Deposit ${formatInr(overview.bottle_deposit)} a bottle, refunded on return.` : ""}
            {Number(overview.bottle_damage_charge) > 0 ? ` Damaged or lost: ${formatInr(overview.bottle_damage_charge)}.` : ""}
          </p>
        </Panel>
        <Panel title="Your subscriber benefits" tone="cream">
          <ul className="flex flex-col gap-1.5 text-sm text-ink">
            {milkSubscriberBenefits.slice(0, 4).map((b) => (
              <li key={b} className="flex gap-2">
                <span aria-hidden="true" className="text-emerald-700">
                  ✓
                </span>
                {b}
              </li>
            ))}
          </ul>
          <Link href="/#catalog" className="mt-3 inline-block text-sm font-semibold text-primary-dark hover:underline">
            Shop sweets with your discount →
          </Link>
        </Panel>
      </div>

      <Panel title="Address & instructions">
        <OpsForm fn="sub_change_address" submitLabel="Save address" variant="secondary" success="Address updated" resetOnSuccess={false}>
          <input type="hidden" name="p_subscription_id" value={s.id} />
          <JsonObjectFields
            name="p#json"
            cols={2}
            fields={[
              { key: "address", label: "Address", required: true, wide: true, defaultValue: s.address },
              { key: "city", label: "City", defaultValue: s.city },
              { key: "pincode", label: "Pincode", required: true, defaultValue: s.pincode },
              { key: "instructions", label: "Delivery instructions", wide: true, defaultValue: s.instructions ?? "" },
            ]}
          />
        </OpsForm>
      </Panel>

      <details className="rounded-2xl border-2 border-ink/20 bg-white p-4">
        <summary className="cursor-pointer text-sm font-semibold text-dark/70">Cancel subscription</summary>
        <div className="mt-3">
          <OpsForm fn="sub_cancel" submitLabel="Cancel my subscription" variant="danger" confirm="Cancel your milk subscription? Deliveries already being prepared will still arrive." success="Subscription cancelled">
            <input type="hidden" name="p_subscription_id" value={s.id} />
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-semibold text-ink">Why are you leaving? (optional)</span>
              <input name="p_reason" className="rounded-xl border-2 border-ink/20 px-3 py-2" />
            </label>
          </OpsForm>
          <p className="mt-2 text-xs text-dark/60">Going away for a while? A pause keeps your plan and benefits.</p>
        </div>
      </details>
    </>
  );
}
