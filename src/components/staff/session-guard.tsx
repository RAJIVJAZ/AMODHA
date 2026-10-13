"use client";

import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushDrafts } from "@/lib/staff/autosave";
import { staffEnd, staffPing, staffStatus } from "@/lib/staff/actions";

// Inactivity handling for the staff apps (Ops and Sales).
//
// Interactions: click / pointer, key, scroll, wheel, touch, form input, navigation, and returning to a
// visible tab. Mouse movement keeps the local timer honest but is never reported as work.
// All tabs of a sign-in share one "last interaction" time through localStorage, so there is one timer.
// The server is told about interactions at most every 15 s (and at once after a quiet spell or on
// navigation); it stamps its own time and enforces the timeout itself — this component is the friendly
// side: the 30-second warning, saving drafts, and signing out cleanly at exactly the timeout.
// Background status checks (every 60 s) never extend the session; they only notice when the server has
// ended it (timeout, revocation, account switched off) and sign this tab out.

const LAST = "mw:last-interaction";
const ENDED = "mw:session-ended";
const PING_EVERY = 15_000;

function readShared() {
  try {
    return Number(localStorage.getItem(LAST) || 0);
  } catch {
    return 0;
  }
}
function writeShared(t: number) {
  try {
    localStorage.setItem(LAST, String(t));
  } catch {
    // ignore
  }
}

export function sessionEndedUrl(reason: string, save?: string) {
  const next = typeof window !== "undefined" ? window.location.pathname : "/ops/today";
  return `/auth/session-ended?reason=${encodeURIComponent(reason)}${save ? `&save=${save}` : ""}&next=${encodeURIComponent(next)}`;
}

/** Sign out the way every staff sign-out must: save drafts, record it on the server, then leave. */
export async function staffSignOut(reason: "manual" | "idle_timeout") {
  const save = await flushDrafts();
  if (reason === "manual" && save === "failed" && !window.confirm("Some unsaved work could not be saved to the server (it is kept on this device). Sign out anyway?")) {
    return false;
  }
  await staffEnd(reason, save).catch(() => null);
  try {
    localStorage.setItem(ENDED, JSON.stringify({ reason, at: Date.now() }));
  } catch {
    // ignore
  }
  window.location.replace(sessionEndedUrl(reason, save));
  return true;
}

export function SessionGuard({ timeoutSeconds, warningSeconds }: { timeoutSeconds: number; warningSeconds: number }) {
  const pathname = usePathname();
  const [remaining, setRemaining] = useState<number | null>(null);
  const lastLocal = useRef(0); // set on mount
  const lastPing = useRef(0);
  const pendingPing = useRef(false);
  const ending = useRef(false);

  const leave = useCallback((reason: string) => {
    if (ending.current) return;
    ending.current = true;
    window.location.replace(sessionEndedUrl(reason));
  }, []);

  const report = useCallback(
    async (kind: "interaction" | "navigation") => {
      lastPing.current = Date.now();
      pendingPing.current = false;
      const res = await staffPing(kind, window.location.pathname).catch(() => null);
      if (res && res.ok && res.data.state === "ended") leave(res.data.reason ?? "expired");
    },
    [leave]
  );

  const interacted = useCallback(
    (reportIt = true) => {
      if (ending.current) return;
      const now = Date.now();
      lastLocal.current = now;
      writeShared(now);
      setRemaining(null);
      if (!reportIt) return;
      if (now - lastPing.current >= PING_EVERY) void report("interaction");
      else pendingPing.current = true;
    },
    [report]
  );

  // Start: this page load counts as a fresh look at the app for the local timer only.
  useEffect(() => {
    const shared = readShared();
    lastLocal.current = Math.max(shared, Date.now());
    writeShared(lastLocal.current);
  }, []);

  // Navigation is an interaction and is recorded with its module.
  useEffect(() => {
    if (!ending.current) {
      lastLocal.current = Date.now();
      writeShared(lastLocal.current);
      void report("navigation");
    }
  }, [pathname, report]);

  useEffect(() => {
    const strong = () => interacted(true);
    let lastMove = 0;
    const move = () => {
      const now = Date.now();
      if (now - lastMove > 5000) {
        lastMove = now;
        interacted(false); // keeps the on-screen timer honest; not reported as activity
      }
    };
    const vis = () => {
      if (document.visibilityState === "visible") {
        // Back to the tab: check with the server first (the laptop may have slept past the timeout).
        void staffStatus().then((r) => {
          if (r.ok && r.data.state === "ended") leave(r.data.reason ?? "expired");
        });
      }
    };
    const storage = (e: StorageEvent) => {
      if (e.key === LAST && e.newValue) lastLocal.current = Math.max(lastLocal.current, Number(e.newValue));
      if (e.key === ENDED && e.newValue) leave(JSON.parse(e.newValue).reason ?? "manual");
    };
    const opts = { passive: true, capture: true } as const;
    const events = ["pointerdown", "keydown", "wheel", "touchstart", "input", "change", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, strong, opts));
    window.addEventListener("mousemove", move, opts);
    document.addEventListener("visibilitychange", vis);
    window.addEventListener("storage", storage);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, strong, opts));
      window.removeEventListener("mousemove", move, opts);
      document.removeEventListener("visibilitychange", vis);
      window.removeEventListener("storage", storage);
    };
  }, [interacted, leave]);

  // The clock: warning, timeout, flushing a held-back ping, background status checks.
  useEffect(() => {
    let lastStatus = Date.now();
    const id = setInterval(() => {
      if (ending.current) return;
      const last = Math.max(lastLocal.current, readShared());
      const idle = (Date.now() - last) / 1000;
      if (pendingPing.current && Date.now() - lastPing.current >= PING_EVERY) void report("interaction");
      if (idle >= timeoutSeconds) {
        ending.current = true;
        setRemaining(0);
        void staffSignOut("idle_timeout");
        return;
      }
      const left = Math.ceil(timeoutSeconds - idle);
      setRemaining(warningSeconds > 0 && left <= warningSeconds ? left : null);
      if (Date.now() - lastStatus > 60_000) {
        lastStatus = Date.now();
        void staffStatus().then((r) => {
          if (r.ok && r.data.state === "ended") leave(r.data.reason ?? "expired");
        });
      }
    }, 1000);
    return () => clearInterval(id);
  }, [timeoutSeconds, warningSeconds, report, leave]);

  if (remaining === null) return null;
  return (
    <div role="alertdialog" aria-live="assertive" aria-label="Session about to end" className="fixed inset-x-0 bottom-24 z-[70] flex justify-center px-4 lg:bottom-6">
      <div className="w-full max-w-md rounded-2xl border-2 border-amber-300 bg-white p-4 shadow-2xl">
        <p className="font-semibold text-ink">
          {remaining > 0 ? `Your session will end in ${remaining} seconds because no activity was detected.` : "Saving your work and signing out…"}
        </p>
        <p className="mt-1 text-sm text-dark/65">Unfinished forms are saved as drafts before signing out.</p>
        {remaining > 0 ? (
          <button type="button" onClick={() => interacted(true)} className="mt-3 w-full rounded-xl bg-ink px-4 py-3 font-semibold text-white">
            Continue working
          </button>
        ) : null}
      </div>
    </div>
  );
}
