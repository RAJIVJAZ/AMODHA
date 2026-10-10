"use client";

import { useMemo, useState } from "react";

type Option = { key: string; label: string };

/** Module × action checkboxes for one role, sent as p_permissions: [{module, action}]. */
export function PermissionMatrix({ modules, actions, initial, disabled }: { modules: Option[]; actions: Option[]; initial: string[]; disabled?: boolean }) {
  const [on, setOn] = useState(() => new Set(initial));
  const value = useMemo(
    () =>
      JSON.stringify(
        [...on].map((k) => {
          const [module, action] = k.split(".");
          return { module, action };
        })
      ),
    [on]
  );
  const toggle = (k: string) =>
    setOn((s) => {
      const next = new Set(s);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      // Any other permission on a module needs "view" too.
      const [module, action] = k.split(".");
      if (next.has(k) && action !== "view") next.add(`${module}.view`);
      if (!next.has(k) && action === "view") for (const a of actions) next.delete(`${module}.${a.key}`);
      return next;
    });

  return (
    <div className="-mx-1 overflow-x-auto">
      <input type="hidden" name="p_permissions#json" value={value} />
      <table className="w-full min-w-[560px] text-sm">
        <thead>
          <tr className="text-left text-xs uppercase tracking-wide text-dark/55">
            <th className="px-1 pb-1">Module</th>
            {actions.map((a) => (
              <th key={a.key} className="px-1 pb-1 text-center">
                {a.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {modules.map((m) => (
            <tr key={m.key} className="border-t border-ink/5">
              <td className="px-1 py-1 font-semibold text-ink">{m.label}</td>
              {actions.map((a) => {
                const k = `${m.key}.${a.key}`;
                return (
                  <td key={a.key} className="px-1 py-1 text-center">
                    <input
                      type="checkbox"
                      aria-label={`${m.label}: ${a.label}`}
                      className="h-4 w-4 accent-ink"
                      checked={on.has(k)}
                      disabled={disabled}
                      onChange={() => toggle(k)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
