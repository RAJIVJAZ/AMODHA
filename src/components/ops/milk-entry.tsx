"use client";

import { useMemo, useState } from "react";
import { OpsForm } from "@/components/ops/ops-form";

export type Farmer = { id: string; code: string; name: string; village: string | null; lastRate: number | null; lastFat: number | null };

const big = "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-3 text-lg font-semibold text-ink focus:border-primary focus:outline-none";

function Num({ label, name, value, onChange, required, placeholder }: {
  label: string; name: string; value: string; onChange: (v: string) => void; required?: boolean; placeholder?: string;
}) {
  return (
    <label className="flex min-w-0 flex-col gap-1 text-sm font-semibold text-ink">
      {label}
      <input
        name={name}
        type="number"
        inputMode="decimal"
        step="any"
        min="0"
        required={required}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={big}
      />
    </label>
  );
}

function Fields({ farmers, today, defaultShift }: { farmers: Farmer[]; today: string; defaultShift: "morning" | "evening" }) {
  const [search, setSearch] = useState("");
  const [farmer, setFarmer] = useState<Farmer | null>(null);
  const [shift, setShift] = useState(defaultShift);
  const [litres, setLitres] = useState("");
  const [rejected, setRejected] = useState("");
  const [rate, setRate] = useState("");
  const [fat, setFat] = useState("");
  const [snf, setSnf] = useState("");
  const [temp, setTemp] = useState("");
  const [more, setMore] = useState(false);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = q ? farmers.filter((f) => `${f.name} ${f.code} ${f.village ?? ""}`.toLowerCase().includes(q)) : farmers;
    return list.slice(0, 40);
  }, [farmers, search]);

  const accepted = Math.max(Number(litres || 0) - Number(rejected || 0), 0);
  const amount = accepted * Number(rate || 0);

  function choose(f: Farmer) {
    setFarmer(f);
    setRate(f.lastRate === null ? "" : String(f.lastRate));
    setSearch("");
  }

  return (
    <>
      <input type="hidden" name="p_collected_on#date" value={today} />
      <input type="hidden" name="p_shift" value={shift} />
      <input type="hidden" name="p_supplier_id" value={farmer?.id ?? ""} />

      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Shift">
        {(["morning", "evening"] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={shift === s}
            onClick={() => setShift(s)}
            className={`rounded-xl py-2.5 text-sm font-bold ${shift === s ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/20"}`}
          >
            {s === "morning" ? "🌅 Morning" : "🌇 Evening"}
          </button>
        ))}
      </div>

      {farmer ? (
        <div className="flex items-center justify-between gap-3 rounded-xl bg-primary-light/30 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-heading text-lg font-bold text-ink">{farmer.name}</p>
            <p className="text-xs text-dark/60">
              {farmer.code}
              {farmer.village ? ` · ${farmer.village}` : ""}
              {farmer.lastFat !== null ? ` · last fat ${farmer.lastFat}%` : ""}
            </p>
          </div>
          <button type="button" onClick={() => setFarmer(null)} className="shrink-0 rounded-lg bg-white px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-ink/15">
            Change
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            Farmer
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type a name, code or village"
              className={big}
              autoComplete="off"
            />
          </label>
          <ul className="max-h-72 overflow-y-auto rounded-xl border border-ink/10 bg-white" aria-label="Farmers">
            {matches.length ? (
              matches.map((f) => (
                <li key={f.id} className="border-b border-ink/5 last:border-0">
                  <button type="button" onClick={() => choose(f)} className="flex w-full items-center justify-between gap-2 px-4 py-3 text-left active:bg-primary-light/30">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-ink">{f.name}</span>
                      <span className="text-xs text-dark/55">
                        {f.code}
                        {f.village ? ` · ${f.village}` : ""}
                      </span>
                    </span>
                    {f.lastRate !== null ? <span className="shrink-0 text-xs font-semibold text-dark/60">₹{f.lastRate}/L</span> : null}
                  </button>
                </li>
              ))
            ) : (
              <li className="px-4 py-6 text-center text-sm text-dark/55">No farmer matches “{search}”.</li>
            )}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Num label="Litres received" name="p_qty_received#num" value={litres} onChange={setLitres} required />
        <Num label="Rate ₹ / litre" name="p_rate#num" value={rate} onChange={setRate} required />
        <Num label="Fat %" name="p_fat#num" value={fat} onChange={setFat} />
        <Num label="SNF %" name="p_snf#num" value={snf} onChange={setSnf} />
      </div>

      {more ? (
        <div className="grid grid-cols-2 gap-3">
          <Num label="Rejected litres" name="p_qty_rejected#num" value={rejected} onChange={setRejected} placeholder="0" />
          <Num label="Temperature °C" name="p_temperature#num" value={temp} onChange={setTemp} />
          <label className="col-span-2 flex flex-col gap-1 text-sm font-semibold text-ink">
            Can no. / reference
            <input name="p_reference" className={big} />
          </label>
        </div>
      ) : (
        <>
          <input type="hidden" name="p_qty_rejected#num" value="0" />
          <button type="button" onClick={() => setMore(true)} className="self-start text-sm font-semibold text-primary-dark">
            + Rejected milk, temperature or can no.
          </button>
        </>
      )}

      <div className="flex items-center justify-between rounded-xl bg-[#f5f6f7] px-4 py-3">
        <span className="text-sm text-dark/65">
          {accepted ? `${accepted} L accepted` : "Accepted litres"} × {rate ? `₹${rate}` : "rate"}
        </span>
        <span className="font-heading text-xl font-bold text-ink">₹{amount.toLocaleString("en-IN", { maximumFractionDigits: 2 })}</span>
      </div>
      {!farmer ? <p className="text-sm text-accent-dark">Choose the farmer first.</p> : null}
    </>
  );
}

export function MilkEntry({ farmers, today, defaultShift }: { farmers: Farmer[]; today: string; defaultShift: "morning" | "evening" }) {
  return (
    <OpsForm fn="proc_record_collection" submitLabel="Save collection" idempotent success="Saved — milk added to stock. Next farmer." large>
      <Fields farmers={farmers} today={today} defaultShift={defaultShift} />
    </OpsForm>
  );
}
