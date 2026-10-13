"use server";

import { createClient } from "@/lib/supabase/server";

// Session and draft calls made by the staff apps from the browser. The database stamps every time and
// enforces the rules; nothing here trusts a time or a state sent by the browser.

type Result<T> = { ok: true; data: T } | { ok: false; message: string; ended?: boolean };

async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<Result<T>> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, args);
  if (error) return { ok: false, message: error.message, ended: /session has ended|Please sign in/i.test(error.message) };
  return { ok: true, data: data as T };
}

export type SessionState = { state: "active" | "ended"; reason?: string; idle_seconds?: number; timeout_seconds?: number; expires_at?: string };

/** A real user interaction (or a navigation) in a staff app. */
export async function staffPing(kind: "interaction" | "navigation", path: string) {
  return call<SessionState>("staff_activity_ping", { p_kind: kind, p_path: path.slice(0, 200) });
}

/** Background check: is this session still live? Never extends it. */
export async function staffStatus() {
  return call<SessionState>("staff_session_status");
}

/** Sign-out after the app has tried to save drafts; saveStatus is what that save step reported. */
export async function staffEnd(reason: "manual" | "idle_timeout", saveStatus: "saved" | "failed" | "nothing_pending", note?: string) {
  return call<SessionState>("staff_session_end", { p_reason: reason, p_save_status: saveStatus, p_note: note ?? null });
}

export async function staffSaveDraft(key: string, data: Record<string, unknown>) {
  return call<string>("staff_save_draft", { p_key: key.slice(0, 200), p_data: data });
}

export async function staffGetDraft(key: string) {
  return call<{ data: Record<string, unknown>; updated_at: string } | null>("staff_get_draft", { p_key: key.slice(0, 200) });
}

export async function staffDiscardDraft(key: string) {
  return call<null>("staff_discard_draft", { p_key: key.slice(0, 200) });
}

export async function staffAcknowledge(version: string) {
  return call<null>("staff_acknowledge_policy", { p_version: version });
}
