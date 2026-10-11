import Link from "next/link";
import { MilkEntry, type Farmer } from "@/components/ops/milk-entry";
import { Badge, Empty } from "@/components/ops/ui";
import { requireOps } from "@/lib/ops/context";
import { inr, qty, todayIST } from "@/lib/ops/format";

export const metadata = { title: "Record milk" };

type Row = {
  id: string; collection_no: string; shift: string; qty_accepted: number; qty_rejected: number; fat_pct: number | null; snf_pct: number | null;
  rate_per_litre: number; amount: number; quality_flags: string[]; created_at: string; suppliers: { name: string } | null;
};

export default async function MilkEntryPage() {
  const ops = await requireOps("procurement");
  const today = todayIST();
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));

  const [{ data: sups }, { data: recent }, { data: todays }] = await Promise.all([
    ops.supabase.from("suppliers").select("id, code, name, kind, village").eq("is_active", true).order("name"),
    // Each farmer's latest rate and fat, to fill in the rate.
    ops.supabase
      .from("milk_collections")
      .select("supplier_id, rate_per_litre, fat_pct, collected_on")
      .eq("status", "posted")
      .gte("collected_on", todayIST(-60))
      .order("collected_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000),
    ops.supabase
      .from("milk_collections")
      .select("id, collection_no, shift, qty_accepted, qty_rejected, fat_pct, snf_pct, rate_per_litre, amount, quality_flags, created_at, suppliers(name)")
      .eq("collected_on", today)
      .eq("status", "posted")
      .order("created_at", { ascending: false }),
  ]);

  const last = new Map<string, { rate: number; fat: number | null }>();
  for (const r of (recent ?? []) as { supplier_id: string; rate_per_litre: number; fat_pct: number | null }[]) {
    if (!last.has(r.supplier_id)) last.set(r.supplier_id, { rate: Number(r.rate_per_litre), fat: r.fat_pct === null ? null : Number(r.fat_pct) });
  }
  const all = (sups ?? []) as { id: string; code: string; name: string; kind: string; village: string | null }[];
  // Farmers first, then the ones delivering most recently.
  const farmers: Farmer[] = all
    .sort((a, b) => Number(b.kind === "farmer") - Number(a.kind === "farmer") || Number(last.has(b.id)) - Number(last.has(a.id)) || a.name.localeCompare(b.name))
    .map((s) => ({ id: s.id, code: s.code, name: s.name, village: s.village, lastRate: last.get(s.id)?.rate ?? null, lastFat: last.get(s.id)?.fat ?? null }));

  const rows = (todays ?? []) as unknown as Row[];
  const sum = (shift?: string) => rows.filter((r) => !shift || r.shift === shift).reduce((s, r) => s + Number(r.qty_accepted), 0);
  const payable = rows.reduce((s, r) => s + Number(r.amount), 0);

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Record milk</h1>
          <p className="text-sm text-dark/60">
            Today: {qty(sum())} L accepted (AM {qty(sum("morning"))} · PM {qty(sum("evening"))}) · {inr(payable, 0)}
          </p>
        </div>
        <Link href="/ops/procurement" className="shrink-0 text-sm font-semibold text-primary-dark">
          Register →
        </Link>
      </div>

      {ops.can("procurement", "create") ? (
        farmers.length ? (
          <section className="rounded-2xl border border-ink/10 bg-white p-4 shadow-sm">
            <MilkEntry farmers={farmers} today={today} defaultShift={hour < 14 ? "morning" : "evening"} />
          </section>
        ) : (
          <Empty>
            No farmers yet. Add them under{" "}
            <Link href="/ops/procurement?tab=suppliers" className="font-semibold text-primary-dark underline">
              Farmers &amp; suppliers
            </Link>
            .
          </Empty>
        )
      ) : null}

      <section>
        <h2 className="mb-2 text-sm font-bold uppercase tracking-wide text-dark/55">Collected today</h2>
        {rows.length ? (
          <ul className="flex flex-col gap-2">
            {rows.map((r) => (
              <li key={r.id} className="rounded-xl border border-ink/10 bg-white px-4 py-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-ink">{r.suppliers?.name}</p>
                    <p className="text-xs text-dark/55">
                      {r.collection_no} · {r.shift === "morning" ? "Morning" : "Evening"}
                      {r.fat_pct !== null ? ` · fat ${r.fat_pct}%` : ""}
                      {r.snf_pct !== null ? ` · SNF ${r.snf_pct}%` : ""}
                    </p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="font-heading text-lg font-bold text-ink">{qty(r.qty_accepted)} L</p>
                    <p className="text-xs text-dark/60">{inr(r.amount, 0)}</p>
                  </div>
                </div>
                {Number(r.qty_rejected) || r.quality_flags?.length ? (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {Number(r.qty_rejected) ? <Badge tone="bad">{qty(r.qty_rejected)} L rejected</Badge> : null}
                    {(r.quality_flags ?? []).map((f) => (
                      <Badge key={f} tone="warn">
                        {f}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No milk recorded today yet.</Empty>
        )}
        <p className="mt-2 text-xs text-dark/55">A wrong entry can be cancelled from the register.</p>
      </section>
    </div>
  );
}
