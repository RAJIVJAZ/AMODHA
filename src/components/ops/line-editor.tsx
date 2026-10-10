"use client";

import { useMemo, useState } from "react";

export type LineColumn = {
  key: string;
  label: string;
  type: "select" | "number" | "text" | "date" | "checkbox";
  options?: { value: string; label: string; hint?: string }[];
  placeholder?: string;
  width?: string;
  required?: boolean;
};

type Row = Record<string, string | boolean>;

/**
 * Editable rows (recipe materials, invoice lines, add-ons…) sent to the server as one JSON field.
 * Number columns become numbers; empty rows are dropped.
 */
export function LineEditor({
  name,
  columns,
  initial,
  addLabel = "Add line",
  minRows = 1,
  fixedRows = false,
}: {
  name: string;
  columns: LineColumn[];
  initial?: Row[];
  addLabel?: string;
  minRows?: number;
  fixedRows?: boolean;
}) {
  const blank = () => Object.fromEntries(columns.map((c) => [c.key, c.type === "checkbox" ? false : ""])) as Row;
  const [rows, setRows] = useState<Row[]>(() => {
    const start = initial?.length ? initial : [];
    return start.length >= minRows ? start : [...start, ...Array.from({ length: minRows - start.length }, blank)];
  });

  const value = useMemo(() => {
    const cleaned = rows
      .filter((r) => columns.some((c) => c.required && r[c.key] !== "" && r[c.key] !== false))
      .map((r) =>
        Object.fromEntries(
          columns
            .filter((c) => r[c.key] !== "")
            .map((c) => [c.key, c.type === "number" ? Number(r[c.key]) : r[c.key]])
        )
      );
    return JSON.stringify(cleaned);
  }, [rows, columns]);

  const update = (i: number, key: string, v: string | boolean) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  return (
    <div className="flex flex-col gap-2">
      <input type="hidden" name={name} value={value} />
      <div className="-mx-1 overflow-x-auto">
        <table className="w-full min-w-[520px] border-collapse text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-dark/55">
              {columns.map((c) => (
                <th key={c.key} className="px-1 pb-1 font-semibold" style={c.width ? { width: c.width } : undefined}>
                  {c.label}
                </th>
              ))}
              {fixedRows ? null : <th className="w-8" />}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                {columns.map((c) => (
                  <td key={c.key} className="px-1 py-1 align-top">
                    {c.type === "select" ? (
                      <select
                        aria-label={c.label}
                        value={String(row[c.key])}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        className="w-full rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      >
                        <option value="">{c.placeholder ?? "Choose…"}</option>
                        {c.options?.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </select>
                    ) : c.type === "checkbox" ? (
                      <input
                        aria-label={c.label}
                        type="checkbox"
                        checked={Boolean(row[c.key])}
                        onChange={(e) => update(i, c.key, e.target.checked)}
                        className="mt-2 h-4 w-4 accent-ink"
                      />
                    ) : (
                      <input
                        aria-label={c.label}
                        type={c.type === "number" ? "number" : c.type}
                        step={c.type === "number" ? "any" : undefined}
                        inputMode={c.type === "number" ? "decimal" : undefined}
                        placeholder={c.placeholder}
                        value={String(row[c.key])}
                        onChange={(e) => update(i, c.key, e.target.value)}
                        className="w-full rounded-lg border-2 border-ink/15 bg-white px-2 py-1.5 text-sm focus:border-primary focus:outline-none"
                      />
                    )}
                  </td>
                ))}
                {fixedRows ? null : (
                  <td className="px-1 py-1 align-top">
                    <button
                      type="button"
                      onClick={() => setRows((rs) => (rs.length > 1 ? rs.filter((_, j) => j !== i) : [blank()]))}
                      className="mt-1 rounded px-2 py-1 text-dark/50 hover:bg-red-50 hover:text-red-700"
                      aria-label="Remove line"
                    >
                      ✕
                    </button>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {fixedRows ? null : (
        <button type="button" onClick={() => setRows((rs) => [...rs, blank()])} className="self-start text-sm font-semibold text-primary-dark hover:underline">
          + {addLabel}
        </button>
      )}
    </div>
  );
}
