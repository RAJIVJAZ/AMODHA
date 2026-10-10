const IST = "Asia/Kolkata";

export function inr(value: number | string | null | undefined, decimals = 2) {
  const n = Number(value ?? 0);
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(n);
}

export function qty(value: number | string | null | undefined, unit?: string | null) {
  const n = Number(value ?? 0);
  const text = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(n);
  return unit ? `${text} ${unit}` : text;
}

export function pct(value: number | string | null | undefined) {
  return value === null || value === undefined ? "—" : `${Number(value).toFixed(1)}%`;
}

export function date(value: string | null | undefined) {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: IST });
}

export function dateTime(value: string | null | undefined) {
  if (!value) return "—";
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: IST });
}

/** Today's date in India as YYYY-MM-DD. */
export function todayIST(offsetDays = 0) {
  const now = new Date(Date.now() + offsetDays * 86400000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: IST, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function label(value: string | null | undefined) {
  return (value ?? "").replace(/_/g, " ");
}

/** Reads a search param as a single string. */
export function param(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}
