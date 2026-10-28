import Link from "next/link";
import type { Ops } from "@/lib/ops/context";
import { reminderHref, reminderWhen, type Reminder } from "@/lib/ops/reminders";

/**
 * Documents to renew and machines needing attention, for the staff member's own modules. Shown on Today and
 * the Dashboard every day until the renewal (with the next expiry date) or the repair is recorded.
 */
export async function RemindersPanel({ ops }: { ops: Ops }) {
  if (!ops.can("compliance") && !ops.can("equipment")) return null;
  const { data } = await ops.supabase.rpc("ops_reminders");
  const all = (data ?? []) as Reminder[];
  if (!all.length) return null;
  const urgent = all.filter((r) => (r.days_left !== null && r.days_left < 0) || r.kind === "not_working");
  const docs = all.filter((r) => r.module === "compliance" && r.kind !== "document_missing");
  const missing = all.filter((r) => r.kind === "document_missing");
  const machines = all.filter((r) => r.module === "equipment");
  const shown = [...docs, ...machines].slice(0, 8);

  return (
    <section className={`rounded-2xl border-2 p-4 ${urgent.length ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`} aria-label="Reminders">
      <h2 className="font-heading text-lg font-bold text-ink">
        ⏰ Needs attention{docs.length ? ` · ${docs.length} document${docs.length === 1 ? "" : "s"} to renew` : ""}
        {machines.length ? ` · ${machines.length} machine item${machines.length === 1 ? "" : "s"}` : ""}
      </h2>
      {shown.length ? (
        <ul className="mt-2 flex flex-col gap-1.5 text-sm">
          {shown.map((r) => (
            <li key={`${r.kind}-${r.id}`}>
              <Link href={reminderHref(r)} className="flex flex-wrap items-baseline gap-x-2 hover:underline">
                <span className={`font-semibold ${r.days_left !== null && r.days_left < 0 ? "text-red-700" : "text-ink"}`}>{r.name}</span>
                <span className="text-dark/65">{reminderWhen(r)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
      {missing.length ? (
        <p className="mt-2 text-sm text-dark/70">
          <Link href="/ops/admin/documents?tab=checklist" className="font-semibold text-primary-dark hover:underline">
            {missing.length} document{missing.length === 1 ? "" : "s"} on the checklist without an expiry date →
          </Link>
        </p>
      ) : null}
      <p className="mt-2 text-xs text-dark/55">This reminder repeats every day until the renewal or repair is recorded.</p>
    </section>
  );
}
