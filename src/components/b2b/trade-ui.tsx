import Link from "next/link";
import { statusTone } from "@/lib/b2b/labels";

/** Small building blocks shared by the Wholesale app's pages (server-safe). */

export function StatusPill({ label }: { label: string }) {
  return <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ${statusTone(label)}`}>{label}</span>;
}

export function Card({ title, action, children, id, className = "" }: { title?: string; action?: React.ReactNode; children: React.ReactNode; id?: string; className?: string }) {
  return (
    <section id={id} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5 sm:p-5 ${className}`}>
      {title ? (
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
          {action}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function PageTitle({ title, subtitle, back }: { title: string; subtitle?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-4">
      {back ? (
        <Link href={back.href} className="mb-1 inline-flex min-h-11 items-center text-sm font-semibold text-primary-dark">
          ← {back.label}
        </Link>
      ) : null}
      <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
      {subtitle ? <div className="mt-1 text-sm text-dark/65">{subtitle}</div> : null}
    </div>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const tones = {
    info: "border-sky-200 bg-sky-50 text-sky-900",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    bad: "border-red-300 bg-red-50 text-red-900",
    good: "border-emerald-300 bg-emerald-50 text-emerald-900",
  };
  return <div className={`rounded-2xl border-2 px-4 py-3 text-sm ${tones[tone]}`}>{children}</div>;
}

export function SupportLinks({ support }: { support: { phone?: string; whatsapp?: string; email?: string } | null }) {
  const phone = support?.phone?.trim();
  const wa = support?.whatsapp?.replace(/\D/g, "");
  const email = support?.email?.trim();
  const a = "flex min-h-11 items-center gap-2 rounded-xl border-2 border-ink/10 bg-white px-4 text-sm font-semibold text-ink hover:border-primary";
  if (!phone && !wa && !email) return <p className="text-sm text-dark/60">Contact your salesperson for help.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {phone ? (
        <a href={`tel:${phone.replace(/[^\d+]/g, "")}`} className={a}>
          <span aria-hidden="true">📞</span> {phone}
        </a>
      ) : null}
      {wa ? (
        <a href={`https://wa.me/${wa}`} target="_blank" rel="noopener noreferrer" className={a}>
          <span aria-hidden="true">💬</span> WhatsApp
        </a>
      ) : null}
      {email ? (
        <a href={`mailto:${email}`} className={a}>
          <span aria-hidden="true">✉️</span> {email}
        </a>
      ) : null}
    </div>
  );
}

export function ErrorBox({ message }: { message: string }) {
  return (
    <Notice tone="bad">
      <p className="font-semibold">Something went wrong loading this page.</p>
      <p className="mt-1">{message}</p>
    </Notice>
  );
}

/** wa.me link for an Indian mobile number. */
export function waLink(phone: string | null | undefined) {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return null;
  return `https://wa.me/${digits.length === 10 ? `91${digits}` : digits}`;
}
