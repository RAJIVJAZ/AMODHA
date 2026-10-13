// Shapes returned by the staff monitoring functions (supabase/migrations/20261014100000_staff_activity_monitoring.sql).

export type SessionRow = {
  id: string;
  ref: string;
  user_id: string;
  name: string;
  email: string | null;
  roles: string[];
  owner: boolean;
  portal: string;
  device: string | null;
  user_agent: string | null;
  ip: string | null;
  started_at: string;
  last_interaction_at: string;
  last_seen_at: string;
  last_business_action_at: string | null;
  last_business_action: string | null;
  business_actions: number;
  failed_actions: number;
  status: string;
  status_label: string;
  end_reason: string | null;
  ended_at: string | null;
  invalidated_at: string | null;
  interrupted: boolean;
  save_status: string | null;
  end_note: string | null;
  idle_seconds_now: number | null;
  effective_end: string;
  logged_in_seconds: number;
  active_seconds: number;
  idle_seconds: number;
  since_business_seconds: number;
};

export type ReportRow = {
  user_id: string;
  name: string;
  email: string | null;
  department: string | null;
  active: boolean;
  current_roles: string[];
  sessions: number;
  logged_in_seconds: number;
  active_seconds: number;
  idle_seconds: number;
  no_business_seconds: number;
  timeouts: number;
  manual_logouts: number;
  interrupted: number;
  revoked: number;
  business_actions: number;
  failed_actions: number;
  by_module: Record<string, number>;
  orders_processed: number;
  batches_updated: number;
  dispatches_completed: number;
  finance_entries: number | null;
};

export type TimelineRow = {
  at: string;
  kind: string;
  module?: string | null;
  path?: string | null;
  action?: string;
  entity?: string;
  entity_id?: string | null;
  reason?: string | null;
  error_code?: string | null;
  minutes?: number;
  until?: string;
  session?: string | null;
  detail?: Record<string, unknown> | null;
};

export type GapRow = { type: "no_interaction" | "no_business_action"; user_id: string; name: string; roles: string[]; session: string; portal: string; module: string | null; from: string; to: string; minutes: number };

export type AttendanceRow = {
  day: string;
  user_id: string;
  name: string;
  department: string | null;
  shift_start: string | null;
  shift_end: string | null;
  first_login: string;
  last_end: string;
  sessions: number;
  logged_in_seconds: number;
  active_seconds: number;
  idle_seconds: number;
  interrupted: number;
  manual_logouts: number;
  timeouts: number;
};

export const statusLabels: Record<string, { label: string; tone: "good" | "warn" | "bad" | "info" | "muted" }> = {
  active_interaction: { label: "Active interaction detected", tone: "good" },
  no_recent_interaction: { label: "No recent interaction", tone: "warn" },
  idle: { label: "Idle", tone: "warn" },
  logged_out: { label: "Logged out", tone: "muted" },
  session_expired: { label: "Session expired (inactivity)", tone: "info" },
  revoked: { label: "Revoked by administrator", tone: "bad" },
  disconnected: { label: "Disconnected / no sign-out", tone: "warn" },
  ended: { label: "Ended", tone: "muted" },
};

export const endReasons: Record<string, string> = {
  manual: "Manual logout",
  idle_timeout: "Automatic idle timeout",
  revoked: "Revoked by administrator",
  expired: "Expired (browser stopped reporting)",
  absolute_timeout: "Maximum session length",
  deactivated: "Account deactivated",
  security: "Security / sign-in removed",
};

/** 1h 05m */
export function hm(seconds: number | null | undefined) {
  const s = Math.max(Number(seconds ?? 0), 0);
  const h = Math.floor(s / 3600);
  const m = Math.round((s % 3600) / 60);
  return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}
