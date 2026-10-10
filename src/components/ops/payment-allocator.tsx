"use client";

import { useMemo, useState } from "react";

export type OpenDoc = { doc_type: string; doc_id: string; label: string; date: string; outstanding: number };

const money = (n: number) => new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR" }).format(n);
const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Amount paid plus how it settles the supplier's open bills. Typing an amount settles the oldest
 * bills first; each line can then be changed. Sends p_amount and p_allocations.
 */
export function PaymentAllocator({ docs }: { docs: OpenDoc[] }) {
  const [amount, setAmount] = useState("");
  const [alloc, setAlloc] = useState<Record<string, string>>({});

  const spread = (value: string) => {
    setAmount(value);
    let left = Number(value) || 0;
    const next: Record<string, string> = {};
    for (const d of docs) {
      const take = round2(Math.min(left, d.outstanding));
      next[d.doc_id] = take > 0 ? String(take) : "";
      left = round2(left - take);
    }
    setAlloc(next);
  };

  const allocations = useMemo(
    () => docs.filter((d) => Number(alloc[d.doc_id]) > 0).map((d) => ({ doc_type: d.doc_type, doc_id: d.doc_id, amount: Number(alloc[d.doc_id]) })),
    [docs, alloc]
  );
  const allocated = round2(allocations.reduce((s, a) => s + a.amount, 0));
  const total = Number(amount) || 0;

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="p_allocations#json" value={JSON.stringify(allocations)} />
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">
          Amount paid (₹)<span className="text-accent-dark"> *</span>
        </span>
        <input
          name="p_amount#num"
          type="number"
          step="0.01"
          min="0.01"
          inputMode="decimal"
          required
          value={amount}
          onChange={(e) => spread(e.target.value)}
          className="w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none sm:w-60"
        />
      </label>
      {docs.length ? (
        <div className="-mx-1 overflow-x-auto">
          <table className="w-full min-w-[480px] text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-dark/55">
                <th className="px-1 pb-1">Bill</th>
                <th className="px-1 pb-1">Date</th>
                <th className="px-1 pb-1 text-right">Outstanding</th>
                <th className="w-36 px-1 pb-1">Settle now</th>
              </tr>
            </thead>
            <tbody>
              {docs.map((d) => (
                <tr key={d.doc_id} className="border-t border-ink/5">
                  <td className="px-1 py-1">{d.label}</td>
                  <td className="px-1 py-1">{d.date}</td>
                  <td className="px-1 py-1 text-right">{money(d.outstanding)}</td>
                  <td className="px-1 py-1">
                    <input
                      aria-label={`Settle ${d.label}`}
                      type="number"
                      step="0.01"
                      min="0"
                      max={d.outstanding}
                      inputMode="decimal"
                      value={alloc[d.doc_id] ?? ""}
                      onChange={(e) => setAlloc((a) => ({ ...a, [d.doc_id]: e.target.value }))}
                      className="w-full rounded-lg border-2 border-ink/15 bg-white px-2 py-1 text-sm focus:border-primary focus:outline-none"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <p className={`text-sm ${allocated > total ? "font-semibold text-red-700" : "text-dark/65"}`}>
        Settling {money(allocated)} of {money(total)}
        {total > allocated ? ` · ${money(round2(total - allocated))} stays as an advance to the supplier` : ""}
        {allocated > total ? " — more than the amount paid" : ""}
      </p>
    </div>
  );
}
