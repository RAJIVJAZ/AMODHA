import { getOps } from "@/lib/ops/context";
import { todayIST } from "@/lib/ops/format";
import { endReasons, type AttendanceRow, type GapRow, type ReportRow, type SessionRow } from "@/lib/staff/types";

type Cell = string | number | boolean | null | undefined;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

function cell(v: Cell) {
  if (v === null || v === undefined) return "";
  let s = String(v);
  if (typeof v === "string" && /^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
const mins = (s: number) => Math.round(Number(s ?? 0) / 60);

// Staff activity exports. Same permission as the screens (staff_monitoring export), logged as exports,
// and with session references only — never raw session or sign-in identifiers.
export async function GET(request: Request, { params }: { params: Promise<{ report: string }> }) {
  const { report } = await params;
  const ops = await getOps();
  if (!ops) return new Response("Please sign in", { status: 401 });
  if (!ops.can("staff_monitoring", "export")) return new Response("You do not have permission to export staff activity", { status: 403 });
  const url = new URL(request.url);
  const today = todayIST();
  const from = DATE.test(url.searchParams.get("from") ?? "") ? (url.searchParams.get("from") as string) : today;
  const to = DATE.test(url.searchParams.get("to") ?? "") ? (url.searchParams.get("to") as string) : today;
  const user = UUID.test(url.searchParams.get("user") ?? "") ? url.searchParams.get("user") : null;

  let columns: string[] = [];
  let rows: Cell[][] = [];
  try {
    if (report === "sessions") {
      const { data, error } = await ops.supabase.rpc("staff_session_history", { p_from: from, p_to: to, p_user_id: user, p_reason: url.searchParams.get("reason") || null, p_limit: 5000 });
      if (error) throw new Error(error.message);
      columns = ["Session", "Employee", "Email", "Role at sign-in", "App", "Device", "Signed in", "Signed out", "Ended by", "No sign-out recorded", "Signed-in min", "Active min", "Idle min", "Min since last business action", "Business actions", "Refused actions", "Drafts at sign-out"];
      rows = ((data ?? []) as SessionRow[]).map((r) => [r.ref, r.name, r.email, r.owner ? "owner" : r.roles.join(" "), r.portal, r.device, r.started_at, r.ended_at, r.end_reason ? endReasons[r.end_reason] ?? r.end_reason : r.status, r.interrupted, mins(r.logged_in_seconds), mins(r.active_seconds), mins(r.idle_seconds), mins(r.since_business_seconds), r.business_actions, r.failed_actions, r.save_status]);
    } else if (report === "report") {
      const { data, error } = await ops.supabase.rpc("staff_activity_report", { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      columns = ["Employee", "Email", "Department", "Current roles", "Sessions", "Signed-in min", "Active min", "Idle min", "Min in sessions without business actions", "Manual logouts", "Timeouts", "Interrupted", "Revoked", "Business actions", "Refused actions", "Orders", "Batches", "Dispatches", "Finance entries"];
      rows = ((data ?? []) as ReportRow[]).filter((r) => !user || r.user_id === user).map((r) => [r.name, r.email, r.department, r.current_roles.join(" "), r.sessions, mins(r.logged_in_seconds), mins(r.active_seconds), mins(r.idle_seconds), mins(r.no_business_seconds), r.manual_logouts, r.timeouts, r.interrupted, r.revoked, r.business_actions, r.failed_actions, r.orders_processed, r.batches_updated, r.dispatches_completed, r.finance_entries]);
    } else if (report === "inactivity") {
      const { data, error } = await ops.supabase.rpc("staff_inactivity_report", { p_from: from, p_to: to, p_min_idle_minutes: Number(url.searchParams.get("idle") ?? 5) || 5, p_min_no_action_minutes: Number(url.searchParams.get("noact") ?? 60) || 60, p_user_id: user });
      if (error) throw new Error(error.message);
      columns = ["Employee", "Roles", "Type", "From", "To", "Minutes", "Session", "App", "Module"];
      rows = ((data ?? []) as GapRow[]).map((r) => [r.name, r.roles.join(" "), r.type === "no_interaction" ? "No application interaction detected" : "No recorded business action", r.from, r.to, r.minutes, r.session, r.portal, r.module]);
    } else if (report === "attendance") {
      const { data, error } = await ops.supabase.rpc("staff_attendance", { p_from: from, p_to: to });
      if (error) throw new Error(error.message);
      columns = ["Day", "Employee", "Department", "Shift start", "Shift end", "First sign-in", "Last session end", "Sessions", "Signed-in min", "Active min", "Idle min", "Interrupted", "Manual logouts", "Timeouts"];
      rows = ((data ?? []) as AttendanceRow[]).filter((r) => !user || r.user_id === user).map((r) => [r.day, r.name, r.department, r.shift_start, r.shift_end, r.first_login, r.last_end, r.sessions, mins(r.logged_in_seconds), mins(r.active_seconds), mins(r.idle_seconds), r.interrupted, r.manual_logouts, r.timeouts]);
    } else {
      return new Response("Unknown report", { status: 404 });
    }
    await ops.supabase.rpc("ops_log_export", { p_report: `staff-${report}`, p_rows: rows.length, p_params: { from, to, user } });
  } catch (error) {
    return new Response(error instanceof Error ? error.message : "Export failed", { status: 400 });
  }
  const body = "﻿" + [columns, ...rows].map((r) => r.map(cell).join(",")).join("\r\n") + "\r\n";
  return new Response(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="mithaiwallah-staff-${report}-${from}-to-${to}.csv"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
