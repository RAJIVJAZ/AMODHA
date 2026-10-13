"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { b2bCall } from "@/lib/b2b/actions";

const btn = "min-h-11 rounded-xl px-4 py-2.5 text-sm font-semibold disabled:opacity-60";
const field = "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none";

/** Marks the shop's in-app updates as read once they have been shown on the dashboard. */
export function MarkNotificationsRead({ unread }: { unread: number }) {
  const done = useRef(false);
  useEffect(() => {
    if (unread <= 0 || done.current) return;
    done.current = true;
    const t = window.setTimeout(() => {
      b2bCall("b2b_mark_notifications_read").catch(() => {});
    }, 1500);
    return () => window.clearTimeout(t);
  }, [unread]);
  return null;
}

/** Confirm / decline an order the salesperson placed, and cancel an order not yet accepted. */
export function OrderActions({ orderId, canConfirm, canCancel }: { orderId: string; canConfirm: boolean; canCancel: boolean }) {
  const router = useRouter();
  const [mode, setMode] = useState<"decline" | "cancel" | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function run(fn: "b2b_confirm_order" | "b2b_cancel_order", args: Record<string, unknown>, success: string) {
    setBusy(true);
    setError(null);
    const res = await b2bCall(fn, { p_order_id: orderId, ...args }, { refresh: true });
    setBusy(false);
    if (!res.ok) return setError(res.message);
    setOk(success);
    setMode(null);
    setReason("");
    router.refresh();
  }

  if (!canConfirm && !canCancel) return ok ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{ok}</p> : null;

  return (
    <div className="flex flex-col gap-3">
      {ok ? <p className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">{ok}</p> : null}
      {canConfirm ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4">
          <p className="font-heading text-base font-bold text-ink">Your salesperson placed this order for you</p>
          <p className="mt-1 text-sm text-dark/70">Please check the items and confirm. We start preparing it only after you confirm.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={busy} onClick={() => run("b2b_confirm_order", { p_confirm: true, p_note: null }, "Thank you — order confirmed.")} className={`${btn} bg-ink text-white`}>
              {busy && mode === null ? "Saving…" : "Confirm order"}
            </button>
            <button type="button" disabled={busy} onClick={() => setMode(mode === "decline" ? null : "decline")} className={`${btn} border-2 border-red-300 bg-white text-red-700`}>
              Decline
            </button>
          </div>
        </div>
      ) : null}
      {canCancel && !canConfirm ? (
        <button type="button" disabled={busy} onClick={() => setMode(mode === "cancel" ? null : "cancel")} className={`${btn} self-start border-2 border-red-300 bg-white text-red-700`}>
          Cancel this order
        </button>
      ) : null}
      {mode ? (
        <form
          className="flex flex-col gap-2 rounded-2xl bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!reason.trim()) return setError("Please give a reason");
            if (mode === "decline") run("b2b_confirm_order", { p_confirm: false, p_note: reason.trim() }, "Order declined. Your salesperson has been told.");
            else run("b2b_cancel_order", { p_reason: reason.trim() }, "Order cancelled.");
          }}
        >
          <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
            {mode === "decline" ? "Why are you declining this order?" : "Why do you want to cancel?"}
            <textarea className={field} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} required />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy} className={`${btn} bg-red-700 text-white`}>
              {busy ? "Saving…" : mode === "decline" ? "Decline order" : "Cancel order"}
            </button>
            <button type="button" onClick={() => setMode(null)} className={`${btn} text-dark/70`}>
              Keep order
            </button>
          </div>
        </form>
      ) : null}
      {error ? <p className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-800">{error}</p> : null}
    </div>
  );
}

const channelLabels: { id: string; label: string }[] = [
  { id: "whatsapp", label: "WhatsApp" },
  { id: "sms", label: "SMS" },
  { id: "email", label: "Email" },
];

/** The shop's own choice about offers and new-product messages. */
export function ConsentForm({ customerId, consent, channels }: { customerId: string; consent: boolean; channels: string[] }) {
  const router = useRouter();
  const [chosen, setChosen] = useState<string[]>(consent ? channels : []);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: "good" | "bad"; text: string } | null>(null);

  async function save(optIn: boolean) {
    setBusy(true);
    setMsg(null);
    const res = await b2bCall(
      "b2b_record_consent",
      {
        p_customer_id: customerId,
        p_consent: optIn,
        p_channels: optIn ? chosen : [],
        p_source: "Wholesale app — account page",
        p_note: null,
      },
      { refresh: true }
    );
    setBusy(false);
    if (!res.ok) return setMsg({ tone: "bad", text: res.message });
    if (!optIn) setChosen([]);
    setMsg({ tone: "good", text: optIn ? "Saved. You can change this any time." : "You will not receive offers or promotional messages." });
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3">
      <fieldset className="flex flex-wrap gap-2">
        <legend className="mb-2 text-sm text-dark/70">Send me offers and new-product news on:</legend>
        {channelLabels.map((c) => {
          const on = chosen.includes(c.id);
          return (
            <label key={c.id} className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border-2 px-4 text-sm font-semibold ${on ? "border-primary bg-primary-light/20 text-ink" : "border-ink/15 bg-white text-dark/70"}`}>
              <input
                type="checkbox"
                className="h-5 w-5 accent-[#16323f]"
                checked={on}
                onChange={(e) => setChosen((cur) => (e.target.checked ? [...cur, c.id] : cur.filter((x) => x !== c.id)))}
              />
              {c.label}
            </label>
          );
        })}
      </fieldset>
      <p className="text-xs text-dark/55">Order updates, invoices and delivery messages are always sent — this only covers promotions.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy || chosen.length === 0} onClick={() => save(true)} className={`${btn} bg-ink text-white`}>
          {busy ? "Saving…" : "Save preferences"}
        </button>
        {consent ? (
          <button type="button" disabled={busy} onClick={() => save(false)} className={`${btn} border-2 border-ink/20 bg-white text-ink`}>
            Opt out of all promotions
          </button>
        ) : null}
      </div>
      {msg ? <p className={`rounded-xl px-4 py-3 text-sm font-semibold ${msg.tone === "good" ? "bg-emerald-50 text-emerald-800" : "bg-red-50 text-red-800"}`}>{msg.text}</p> : null}
    </div>
  );
}
