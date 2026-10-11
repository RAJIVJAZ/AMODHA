"use client";

import { useEffect, useState, useSyncExternalStore } from "react";

// Installing the business app on a phone. Android (Chrome, Edge, Samsung) offers an install prompt the
// page can trigger; iPhone Safari has no prompt, so it gets the "Share → Add to Home Screen" steps.

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

type InstallState = "installed" | "prompt" | "ios" | "none";

function snapshot(): InstallState {
  if (isStandalone()) return "installed";
  if (deferred) return "prompt";
  return isIos() ? "ios" : "none";
}

function useInstallState(): InstallState {
  return useSyncExternalStore(subscribe, snapshot, () => "none");
}

/** Mounted once by the app shell: offline page support and catching the install prompt. */
export function OpsAppBoot() {
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/ops/sw.js", { scope: "/ops" }).catch(() => {});
    }
    const onPrompt = (event: Event) => {
      event.preventDefault();
      deferred = event as InstallPromptEvent;
      notify();
    };
    const onInstalled = () => {
      deferred = null;
      notify();
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

async function install() {
  if (!deferred) return;
  const event = deferred;
  deferred = null;
  notify();
  await event.prompt();
  await event.userChoice.catch(() => null);
}

function IosSteps() {
  return (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
      <li>
        Tap the <strong>Share</strong> button <span aria-hidden="true">(□↑)</span> in Safari.
      </li>
      <li>
        Choose <strong>Add to Home Screen</strong>, then <strong>Add</strong>.
      </li>
    </ol>
  );
}

/** A plain button for menus; shows nothing once installed or where installing isn't possible. */
export function InstallAppButton({ className = "" }: { className?: string }) {
  const state = useInstallState();
  const [showSteps, setShowSteps] = useState(false);
  if (state === "installed" || state === "none") return null;
  return (
    <div className={className}>
      <button
        type="button"
        onClick={() => (state === "prompt" ? install() : setShowSteps((s) => !s))}
        className="flex w-full items-center gap-2 rounded-xl bg-primary-light px-4 py-3 text-left text-sm font-bold text-ink"
      >
        <span aria-hidden="true">📲</span> Install MW Ops on this phone
      </button>
      {state === "ios" && showSteps ? (
        <div className="mt-2 rounded-xl bg-white/10 px-4 py-3 text-white">
          <IosSteps />
        </div>
      ) : null}
    </div>
  );
}

const DISMISS_KEY = "mw-ops-install-dismissed";

/** A card for the Today screen inviting staff to install the app; can be dismissed. */
export function InstallBanner() {
  const state = useInstallState();
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDismissed(window.localStorage.getItem(DISMISS_KEY) === "1");
    } catch {
      setDismissed(false);
    }
  }, []);
  if (dismissed || state === "installed" || state === "none") return null;
  const dismiss = () => {
    setDismissed(true);
    try {
      window.localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // private mode: it simply shows again next time
    }
  };
  return (
    <section className="rounded-2xl border-2 border-primary/40 bg-primary-light/25 p-4 text-ink">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-heading text-base font-bold">Put MW Ops on your home screen</p>
          <p className="mt-0.5 text-sm text-dark/70">Opens straight to Today, full screen, like any other app.</p>
        </div>
        <button type="button" onClick={dismiss} aria-label="Not now" className="rounded-full px-2 text-lg leading-none text-dark/50">
          ×
        </button>
      </div>
      {state === "prompt" ? (
        <button type="button" onClick={install} className="mt-3 rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
          Install app
        </button>
      ) : (
        <IosSteps />
      )}
    </section>
  );
}
