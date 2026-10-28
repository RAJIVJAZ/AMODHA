import { date } from "@/lib/ops/format";

// A reminder from ops_reminders() / _reminders_all(): a document to renew or a machine needing attention.
export type Reminder = {
  module: "compliance" | "equipment";
  kind: "document" | "document_missing" | "warranty" | "amc" | "service" | "not_working";
  id: string;
  name: string;
  detail: string | null;
  due: string | null;
  days_left: number | null;
  action: string;
};

export function reminderHref(r: Reminder) {
  return r.module === "compliance" ? `/ops/admin/documents?tab=due#doc-${r.id}` : `/ops/equipment/${r.id}`;
}

export function reminderWhen(r: Reminder) {
  if (r.kind === "document_missing") return "Expiry date not entered";
  if (r.days_left === null) return r.action;
  if (r.days_left < 0) return `${r.action} — ${-r.days_left} day${r.days_left === -1 ? "" : "s"} ago (${date(r.due)})`;
  if (r.days_left === 0) return `${r.action} — today`;
  return `${r.action} in ${r.days_left} day${r.days_left === 1 ? "" : "s"} (${date(r.due)})`;
}
