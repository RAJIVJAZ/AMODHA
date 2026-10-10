import Link from "next/link";

// Shared building blocks for the business app. Plain, fast and readable on a factory phone.

export function PageHeader({ title, description, actions }: { title: string; description?: React.ReactNode; actions?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="font-heading text-2xl font-bold text-ink sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 max-w-3xl text-sm text-dark/65">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function Card({ title, description, children, actions, id, className = "" }: {
  title?: string; description?: React.ReactNode; children: React.ReactNode; actions?: React.ReactNode; id?: string; className?: string;
}) {
  return (
    <section id={id} className={`scroll-mt-20 rounded-2xl border border-ink/10 bg-white p-4 shadow-sm sm:p-5 ${className}`}>
      {title || actions ? (
        <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
          <div>
            {title ? <h2 className="font-heading text-lg font-bold text-ink">{title}</h2> : null}
            {description ? <p className="text-sm text-dark/60">{description}</p> : null}
          </div>
          {actions}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function Stat({ label, value, hint, tone = "default", href }: {
  label: string; value: React.ReactNode; hint?: React.ReactNode; tone?: "default" | "good" | "warn" | "bad"; href?: string;
}) {
  const tones = { default: "border-ink/10", good: "border-emerald-300", warn: "border-amber-300", bad: "border-accent" };
  const body = (
    <div className={`h-full rounded-2xl border-2 bg-white p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-dark/55">{label}</p>
      <p className="mt-1 font-heading text-2xl font-bold text-ink">{value}</p>
      {hint ? <p className="mt-1 text-xs text-dark/60">{hint}</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block transition hover:-translate-y-0.5">
      {body}
    </Link>
  ) : (
    body
  );
}

const badgeTones: Record<string, string> = {
  good: "bg-emerald-100 text-emerald-800",
  warn: "bg-amber-100 text-amber-800",
  bad: "bg-red-100 text-red-800",
  info: "bg-sky-100 text-sky-800",
  muted: "bg-ink/5 text-dark/60",
};

const statusTone: Record<string, keyof typeof badgeTones> = {
  planned: "info", materials_issued: "info", in_production: "warn", production_completed: "warn", awaiting_qc: "warn",
  qc_approved: "good", qc_rejected: "bad", packaging: "warn", packaging_completed: "info", released: "good",
  partially_dispatched: "info", fully_dispatched: "good", closed: "muted", cancelled: "muted",
  awaiting_payment: "muted", confirmed: "info", processing: "warn", picking: "warn", packed: "warn", ready_for_dispatch: "info",
  dispatched: "good", out_for_delivery: "good", partially_delivered: "warn", delivered: "good", delivery_failed: "bad", returned: "bad",
  available: "good", hold: "warn", quarantine: "warn", rejected: "bad",
  posted: "good", pending_approval: "warn", approved: "good", paid: "good", draft: "muted", unpaid: "warn", partly_paid: "warn",
  active: "good", paused: "warn", scheduled: "info", skipped: "muted", locked: "info", failed: "bad", retired: "muted",
};

export function Badge({ children, tone }: { children: React.ReactNode; tone?: keyof typeof badgeTones }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${badgeTones[tone ?? "muted"]}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string | null | undefined }) {
  if (!status) return null;
  return <Badge tone={statusTone[status] ?? "muted"}>{status.replace(/_/g, " ")}</Badge>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl bg-ink/5 px-4 py-6 text-center text-sm text-dark/60">{children}</p>;
}

export function Table({ head, children, compact }: { head: React.ReactNode[]; children: React.ReactNode; compact?: boolean }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className={`w-full min-w-[560px] border-collapse text-left ${compact ? "text-xs" : "text-sm"}`}>
        <thead>
          <tr className="border-b-2 border-ink/10 text-xs uppercase tracking-wide text-dark/55">
            {head.map((h, i) => (
              <th key={i} className="px-3 py-2 font-semibold first:pl-4 sm:first:pl-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink/5">{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "", right }: { children?: React.ReactNode; className?: string; right?: boolean }) {
  return <td className={`px-3 py-2 align-top first:pl-4 sm:first:pl-3 ${right ? "text-right tabular-nums" : ""} ${className}`}>{children}</td>;
}

// Form fields ---------------------------------------------------------------------------
const inputClass =
  "w-full rounded-lg border-2 border-ink/15 bg-white px-3 py-2 text-sm text-ink focus:border-primary focus:outline-none disabled:bg-ink/5";

export function Field({ label, hint, children, className = "" }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={`flex min-w-0 flex-col gap-1 text-sm ${className}`}>
      <span className="font-semibold text-ink">{label}</span>
      {children}
      {hint ? <span className="text-xs text-dark/55">{hint}</span> : null}
    </label>
  );
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: React.ReactNode; wrapClass?: string };

export function Input({ label, hint, wrapClass, className = "", ...rest }: InputProps) {
  return (
    <Field label={label} hint={hint} className={wrapClass}>
      <input className={`${inputClass} ${className}`} {...rest} />
    </Field>
  );
}

export function NumberInput(props: InputProps) {
  return <Input type="number" inputMode="decimal" step="any" {...props} />;
}

export function TextArea({ label, hint, wrapClass, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: React.ReactNode; wrapClass?: string }) {
  return (
    <Field label={label} hint={hint} className={wrapClass}>
      <textarea rows={2} className={inputClass} {...rest} />
    </Field>
  );
}

export function Select({ label, hint, options, placeholder, wrapClass, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement> & {
  label: string; hint?: React.ReactNode; options: { value: string; label: string }[]; placeholder?: string; wrapClass?: string;
}) {
  return (
    <Field label={label} hint={hint} className={wrapClass}>
      <select className={inputClass} {...rest}>
        {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

export function Checkbox({ label, name, defaultChecked }: { label: string; name: string; defaultChecked?: boolean }) {
  return (
    <label className="flex items-center gap-2 text-sm font-semibold text-ink">
      <input type="hidden" name={name} value="false" />
      <input type="checkbox" name={name} value="true" defaultChecked={defaultChecked} className="h-4 w-4 accent-ink" />
      {label}
    </label>
  );
}

export function Grid({ children, cols = 2 }: { children: React.ReactNode; cols?: 2 | 3 | 4 }) {
  const c = { 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3", 4: "sm:grid-cols-2 lg:grid-cols-4" };
  return <div className={`grid grid-cols-1 gap-3 ${c[cols]}`}>{children}</div>;
}

export function ButtonLink({ href, children, variant = "primary" }: { href: string; children: React.ReactNode; variant?: "primary" | "secondary" }) {
  return (
    <Link
      href={href}
      className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-semibold transition ${
        variant === "primary" ? "bg-ink text-white hover:bg-ink-light" : "border-2 border-ink/20 bg-white text-ink hover:border-ink/50"
      }`}
    >
      {children}
    </Link>
  );
}

export function Tabs({ items, current }: { items: { href: string; label: string; key: string }[]; current: string }) {
  return (
    <nav className="mb-4 flex flex-wrap gap-2" aria-label="Sections">
      {items.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          aria-current={t.key === current ? "page" : undefined}
          className={`rounded-full px-3 py-1.5 text-sm font-semibold ${t.key === current ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15 hover:ring-ink/40"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

export function Notice({ tone = "info", children }: { tone?: "info" | "warn" | "bad" | "good"; children: React.ReactNode }) {
  const t = { info: "bg-sky-50 border-sky-200 text-sky-900", warn: "bg-amber-50 border-amber-200 text-amber-900", bad: "bg-red-50 border-red-200 text-red-900", good: "bg-emerald-50 border-emerald-200 text-emerald-900" };
  return <div className={`rounded-xl border px-4 py-3 text-sm ${t[tone]}`}>{children}</div>;
}
