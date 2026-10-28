import Link from "next/link";
import { redirect } from "next/navigation";
import { InstallBanner } from "@/components/ops/app-install";
import { Icon, type IconName } from "@/components/ops/icons";
import { RemindersPanel } from "@/components/ops/reminders-panel";
import { StatusBadge } from "@/components/ops/ui";
import { getOps } from "@/lib/ops/context";
import { inr, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Today" };

const OPEN_BATCH = ["planned", "materials_issued", "in_production", "production_completed", "awaiting_qc", "qc_approved", "packaging", "packaging_completed"];

type Demand = { date: string; locked: boolean; deliveries: number; skipped: number; paused: number };
type Collection = { shift: string; qty_accepted: number; qty_rejected: number; amount: number; fat_pct: number | null; supplier_id: string };
type Batch = { id: string; batch_no: string; status: string; production_date: string; planned_qty: number; products: { name: string; base_unit: string } | null };
type Dashboard = Record<string, unknown> & {
  profit?: Record<string, number>;
  cash_and_bank?: { name: string; balance: number }[];
  low_stock?: unknown[];
};

function Section({ title, icon, href, linkLabel, children }: { title: string; icon: IconName; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-heading text-lg font-bold text-ink">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary-light/40 text-primary-dark">
            <Icon name={icon} className="h-5 w-5" />
          </span>
          {title}
        </h2>
        {href ? (
          <Link href={href} className="text-sm font-semibold text-primary-dark">
            {linkLabel ?? "Open"} →
          </Link>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function Num({ label, value, hint, tone = "default", href }: { label: string; value: React.ReactNode; hint?: string; tone?: "default" | "warn" | "good" | "bad"; href?: string }) {
  const tones = { default: "bg-[#f5f6f7]", warn: "bg-amber-50 ring-1 ring-amber-300", good: "bg-emerald-50", bad: "bg-red-50 ring-1 ring-red-300" };
  const body = (
    <div className={`h-full rounded-xl px-3 py-2.5 ${tones[tone]}`}>
      <p className="font-heading text-2xl font-bold leading-tight text-ink">{value}</p>
      <p className="text-xs font-semibold text-dark/60">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-dark/50">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block active:opacity-70">
      {body}
    </Link>
  ) : (
    body
  );
}

function Action({ href, children, primary }: { href: string; children: React.ReactNode; primary?: boolean }) {
  return (
    <Link
      href={href}
      className={`flex flex-1 items-center justify-center rounded-xl px-4 py-3 text-sm font-bold ${primary ? "bg-ink text-white" : "border-2 border-ink/15 bg-white text-ink"}`}
    >
      {children}
    </Link>
  );
}

function greeting() {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  return hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
}

export default async function TodayPage() {
  const ops = await getOps();
  if (!ops) redirect("/login?next=/ops/today");
  if (ops.granted.size === 0) redirect("/ops/no-access");
  const { supabase, can } = ops;
  const today = todayIST();
  const tomorrow = todayIST(1);
  const dayStart = `${today}T00:00:00+05:30`;
  const dayEnd = `${today}T23:59:59+05:30`;
  const none = Promise.resolve({ data: null, count: null, error: null });

  const [queue, onRoad, doneToday, demandToday, demandTomorrow, collections, batches, dash, pendingExpenses] = await Promise.all([
    can("dispatch") ? supabase.from("v_dispatch_queue").select("id, milk_subscriber, on_hold").lte("due_date", today).limit(500) : none,
    can("dispatch") ? supabase.from("dispatches").select("id", { count: "exact", head: true }).in("status", ["dispatched", "out_for_delivery"]) : none,
    can("dispatch")
      ? supabase.from("dispatches").select("status, cash_collected").gte("delivered_at", dayStart).lte("delivered_at", dayEnd)
      : none,
    can("subscriptions") ? supabase.rpc("sub_daily_demand", { p_date: today }) : none,
    can("subscriptions") ? supabase.rpc("sub_daily_demand", { p_date: tomorrow }) : none,
    can("procurement")
      ? supabase.from("milk_collections").select("shift, qty_accepted, qty_rejected, amount, fat_pct, supplier_id").eq("collected_on", today).eq("status", "posted")
      : none,
    can("production")
      ? supabase
          .from("production_batches")
          .select("id, batch_no, status, production_date, planned_qty, products(name, base_unit)")
          .in("status", OPEN_BATCH)
          .order("production_date")
          .limit(100)
      : none,
    can("dashboard") ? supabase.rpc("ops_dashboard", { p_from: today, p_to: today }) : none,
    can("expenses", "approve") ? supabase.from("expenses").select("id", { count: "exact", head: true }).eq("status", "pending_approval") : none,
  ]);

  const name = (ops.profile?.full_name || "").split(" ")[0];
  const longDate = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date());

  // Deliveries
  const queueRows = (queue.data ?? []) as { milk_subscriber: boolean; on_hold: boolean }[];
  const delivered = ((doneToday.data ?? []) as { status: string; cash_collected: number | null }[]).filter((d) => ["delivered", "partially_delivered"].includes(d.status));
  const cashToday = delivered.reduce((sum, d) => sum + Number(d.cash_collected ?? 0), 0);
  const dToday = demandToday.data as Demand | null;
  const dTomorrow = demandTomorrow.data as Demand | null;

  // Milk collection
  const cols = (collections.data ?? []) as Collection[];
  const litres = (shift: string) => cols.filter((c) => c.shift === shift).reduce((s, c) => s + Number(c.qty_accepted), 0);
  const totalLitres = cols.reduce((s, c) => s + Number(c.qty_accepted), 0);
  const fatRows = cols.filter((c) => c.fat_pct !== null && Number(c.qty_accepted) > 0);
  const avgFat = fatRows.length ? fatRows.reduce((s, c) => s + Number(c.fat_pct) * Number(c.qty_accepted), 0) / fatRows.reduce((s, c) => s + Number(c.qty_accepted), 0) : null;
  const farmers = new Set(cols.map((c) => c.supplier_id)).size;
  const payable = cols.reduce((s, c) => s + Number(c.amount), 0);

  // Production
  const open = (batches.data ?? []) as unknown as Batch[];
  const stage = (s: string[]) => open.filter((b) => s.includes(b.status)).length;
  const todays = open.filter((b) => b.production_date === today);

  // Money and stock
  const d = (dash.data ?? null) as Dashboard | null;
  const n = (k: string) => Number(d?.[k] ?? 0);

  const anything = can("dispatch") || can("subscriptions") || can("procurement") || can("production") || Boolean(d);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div>
        <p className="text-sm font-semibold text-dark/55">{longDate}</p>
        <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">
          {greeting()}
          {name ? `, ${name}` : ""}
        </h1>
      </div>

      <InstallBanner />

      <RemindersPanel ops={ops} />

      {can("dispatch") ? (
        <Section title="Deliveries" icon="truck" href="/ops/deliveries" linkLabel="Delivery run">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num
              label="To send out"
              value={queueRows.length}
              hint={queueRows.some((r) => r.milk_subscriber) ? `${queueRows.filter((r) => r.milk_subscriber).length} for milk subscribers` : undefined}
              tone={queueRows.length ? "warn" : "default"}
              href="/ops/dispatch"
            />
            <Num label="On the road" value={onRoad.count ?? 0} href="/ops/deliveries" />
            <Num label="Delivered today" value={delivered.length} tone={delivered.length ? "good" : "default"} href="/ops/deliveries?tab=done" />
            <Num label="Cash / UPI collected" value={inr(cashToday, 0)} hint="On delivery, today" />
          </div>
          {queueRows.some((r) => r.on_hold) ? (
            <p className="mt-2 text-sm font-semibold text-accent-dark">{queueRows.filter((r) => r.on_hold).length} order(s) on hold</p>
          ) : null}
          <div className="mt-3 flex gap-2">
            <Action href="/ops/deliveries" primary>
              Start delivery run
            </Action>
            <Action href="/ops/dispatch">Dispatch sheet</Action>
          </div>
        </Section>
      ) : null}

      {can("subscriptions") && (dToday || dTomorrow) ? (
        <Section title="Milk subscriptions" icon="bottle" href="/ops/subscriptions" linkLabel="Demand">
          <div className="grid grid-cols-2 gap-2">
            {dToday ? (
              <Num
                label="Deliveries today"
                value={dToday.deliveries}
                hint={dToday.deliveries ? (dToday.locked ? "Orders created" : "Not locked yet") : `${dToday.skipped} skipped · ${dToday.paused} paused`}
                tone={dToday.deliveries && !dToday.locked ? "warn" : "default"}
                href={`/ops/subscriptions?date=${today}`}
              />
            ) : null}
            {dTomorrow ? (
              <Num
                label="Deliveries tomorrow"
                value={dTomorrow.deliveries}
                hint={dTomorrow.locked ? "Locked — orders created" : "Customers can still change"}
                href={`/ops/subscriptions?date=${tomorrow}`}
              />
            ) : null}
          </div>
        </Section>
      ) : null}

      {can("procurement") ? (
        <Section title="Milk collection" icon="milk" href="/ops/procurement" linkLabel="Register">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label="Litres accepted today" value={qty(totalLitres)} hint={`AM ${qty(litres("morning"))} · PM ${qty(litres("evening"))}`} />
            <Num label="Farmers" value={farmers} />
            <Num label="Average fat" value={avgFat === null ? "—" : `${avgFat.toFixed(1)}%`} />
            <Num label="Payable today" value={inr(payable, 0)} />
          </div>
          {can("procurement", "create") ? (
            <div className="mt-3 flex gap-2">
              <Action href="/ops/procurement/entry" primary>
                Record milk
              </Action>
            </div>
          ) : null}
        </Section>
      ) : null}

      {can("production") ? (
        <Section title="Production" icon="pot" href="/ops/production" linkLabel="All batches">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label="Cooking / planned" value={stage(["planned", "materials_issued", "in_production"])} href="/ops/production" />
            <Num
              label="Waiting for quality check"
              value={stage(["production_completed", "awaiting_qc"])}
              tone={stage(["production_completed", "awaiting_qc"]) ? "warn" : "default"}
              href="/ops/production?status=awaiting_qc"
            />
            <Num label="Packing" value={stage(["qc_approved", "packaging"])} href="/ops/production?status=packaging" />
            <Num
              label="Ready to release"
              value={stage(["packaging_completed"])}
              tone={stage(["packaging_completed"]) ? "warn" : "default"}
              href="/ops/production?status=packaging_completed"
            />
          </div>
          {todays.length ? (
            <ul className="mt-3 flex flex-col divide-y divide-ink/5 rounded-xl border border-ink/10">
              {todays.map((b) => (
                <li key={b.id}>
                  <Link href={`/ops/production/${b.id}`} className="flex items-center justify-between gap-2 px-3 py-2.5 active:bg-blush/40">
                    <span>
                      <span className="block text-sm font-semibold text-ink">{b.products?.name}</span>
                      <span className="text-xs text-dark/55">
                        {b.batch_no} · {qty(b.planned_qty, b.products?.base_unit)}
                      </span>
                    </span>
                    <StatusBadge status={b.status} />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-dark/55">No batches planned for today.</p>
          )}
          {can("production", "create") ? (
            <div className="mt-3 flex gap-2">
              <Action href="/ops/production/new" primary>
                Start a batch
              </Action>
            </div>
          ) : null}
        </Section>
      ) : null}

      {d && "profit" in d ? (
        <Section title="Money today" icon="rupee" href="/ops" linkLabel="Dashboard">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Num label="Sales (ex-GST)" value={inr(n("sales_period"), 0)} hint={`Month: ${inr(n("sales_month"), 0)}`} />
            <Num label="Cash received" value={inr(d.profit?.cash_received ?? 0, 0)} />
            <Num label="Customers owe" value={inr(n("receivables"), 0)} href="/ops/finance/sales" />
            <Num label="We owe suppliers" value={inr(n("payables"), 0)} href="/ops/finance/purchases" />
          </div>
          {d.cash_and_bank?.length ? (
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {d.cash_and_bank.map((a) => (
                <Num key={a.name} label={a.name} value={inr(a.balance, 0)} href="/ops/finance/banking" />
              ))}
            </div>
          ) : null}
          {pendingExpenses.count ? (
            <Link href="/ops/finance/expenses" className="mt-3 block rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-300">
              {pendingExpenses.count} expense(s) waiting for your approval →
            </Link>
          ) : null}
          <div className="mt-3 flex gap-2">
            {can("expenses", "create") ? <Action href="/ops/finance/expenses?tab=new">Add expense</Action> : null}
            {can("sales", "create") ? <Action href="/ops/finance/sales?tab=actions">Customer payment</Action> : null}
          </div>
        </Section>
      ) : null}

      {d && "low_stock" in d ? (
        <Section title="Stock alerts" icon="box" href="/ops/inventory" linkLabel="Inventory">
          <div className="grid grid-cols-3 gap-2">
            <Num label="Low stock" value={(d.low_stock ?? []).length} tone={(d.low_stock ?? []).length ? "warn" : "default"} href="/ops/inventory" />
            <Num label="Near expiry" value={n("near_expiry_lots")} tone={n("near_expiry_lots") ? "warn" : "default"} href="/ops/inventory?view=expiry" />
            <Num label="Expired" value={n("expired_lots")} tone={n("expired_lots") ? "bad" : "default"} href="/ops/inventory?view=expiry" />
          </div>
        </Section>
      ) : null}

      {!anything ? (
        <p className="rounded-2xl bg-white p-6 text-center text-sm text-dark/60">Choose a section from the menu.</p>
      ) : null}
    </div>
  );
}
