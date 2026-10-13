"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { staffDiscardDraft, staffGetDraft, staffSaveDraft } from "@/lib/staff/actions";

// Autosaving drafts of unfinished staff forms.
//  * Saves to the server shortly after typing stops (a draft never posts or approves anything).
//  * If the server save fails, the draft is kept on this device and shown as "pending sync"; it is sent
//    again on the next change or when the app signs in again.
//  * Before any sign-out (manual or inactivity) the session guard calls flushDrafts(), which waits for
//    every pending save up to a deadline and reports honestly whether they reached the server.

export type SaveStatus = "idle" | "saving" | "saved" | "failed" | "pending";
type Flusher = () => Promise<"saved" | "failed" | "nothing_pending">;

const flushers = new Set<Flusher>();
const LOCAL = "mw:draft:";

export function registerFlusher(f: Flusher) {
  flushers.add(f);
  return () => {
    flushers.delete(f);
  };
}

/** Save every pending draft now. "failed" if any did not reach the server before the deadline. */
export async function flushDrafts(deadlineMs = 8000): Promise<"saved" | "failed" | "nothing_pending"> {
  if (!flushers.size) return "nothing_pending";
  const timeout = new Promise<"failed">((resolve) => setTimeout(() => resolve("failed"), deadlineMs));
  const results = await Promise.all([...flushers].map((f) => Promise.race([f().catch(() => "failed" as const), timeout])));
  if (results.includes("failed")) return "failed";
  return results.includes("saved") ? "saved" : "nothing_pending";
}

function readLocal(key: string): { data: Record<string, unknown>; at: string } | null {
  try {
    const raw = localStorage.getItem(LOCAL + key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}
function writeLocal(key: string, data: Record<string, unknown> | null) {
  try {
    if (data) localStorage.setItem(LOCAL + key, JSON.stringify({ data, at: new Date().toISOString() }));
    else localStorage.removeItem(LOCAL + key);
  } catch {
    // Storage full or blocked: the server copy is the only copy.
  }
}

/**
 * Autosave for one form. `read()` returns the current values (or null when there is nothing worth saving).
 * Call `changed()` whenever the user edits; `discard()` after a successful submit.
 */
export function useAutosave(key: string | null, read: () => Record<string, unknown> | null, debounceMs = 1500) {
  const [status, setStatus] = useState<SaveStatus>("idle");
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [restorable, setRestorable] = useState<{ data: Record<string, unknown>; at: string; local: boolean } | null>(null);
  const dirty = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readRef = useRef(read);
  useEffect(() => {
    readRef.current = read;
  });

  const save = useCallback(async (): Promise<"saved" | "failed" | "nothing_pending"> => {
    if (!key || !dirty.current) return "nothing_pending";
    const data = readRef.current();
    if (!data) {
      dirty.current = false;
      return "nothing_pending";
    }
    setStatus("saving");
    writeLocal(key, data);
    const res = await staffSaveDraft(key, data).catch(() => ({ ok: false as const, message: "Network error" }));
    if (res.ok) {
      dirty.current = false;
      writeLocal(key, null);
      setSavedAt(res.data);
      setStatus("saved");
      return "saved";
    }
    setStatus("pending");
    return "failed";
  }, [key]);

  // Offer an earlier draft (server copy, or a device copy that never reached the server).
  useEffect(() => {
    if (!key) return;
    let live = true;
    const local = readLocal(key);
    staffGetDraft(key)
      .then((res) => {
        if (!live) return;
        const server = res.ok ? res.data : null;
        if (local && (!server || local.at > server.updated_at)) setRestorable({ data: local.data, at: local.at, local: true });
        else if (server) setRestorable({ data: server.data, at: server.updated_at, local: false });
      })
      .catch(() => {
        if (live && local) setRestorable({ data: local.data, at: local.at, local: true });
      });
    return () => {
      live = false;
    };
  }, [key]);

  useEffect(() => (key ? registerFlusher(save) : undefined), [key, save]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const changed = useCallback(() => {
    if (!key) return;
    dirty.current = true;
    setStatus("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), debounceMs);
  }, [key, save, debounceMs]);

  const discard = useCallback(async () => {
    if (!key) return;
    dirty.current = false;
    if (timer.current) clearTimeout(timer.current);
    writeLocal(key, null);
    setRestorable(null);
    setStatus("idle");
    await staffDiscardDraft(key).catch(() => null);
  }, [key]);

  return { status, savedAt, restorable, dismissRestore: () => setRestorable(null), changed, save, discard };
}

/** "Saving… / Saved 10:42 / Not saved to the server — kept on this device" */
export function SaveStatusText({ status, savedAt }: { status: SaveStatus; savedAt: string | null }) {
  if (status === "idle") return null;
  const time = savedAt ? new Date(savedAt).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" }) : "";
  const text =
    status === "saving" ? "Saving draft…" : status === "saved" ? `Draft saved ${time}` : status === "pending" ? "Draft not saved to the server — kept on this device, will retry" : "Save failed";
  return (
    <span role="status" className={`text-xs ${status === "pending" || status === "failed" ? "font-semibold text-amber-700" : "text-dark/55"}`}>
      {text}
    </span>
  );
}
