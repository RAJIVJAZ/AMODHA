"use client";

import { useMemo, useState } from "react";

const fieldClass = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

/** One explanation box per material whose actual use is outside the variance threshold. */
export function VarianceReasons({ materials }: { materials: { item_id: string; name: string; detail: string; flagged: boolean }[] }) {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const flagged = materials.filter((m) => m.flagged);
  if (!flagged.length) return <input type="hidden" name="p_variance_reasons#json" value="{}" />;
  return (
    <div className="flex flex-col gap-2 rounded-xl border-2 border-amber-200 bg-amber-50 p-3">
      <input type="hidden" name="p_variance_reasons#json" value={JSON.stringify(reasons)} />
      <p className="text-sm font-semibold text-amber-900">Explain these variances (required)</p>
      {flagged.map((m) => (
        <label key={m.item_id} className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">
            {m.name} <span className="font-normal text-dark/60">— {m.detail}</span>
          </span>
          <input
            className={fieldClass}
            value={reasons[m.item_id] ?? ""}
            onChange={(e) => setReasons((r) => ({ ...r, [m.item_id]: e.target.value }))}
            placeholder="Why was more or less used?"
          />
        </label>
      ))}
    </div>
  );
}

export type QcParameter = { id: string; name: string; kind: "pass_fail" | "numeric" | "text"; min_value: number | null; max_value: number | null; unit: string | null; is_required: boolean };

/** Quality checklist: pass/fail ticks, readings and notes, sent as one list. */
export function QcChecklist({ parameters }: { parameters: QcParameter[] }) {
  const [values, setValues] = useState<Record<string, { passed?: boolean; value_num?: string; value_text?: string }>>({});
  const json = useMemo(
    () =>
      JSON.stringify(
        parameters
          .map((p) => {
            const v = values[p.id] ?? {};
            if (p.kind === "pass_fail") return { parameter_id: p.id, passed: Boolean(v.passed) };
            if (p.kind === "numeric") return v.value_num ? { parameter_id: p.id, value_num: Number(v.value_num) } : null;
            return v.value_text ? { parameter_id: p.id, value_text: v.value_text, passed: true } : null;
          })
          .filter(Boolean)
      ),
    [parameters, values]
  );
  const set = (id: string, patch: object) => setValues((s) => ({ ...s, [id]: { ...s[id], ...patch } }));

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name="p_results#json" value={json} />
      {parameters.map((p) => (
        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-ink/5 px-3 py-2 text-sm">
          <span className="font-semibold text-ink">
            {p.name}
            {p.is_required ? <span className="text-accent-dark"> *</span> : null}
            {p.kind === "numeric" ? (
              <span className="font-normal text-dark/60">
                {" "}
                ({p.min_value ?? "–"} to {p.max_value ?? "–"} {p.unit ?? ""})
              </span>
            ) : null}
          </span>
          {p.kind === "pass_fail" ? (
            <label className="flex items-center gap-2">
              <input type="checkbox" className="h-5 w-5 accent-emerald-600" checked={Boolean(values[p.id]?.passed)} onChange={(e) => set(p.id, { passed: e.target.checked })} />
              Passed
            </label>
          ) : p.kind === "numeric" ? (
            <input className={`${fieldClass} max-w-32`} type="number" step="any" inputMode="decimal" value={values[p.id]?.value_num ?? ""} onChange={(e) => set(p.id, { value_num: e.target.value })} aria-label={p.name} />
          ) : (
            <input className={`${fieldClass} max-w-xs`} value={values[p.id]?.value_text ?? ""} onChange={(e) => set(p.id, { value_text: e.target.value })} aria-label={p.name} />
          )}
        </div>
      ))}
    </div>
  );
}

export type IssueOption = { item_id: string; name: string; unit: string; available: number };
export type LotOption = { id: string; item_id: string; label: string };

/** Material + optional specific lot (the lot list follows the chosen material). */
export function IssueMaterialFields({ items, lots }: { items: IssueOption[]; lots: LotOption[] }) {
  const [itemId, setItemId] = useState("");
  const item = items.find((i) => i.item_id === itemId);
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Material</span>
        <select name="p_item_id" required value={itemId} onChange={(e) => setItemId(e.target.value)} className={fieldClass}>
          <option value="">Choose…</option>
          {items.map((i) => (
            <option key={i.item_id} value={i.item_id}>
              {i.name} ({i.available.toLocaleString("en-IN", { maximumFractionDigits: 3 })} {i.unit} free)
            </option>
          ))}
        </select>
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Quantity issued{item ? ` (${item.unit})` : ""}</span>
        <input name="p_qty#num" required type="number" step="any" min="0" inputMode="decimal" className={fieldClass} />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-semibold text-ink">Lot</span>
        <select name="p_lot_id" className={fieldClass} defaultValue="">
          <option value="">Automatic (oldest expiry first)</option>
          {lots
            .filter((l) => l.item_id === itemId)
            .map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
        </select>
      </label>
    </div>
  );
}
