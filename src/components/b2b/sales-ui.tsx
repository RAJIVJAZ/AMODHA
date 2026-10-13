import Link from "next/link";
import { statusTone } from "@/lib/b2b/labels";

// Small building blocks for the Sales app: big, readable and quick to tap on a phone.

export function Tile({ label, value, hint, href, tone = "default" }: { label: string; value: React.ReactNode; hint?: React.ReactNode; href?: string; tone?: "default" | "good" | "warn" }) {
  const border = { default: "border-transparent", good: "border-emerald-300", warn: "border-amber-300" }[tone];
  const body = (
    <div className={`h-full rounded-2xl border-2 bg-white p-3 ${border}`}>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-dark/55">{label}</p>
      <p className="mt-0.5 font-heading text-2xl font-bold text-ink">{value}</p>
      {hint ? <p className="text-xs text-dark/60">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block active:scale-[0.99]">
      {body}
    </Link>
  ) : (
    body
  );
}

export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="mt-5">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export function StatusPill({ label }: { label: string }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${statusTone(label)}`}>{label}</span>;
}

export function EmptyNote({ children }: { children: React.ReactNode }) {
  return <p className="rounded-2xl bg-white px-4 py-6 text-center text-sm text-dark/60">{children}</p>;
}

export function BigButton({ href, children, tone = "accent" }: { href: string; children: React.ReactNode; tone?: "accent" | "ink" }) {
  return (
    <Link href={href} className={`flex min-h-14 items-center justify-center rounded-2xl px-4 text-center text-base font-bold text-white shadow ${tone === "accent" ? "bg-accent" : "bg-ink"}`}>
      {children}
    </Link>
  );
}
