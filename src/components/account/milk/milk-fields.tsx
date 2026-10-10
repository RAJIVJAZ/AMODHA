"use client";

import { useMemo, useState } from "react";
import { frequencies, weekdays } from "./schedule";

const field = "w-full rounded-xl border-2 border-ink/20 bg-white px-3 py-2.5 text-sm text-ink focus:border-primary focus:outline-none";
const label = "text-sm font-semibold text-ink";

/** − 2 + control; the number is submitted under `name`. */
export function QtyStepper({ name, initial, min = 0, max = 20, unit, onChange }: { name?: string; initial: number; min?: number; max?: number; unit?: string; onChange?: (n: number) => void }) {
  const [n, setN] = useState(initial);
  const set = (v: number) => {
    const next = Math.min(max, Math.max(min, v));
    setN(next);
    onChange?.(next);
  };
  return (
    <div className="inline-flex items-center rounded-full border-2 border-ink bg-white">
      {name ? <input type="hidden" name={name} value={n} /> : null}
      <button type="button" aria-label="One less" onClick={() => set(n - 1)} disabled={n <= min} className="h-10 w-10 rounded-full text-xl font-bold text-ink disabled:opacity-30">
        −
      </button>
      <span className="font-heading min-w-[3.5rem] text-center text-lg font-bold text-ink" aria-live="polite">
        {n}
        {unit ? <span className="ml-1 text-xs font-semibold text-dark/60">{unit}</span> : null}
      </span>
      <button type="button" aria-label="One more" onClick={() => set(n + 1)} disabled={n >= max} className="h-10 w-10 rounded-full text-xl font-bold text-ink disabled:opacity-30">
        +
      </button>
    </div>
  );
}

function FrequencyChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {frequencies.map((f) => (
        <button
          key={f.value}
          type="button"
          aria-pressed={value === f.value}
          onClick={() => onChange(f.value)}
          className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${value === f.value ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink hover:border-ink/50"}`}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

function DayChips({ days, onToggle }: { days: number[]; onToggle: (d: number) => void }) {
  return (
    <div className="grid max-w-sm grid-cols-7 gap-1.5">
      {weekdays.map((d) => {
        const on = days.includes(d.value);
        return (
          <button
            key={d.value}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(d.value)}
            className={`aspect-square w-full max-w-11 rounded-full border-2 text-[11px] font-bold transition ${on ? "border-ink bg-primary-light text-ink" : "border-ink/20 bg-white text-dark/60 hover:border-ink/50"}`}
          >
            {d.short}
          </button>
        );
      })}
    </div>
  );
}

function SlotChips({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:max-w-xs">
      {[
        { value: "morning", label: "🌅 Morning" },
        { value: "evening", label: "🌇 Evening" },
      ].map((s) => (
        <button
          key={s.value}
          type="button"
          aria-pressed={value === s.value}
          onClick={() => onChange(s.value)}
          className={`rounded-xl border-2 px-3 py-2 text-sm font-semibold transition ${value === s.value ? "border-ink bg-ink text-white" : "border-ink/20 bg-white text-ink hover:border-ink/50"}`}
        >
          {s.label}
        </button>
      ))}
    </div>
  );
}

const toggle = (days: number[], d: number) => (days.includes(d) ? days.filter((x) => x !== d) : [...days, d]);

/** How often and when — sent as p_frequency, p_days_of_week and p_slot (sub_change_schedule). */
export function ScheduleFields({ frequency, days, slot }: { frequency: string; days: number[] | null; slot: string }) {
  const [freq, setFreq] = useState(frequency);
  const [picked, setPicked] = useState<number[]>(days ?? []);
  const [when, setWhen] = useState(slot);
  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="p_frequency" value={freq} />
      <input type="hidden" name="p_slot" value={when} />
      {freq === "custom" ? <input type="hidden" name="p_days_of_week#intlist" value={picked.join(",")} /> : null}
      <FrequencyChips value={freq} onChange={setFreq} />
      {freq === "custom" ? (
        <div className="flex flex-col gap-1">
          <span className={label}>Deliver on</span>
          <DayChips days={picked} onToggle={(d) => setPicked((p) => toggle(p, d))} />
        </div>
      ) : null}
      <div className="flex flex-col gap-1">
        <span className={label}>Delivery time</span>
        <SlotChips value={when} onChange={setWhen} />
      </div>
    </div>
  );
}

type MilkOption = { item_id: string; name: string; unit_label: string; price: number };

/** Everything needed to start a subscription, sent as the single JSON argument of sub_create. */
export function SubscribeFields({ milk, firstOpenDate, name, phone }: { milk: MilkOption[]; firstOpenDate: string; name: string; phone: string }) {
  const [v, setV] = useState({
    item_id: milk[0]?.item_id ?? "",
    qty_units: 1,
    frequency: "daily",
    days: [] as number[],
    slot: "morning",
    start_date: firstOpenDate,
    customer_name: name,
    phone,
    address: "",
    city: "Prayagraj",
    pincode: "",
    payment_preference: "pay_on_delivery",
    bottle_arrangement: "returnable_glass",
    instructions: "",
  });
  const set = (patch: Partial<typeof v>) => setV((s) => ({ ...s, ...patch }));
  const chosen = milk.find((m) => m.item_id === v.item_id);
  const perMonth = { daily: 30, alternate_days: 15, mon_to_sat: 26, custom: (v.days.length * 30) / 7 }[v.frequency] ?? 30;
  const estimate = Math.round((chosen?.price ?? 0) * v.qty_units * perMonth);

  const json = useMemo(() => {
    const out: Record<string, unknown> = {
      item_id: v.item_id, qty_units: v.qty_units, frequency: v.frequency, slot: v.slot, start_date: v.start_date,
      customer_name: v.customer_name.trim(), phone: v.phone.trim(), address: v.address.trim(), city: v.city.trim() || "Prayagraj",
      pincode: v.pincode.trim(), payment_preference: v.payment_preference, bottle_arrangement: v.bottle_arrangement,
      instructions: v.instructions.trim() || null,
    };
    if (v.frequency === "custom") out.days_of_week = v.days;
    return JSON.stringify(out);
  }, [v]);

  const text = (key: keyof typeof v, title: string, opts: { required?: boolean; inputMode?: "numeric" | "tel"; wide?: boolean; placeholder?: string; type?: string; min?: string } = {}) => (
    <label className={`flex flex-col gap-1 ${opts.wide ? "sm:col-span-2" : ""}`}>
      <span className={label}>
        {title}
        {opts.required ? <span className="text-accent-dark"> *</span> : null}
      </span>
      <input
        className={field}
        type={opts.type ?? "text"}
        min={opts.min}
        required={opts.required}
        inputMode={opts.inputMode}
        placeholder={opts.placeholder}
        value={String(v[key])}
        onChange={(e) => set({ [key]: e.target.value } as Partial<typeof v>)}
      />
    </label>
  );

  return (
    <div className="flex flex-col gap-5">
      <input type="hidden" name="p#json" value={json} />
      {milk.length > 1 ? (
        <div className="flex flex-col gap-2">
          <span className={label}>Milk</span>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {milk.map((m) => (
              <button
                key={m.item_id}
                type="button"
                aria-pressed={v.item_id === m.item_id}
                onClick={() => set({ item_id: m.item_id })}
                className={`rounded-xl border-2 px-4 py-3 text-left text-sm ${v.item_id === m.item_id ? "border-ink bg-primary-light/40" : "border-ink/20 bg-white"}`}
              >
                <span className="block font-semibold text-ink">{m.name}</span>
                <span className="text-dark/65">₹{m.price} per bottle</span>
              </button>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className={label}>Bottles each delivery</span>
          <QtyStepper initial={1} min={1} max={20} onChange={(n) => set({ qty_units: n })} />
        </div>
        <div className="rounded-2xl border-2 border-ink bg-[#fbeec4] px-4 py-2 text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-dark/60">About</p>
          <p className="font-heading text-xl font-bold text-ink">₹{estimate.toLocaleString("en-IN")}</p>
          <p className="text-xs text-dark/60">a month</p>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <span className={label}>How often</span>
        <FrequencyChips value={v.frequency} onChange={(f) => set({ frequency: f })} />
        {v.frequency === "custom" ? <DayChips days={v.days} onToggle={(d) => set({ days: toggle(v.days, d) })} /> : null}
      </div>
      <div className="flex flex-col gap-1">
        <span className={label}>Delivery time</span>
        <SlotChips value={v.slot} onChange={(s) => set({ slot: s })} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {text("start_date", "First delivery", { required: true, type: "date", min: firstOpenDate })}
        {text("customer_name", "Name", { required: true })}
        {text("phone", "Mobile number", { required: true, inputMode: "tel" })}
        {text("pincode", "Pincode", { required: true, inputMode: "numeric" })}
        {text("address", "Delivery address", { required: true, wide: true, placeholder: "House, street, landmark" })}
        {text("instructions", "Delivery instructions", { wide: true, placeholder: "Gate, floor, ring the bell…" })}
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <span className={label}>Payment</span>
          {[
            { value: "pay_on_delivery", label: "Pay on delivery (cash / UPI)" },
            { value: "monthly_bill", label: "Monthly bill" },
          ].map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" className="h-4 w-4 accent-ink" checked={v.payment_preference === o.value} onChange={() => set({ payment_preference: o.value })} />
              {o.label}
            </label>
          ))}
        </div>
        <div className="flex flex-col gap-2">
          <span className={label}>Bottles</span>
          {[
            { value: "returnable_glass", label: "Returnable glass bottles" },
            { value: "no_bottle", label: "Pour into my container" },
          ].map((o) => (
            <label key={o.value} className="flex items-center gap-2 text-sm text-ink">
              <input type="radio" className="h-4 w-4 accent-ink" checked={v.bottle_arrangement === o.value} onChange={() => set({ bottle_arrangement: o.value })} />
              {o.label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Prints the monthly bill (or saves it as PDF from the print dialog). */
export function PrintButton() {
  return (
    <button type="button" onClick={() => window.print()} className="rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-semibold text-ink print:hidden">
      Print / save PDF
    </button>
  );
}

type Addon = { item_id: string; name: string; price: number; in_stock: boolean };

/** Products to add to one delivery, each with its own − / + — sent as p_items: [{item_id, qty}]. */
export function AddonPicker({ addons, current }: { addons: Addon[]; current: Record<string, number> }) {
  const [qty, setQty] = useState<Record<string, number>>(current);
  const items = addons.map((a) => ({ item_id: a.item_id, qty: qty[a.item_id] ?? 0 })).filter((i) => i.qty > 0);
  const total = addons.reduce((s, a) => s + (qty[a.item_id] ?? 0) * a.price, 0);
  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="p_items#json" value={JSON.stringify(items)} />
      <ul className="flex flex-col divide-y-2 divide-ink/10">
        {addons.map((a) => {
          const n = qty[a.item_id] ?? 0;
          const off = !a.in_stock && n === 0;
          return (
            <li key={a.item_id} className={`flex items-center justify-between gap-3 py-2 ${off ? "opacity-50" : ""}`}>
              <span className="min-w-0 text-sm text-ink">
                <span className="block font-semibold">{a.name}</span>
                <span className="text-dark/60">₹{a.price}{off ? " · out of stock" : ""}</span>
              </span>
              <span className="inline-flex shrink-0 items-center rounded-full border-2 border-ink bg-white">
                <button type="button" aria-label={`One less ${a.name}`} disabled={n <= 0} onClick={() => setQty((q) => ({ ...q, [a.item_id]: Math.max(0, n - 1) }))} className="h-9 w-9 rounded-full text-lg font-bold disabled:opacity-30">
                  −
                </button>
                <span className="font-heading w-6 text-center font-bold" aria-live="polite">
                  {n}
                </span>
                <button type="button" aria-label={`One more ${a.name}`} disabled={off || n >= 50} onClick={() => setQty((q) => ({ ...q, [a.item_id]: n + 1 }))} className="h-9 w-9 rounded-full text-lg font-bold disabled:opacity-30">
                  +
                </button>
              </span>
            </li>
          );
        })}
      </ul>
      {total > 0 ? <p className="text-right text-sm font-semibold text-ink">Products: ₹{total.toLocaleString("en-IN")}</p> : null}
    </div>
  );
}
