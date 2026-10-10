"use client";

import { useMemo, useState } from "react";

type Component = { name: string; kind: "earning" | "deduction"; amount: string };
export type EmployeeValues = {
  id?: string; employee_code?: string; full_name?: string; department?: string | null; designation?: string | null; joining_date?: string; leaving_date?: string | null;
  phone?: string | null; pay_type?: string; monthly_salary?: number | null; daily_rate?: number | null; overtime_rate_per_hour?: number | null;
  bank_account_masked?: string | null; notes?: string | null; is_active?: boolean; salary_components?: { name: string; kind: string; amount: number }[];
};

const field = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

/** Employee details and configured pay components, sent as the single JSON argument of pay_save_employee. */
export function EmployeeFields({ initial }: { initial?: EmployeeValues }) {
  const editing = Boolean(initial?.id);
  const [v, setV] = useState<Record<string, string | boolean>>(() => ({
    employee_code: initial?.employee_code ?? "",
    full_name: initial?.full_name ?? "",
    department: initial?.department ?? "",
    designation: initial?.designation ?? "",
    joining_date: initial?.joining_date ?? "",
    leaving_date: initial?.leaving_date ?? "",
    phone: initial?.phone ?? "",
    pay_type: initial?.pay_type ?? "monthly",
    monthly_salary: initial?.monthly_salary?.toString() ?? "",
    daily_rate: initial?.daily_rate?.toString() ?? "",
    overtime_rate_per_hour: initial?.overtime_rate_per_hour?.toString() ?? "",
    bank_account_masked: initial?.bank_account_masked ?? "",
    notes: initial?.notes ?? "",
    is_active: initial?.is_active ?? true,
  }));
  const [components, setComponents] = useState<Component[]>(() =>
    (initial?.salary_components ?? []).map((c) => ({ name: c.name, kind: c.kind === "deduction" ? "deduction" : "earning", amount: String(c.amount) }))
  );

  const json = useMemo(() => {
    const text = (k: string) => (String(v[k]).trim() === "" ? null : String(v[k]).trim());
    const num = (k: string) => (String(v[k]).trim() === "" ? null : Number(v[k]));
    const out: Record<string, unknown> = {
      full_name: text("full_name"), department: text("department"), designation: text("designation"), phone: text("phone"),
      monthly_salary: v.pay_type === "monthly" ? num("monthly_salary") : null, daily_rate: v.pay_type === "daily" ? num("daily_rate") : null,
      overtime_rate_per_hour: num("overtime_rate_per_hour") ?? 0, bank_account_masked: text("bank_account_masked"), notes: text("notes"),
      salary_components: components.filter((c) => c.name.trim() && c.amount !== "").map((c) => ({ name: c.name.trim(), kind: c.kind, amount: Number(c.amount) })),
    };
    if (editing) {
      out.id = initial?.id;
      out.leaving_date = text("leaving_date");
      out.is_active = Boolean(v.is_active);
    } else {
      out.employee_code = text("employee_code");
      out.joining_date = text("joining_date");
      out.pay_type = v.pay_type;
    }
    return JSON.stringify(out);
  }, [v, components, editing, initial?.id]);

  const input = (key: string, labelText: string, opts: { type?: string; required?: boolean; hint?: string; disabled?: boolean } = {}) => (
    <label className="flex min-w-0 flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">
        {labelText}
        {opts.required ? <span className="text-accent-dark"> *</span> : null}
      </span>
      <input
        className={field}
        type={opts.type ?? "text"}
        step={opts.type === "number" ? "any" : undefined}
        required={opts.required}
        disabled={opts.disabled}
        value={String(v[key])}
        onChange={(e) => setV((s) => ({ ...s, [key]: e.target.value }))}
      />
      {opts.hint ? <span className="text-xs text-dark/55">{opts.hint}</span> : null}
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <input type="hidden" name="p#json" value={json} />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {input("employee_code", "Employee code", { required: !editing, disabled: editing, hint: "e.g. MW-E001" })}
        {input("full_name", "Full name", { required: true })}
        {input("phone", "Phone")}
        {input("department", "Department", { hint: "Production, dispatch, office…" })}
        {input("designation", "Designation")}
        {editing ? input("leaving_date", "Leaving date", { type: "date" }) : input("joining_date", "Joining date", { type: "date", required: true })}
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-semibold text-ink">Paid</span>
          <select className={field} value={String(v.pay_type)} disabled={editing} onChange={(e) => setV((s) => ({ ...s, pay_type: e.target.value }))}>
            <option value="monthly">Monthly salary</option>
            <option value="daily">Daily wage</option>
          </select>
        </label>
        {v.pay_type === "monthly" ? input("monthly_salary", "Monthly salary (₹)", { type: "number", required: true }) : input("daily_rate", "Daily wage (₹)", { type: "number", required: true })}
        {input("overtime_rate_per_hour", "Overtime per hour (₹)", { type: "number" })}
        {input("bank_account_masked", "Bank account (last 4 digits only)", { hint: "Do not enter full account numbers" })}
        {input("notes", "Notes")}
        {editing ? (
          <label className="flex items-center gap-2 self-end pb-2 text-sm font-semibold text-ink">
            <input type="checkbox" className="h-4 w-4 accent-ink" checked={Boolean(v.is_active)} onChange={(e) => setV((s) => ({ ...s, is_active: e.target.checked }))} />
            Active
          </label>
        ) : null}
      </div>
      <div>
        <p className="mb-1 text-sm font-semibold text-ink">Fixed monthly allowances and deductions</p>
        <p className="mb-2 text-xs text-dark/55">
          Only what you have agreed with the employee (e.g. travel allowance, PF/ESI as advised by your accountant). Allowances are pro-rated for days worked; deductions are taken in
          full. No statutory rate is assumed.
        </p>
        {components.map((c, i) => (
          <div key={i} className="mb-2 grid grid-cols-[1fr_8rem_7rem_2rem] gap-2">
            <input aria-label="Name" className={field} placeholder="Name" value={c.name} onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
            <select aria-label="Type" className={field} value={c.kind} onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, kind: e.target.value as Component["kind"] } : x)))}>
              <option value="earning">Allowance</option>
              <option value="deduction">Deduction</option>
            </select>
            <input
              aria-label="Amount"
              className={field}
              type="number"
              step="any"
              placeholder="₹ / month"
              value={c.amount}
              onChange={(e) => setComponents((cs) => cs.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))}
            />
            <button type="button" aria-label="Remove" className="rounded text-dark/50 hover:bg-red-50 hover:text-red-700" onClick={() => setComponents((cs) => cs.filter((_, j) => j !== i))}>
              ✕
            </button>
          </div>
        ))}
        <button type="button" className="text-sm font-semibold text-primary-dark hover:underline" onClick={() => setComponents((cs) => [...cs, { name: "", kind: "earning", amount: "" }])}>
          + Add allowance / deduction
        </button>
      </div>
    </div>
  );
}
