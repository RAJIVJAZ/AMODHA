"use client";

import { useMemo, useState } from "react";

export type JsonField = {
  key: string;
  label: string;
  type?: "text" | "number" | "date" | "checkbox";
  options?: (string | { value: string; label: string })[];
  required?: boolean;
  defaultValue?: string | number | boolean | null;
  placeholder?: string;
  hint?: string;
  wide?: boolean;
};

const fieldClass = "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm focus:border-primary focus:outline-none";

/**
 * A group of fields sent as one JSON object (for functions that take a single jsonb argument).
 * `fixed` values (an id when editing, a fixed type) are always included.
 */
export function JsonObjectFields({ name, fields, fixed = {}, cols = 3 }: { name: string; fields: JsonField[]; fixed?: Record<string, unknown>; cols?: 2 | 3 | 4 }) {
  const [values, setValues] = useState<Record<string, string | boolean>>(() =>
    Object.fromEntries(fields.map((f) => [f.key, f.type === "checkbox" ? Boolean(f.defaultValue) : f.defaultValue === null || f.defaultValue === undefined ? "" : String(f.defaultValue)]))
  );
  const json = useMemo(() => {
    const out: Record<string, unknown> = { ...fixed };
    for (const f of fields) {
      const v = values[f.key];
      if (f.type === "checkbox") out[f.key] = Boolean(v);
      else if (v === "") out[f.key] = null;
      else out[f.key] = f.type === "number" ? Number(v) : v;
    }
    return JSON.stringify(out);
  }, [values, fields, fixed]);
  const grid = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" }[cols];

  return (
    <div className={`grid grid-cols-1 gap-3 ${grid}`}>
      <input type="hidden" name={name} value={json} />
      {fields.map((f) => (
        <label key={f.key} className={`flex min-w-0 flex-col gap-1 text-sm ${f.wide ? "sm:col-span-2" : ""} ${f.type === "checkbox" ? "justify-end" : ""}`}>
          {f.type === "checkbox" ? (
            <span className="flex items-center gap-2 font-semibold text-ink">
              <input type="checkbox" className="h-4 w-4 accent-ink" checked={Boolean(values[f.key])} onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.checked }))} />
              {f.label}
            </span>
          ) : (
            <>
              <span className="font-semibold text-ink">
                {f.label}
                {f.required ? <span className="text-accent-dark"> *</span> : null}
              </span>
              {f.options ? (
                <select className={fieldClass} required={f.required} value={String(values[f.key])} onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}>
                  <option value="">Choose…</option>
                  {f.options.map((o) => {
                    const opt = typeof o === "string" ? { value: o, label: o.replace(/_/g, " ") } : o;
                    return (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  className={fieldClass}
                  type={f.type ?? "text"}
                  step={f.type === "number" ? "any" : undefined}
                  inputMode={f.type === "number" ? "decimal" : undefined}
                  required={f.required}
                  placeholder={f.placeholder}
                  value={String(values[f.key])}
                  onChange={(e) => setValues((s) => ({ ...s, [f.key]: e.target.value }))}
                />
              )}
            </>
          )}
          {f.hint ? <span className="text-xs text-dark/55">{f.hint}</span> : null}
        </label>
      ))}
    </div>
  );
}
