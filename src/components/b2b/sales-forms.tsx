"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { b2bCall } from "@/lib/b2b/actions";
import { activityKinds, outcomes } from "@/lib/b2b/labels";

const input = "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none";

function useSubmit() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  async function run(fn: string, args: Record<string, unknown>, success: string, after?: () => void) {
    setBusy(true);
    setMsg(null);
    const res = await b2bCall(fn, args, { refresh: true });
    setBusy(false);
    setMsg(res.ok ? { ok: true, text: success } : { ok: false, text: res.message });
    if (res.ok) {
      after?.();
      router.refresh();
    }
    return res.ok;
  }
  const note = msg ? (
    <p role={msg.ok ? "status" : "alert"} className={`text-sm ${msg.ok ? "text-emerald-700" : "text-accent-dark"}`}>
      {msg.ok ? "✓ " : ""}
      {msg.text}
    </p>
  ) : null;
  return { busy, run, note };
}

/** Record a visit, call or note; sets the next follow-up. Location only if the salesperson taps to add it. */
export function ActivityForm({ customerId, products }: { customerId: string; products: string[] }) {
  const { busy, run, note } = useSubmit();
  const [v, setV] = useState<Record<string, string>>({ kind: "visit", outcome: "" });
  const [loc, setLoc] = useState<{ lat: number; lng: number } | null>(null);
  const [locMsg, setLocMsg] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((c) => ({ ...c, [k]: e.target.value }));

  function addLocation() {
    if (!navigator.geolocation) return setLocMsg("Location is not available on this phone");
    setLocMsg("Getting location…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setLoc({ lat: Number(p.coords.latitude.toFixed(6)), lng: Number(p.coords.longitude.toFixed(6)) });
        setLocMsg("Location added to this visit only.");
      },
      () => setLocMsg("Location not shared — the visit is saved without it."),
      { enableHighAccuracy: false, timeout: 10000 }
    );
  }

  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await run(
          "b2b_log_activity",
          {
            p_customer_id: customerId,
            p: { ...v, ...(loc ? { latitude: loc.lat, longitude: loc.lng, location_consent: true } : {}) },
          },
          "Saved to the customer timeline",
          () => {
            setV({ kind: "visit", outcome: "" });
            setLoc(null);
            setLocMsg(null);
          }
        );
      }}
      className="grid gap-3"
    >
      <div className="grid grid-cols-2 gap-2">
        <select className={input} value={v.kind} onChange={set("kind")} aria-label="Type">
          {Object.entries(activityKinds).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
        <select className={input} value={v.outcome} onChange={set("outcome")} aria-label="Outcome">
          <option value="">Outcome…</option>
          {Object.entries(outcomes).map(([k, l]) => (
            <option key={k} value={k}>
              {l}
            </option>
          ))}
        </select>
      </div>
      <input className={input} list="mw-products" placeholder="Products discussed" value={v.products_discussed ?? ""} onChange={set("products_discussed")} />
      <datalist id="mw-products">
        {products.map((p) => (
          <option key={p} value={p} />
        ))}
      </datalist>
      <input className={input} placeholder="Customer requirements (qty, frequency…)" value={v.requirements ?? ""} onChange={set("requirements")} />
      <div className="grid grid-cols-2 gap-2">
        <input className={input} placeholder="Sample requested" value={v.sample_request ?? ""} onChange={set("sample_request")} />
        <input className={input} placeholder="Price enquiry" value={v.price_enquiry ?? ""} onChange={set("price_enquiry")} />
        <input className={input} inputMode="numeric" placeholder="Order opportunity ₹" value={v.opportunity_value ?? ""} onChange={set("opportunity_value")} />
        <input className={input} placeholder="Objection / complaint" value={v.objections ?? ""} onChange={set("objections")} />
      </div>
      <input className={input} placeholder="Next action" value={v.next_action ?? ""} onChange={set("next_action")} />
      <label className="flex flex-col gap-1 text-sm font-semibold text-ink">
        Follow-up date
        <input className={input} type="date" value={v.follow_up_date ?? ""} onChange={set("follow_up_date")} />
      </label>
      <textarea className={input} rows={2} placeholder="Notes" value={v.notes ?? ""} onChange={set("notes")} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-dark/60">
        <button type="button" onClick={addLocation} className="rounded-lg bg-ink/5 px-3 py-2 font-semibold text-ink">
          📍 Add my location to this visit
        </button>
        <span>{locMsg ?? "Optional. Saved only on this record, only when you tap."}</span>
      </div>
      <button disabled={busy} className="rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Save"}
      </button>
      {note}
    </form>
  );
}

/** Ask for a special price; it applies only after an approver agrees. */
export function PriceRequestForm({ customerId, items }: { customerId: string; items: { item_id: string; name: string; price: number | null }[] }) {
  const { busy, run, note } = useSubmit();
  const [v, setV] = useState<Record<string, string>>({ min_qty: "1" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((c) => ({ ...c, [k]: e.target.value }));
  const current = items.find((i) => i.item_id === v.item_id);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await run(
          "fs_request_price",
          { p_customer_id: customerId, p_item_id: v.item_id, p_price: Number(v.price), p_min_qty: Number(v.min_qty || 1), p_valid_to: v.valid_to || null, p_reason: v.reason ?? "" },
          "Sent for approval. The current price applies until it is approved.",
          () => setV({ min_qty: "1" })
        );
      }}
      className="grid gap-2"
    >
      <select className={input} value={v.item_id ?? ""} onChange={set("item_id")} required aria-label="Product">
        <option value="">Product…</option>
        {items.map((i) => (
          <option key={i.item_id} value={i.item_id}>
            {i.name}
            {i.price !== null ? ` (now ₹${i.price})` : ""}
          </option>
        ))}
      </select>
      <div className="grid grid-cols-3 gap-2">
        <input className={input} inputMode="numeric" placeholder="Price ₹" value={v.price ?? ""} onChange={set("price")} required aria-label="Requested price" />
        <input className={input} inputMode="numeric" placeholder="Min qty" value={v.min_qty ?? ""} onChange={set("min_qty")} aria-label="Minimum quantity" />
        <input className={input} type="date" value={v.valid_to ?? ""} onChange={set("valid_to")} aria-label="Valid until" />
      </div>
      <input className={input} placeholder="Why? (volume, competitor rate…)" value={v.reason ?? ""} onChange={set("reason")} required />
      {current?.price !== undefined && current?.price !== null && v.price ? (
        <p className="text-xs text-dark/60">
          Current price ₹{current.price}; requested ₹{v.price} ({Math.round(((Number(v.price) - current.price) / current.price) * 1000) / 10}%)
        </p>
      ) : null}
      <button disabled={busy} className="rounded-xl border-2 border-ink/20 bg-white px-4 py-2.5 font-semibold text-ink disabled:opacity-60">
        {busy ? "Sending…" : "Request special price"}
      </button>
      {note}
    </form>
  );
}

/** Marketing consent the owner gave (or withdrew) in person — always with how it was given. */
export function ConsentForm({ customerId, current }: { customerId: string; current: { consent: boolean; channels: string[] } }) {
  const { busy, run, note } = useSubmit();
  const [channels, setChannels] = useState<string[]>(current.channels);
  const [source, setSource] = useState("");
  return (
    <div className="grid gap-2 text-sm">
      <p className="text-dark/65">
        Now: <strong className="text-ink">{current.consent ? `agreed (${current.channels.join(", ")})` : "no marketing messages"}</strong>
      </p>
      <div className="flex flex-wrap gap-4">
        {["whatsapp", "sms", "email"].map((c) => (
          <label key={c} className="flex items-center gap-2 font-semibold capitalize text-ink">
            <input type="checkbox" className="h-5 w-5 accent-ink" checked={channels.includes(c)} onChange={(e) => setChannels((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))} />
            {c === "sms" ? "SMS" : c}
          </label>
        ))}
      </div>
      <input className={input} placeholder='How? e.g. "Owner agreed at visit today"' value={source} onChange={(e) => setSource(e.target.value)} />
      <div className="flex gap-2">
        <button
          type="button"
          disabled={busy || !channels.length}
          onClick={() => run("b2b_record_consent", { p_customer_id: customerId, p_consent: true, p_channels: channels, p_source: source }, "Consent recorded")}
          className="flex-1 rounded-xl bg-ink px-3 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          Record consent
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => run("b2b_record_consent", { p_customer_id: customerId, p_consent: false, p_channels: [], p_source: source || "Owner asked to stop at visit" }, "Opt-out recorded")}
          className="flex-1 rounded-xl border-2 border-accent px-3 py-2.5 font-semibold text-accent-dark disabled:opacity-50"
        >
          Record opt-out
        </button>
      </div>
      {note}
    </div>
  );
}

/** Update contact details of an assigned shop. */
export function ContactForm({ customerId, initial }: { customerId: string; initial: Record<string, string | null> }) {
  const { busy, run, note } = useSubmit();
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(Object.entries(initial).map(([k, x]) => [k, x ?? ""])));
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((c) => ({ ...c, [k]: e.target.value }));
  const fields: [string, string][] = [
    ["owner_name", "Owner / contact"],
    ["whatsapp", "WhatsApp"],
    ["email", "Email"],
    ["alternate_contact", "Alternate contact"],
    ["business_address", "Business address"],
    ["delivery_address", "Delivery address"],
    ["locality", "Locality"],
    ["pincode", "Pincode"],
    ["preferred_products", "Preferred products"],
    ["business_notes", "Notes"],
  ];
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        await run("b2b_update_customer", { p_customer_id: customerId, p: v, p_reason: "Updated by salesperson" }, "Details saved");
      }}
      className="grid gap-2"
    >
      {fields.map(([k, l]) => (
        <label key={k} className="flex flex-col gap-1 text-sm font-semibold text-ink">
          {l}
          <input className={input} value={v[k] ?? ""} onChange={set(k)} />
        </label>
      ))}
      <p className="text-xs text-dark/55">The mobile number and GSTIN can only be changed by the office (they identify the customer).</p>
      <button disabled={busy} className="rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-60">
        {busy ? "Saving…" : "Save details"}
      </button>
      {note}
    </form>
  );
}

/** Cancel an order still waiting for operations. */
export function CancelOrder({ orderId }: { orderId: string }) {
  const { busy, run, note } = useSubmit();
  const [reason, setReason] = useState("");
  return (
    <div className="grid gap-2">
      <input className={input} placeholder="Reason for cancelling" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button
        type="button"
        disabled={busy || !reason.trim()}
        onClick={() => window.confirm("Cancel this order?") && run("b2b_cancel_order", { p_order_id: orderId, p_reason: reason }, "Order cancelled")}
        className="rounded-xl border-2 border-accent px-4 py-2.5 font-semibold text-accent-dark disabled:opacity-50"
      >
        Cancel order
      </button>
      {note}
    </div>
  );
}

/** Controlled amendment of an order still waiting for operations: new quantities + a reason. */
export function AmendOrder({ orderId, lines, extra }: { orderId: string; lines: { item_id: string; name: string; qty: number }[]; extra: { item_id: string; name: string }[] }) {
  const { busy, run, note } = useSubmit();
  const [qty, setQty] = useState<Record<string, string>>(() => Object.fromEntries(lines.map((l) => [l.item_id, String(l.qty)])));
  const [add, setAdd] = useState("");
  const [reason, setReason] = useState("");
  const names = new Map([...lines, ...extra].map((l) => [l.item_id, l.name]));
  return (
    <div className="grid gap-2">
      {Object.keys(qty).map((id) => (
        <label key={id} className="flex items-center justify-between gap-2 text-sm">
          <span className="text-ink">{names.get(id)}</span>
          <input className="w-24 rounded-lg border-2 border-ink/15 px-2 py-2 text-right" inputMode="numeric" value={qty[id]} onChange={(e) => setQty((c) => ({ ...c, [id]: e.target.value.replace(/\D/g, "") }))} />
        </label>
      ))}
      <div className="flex gap-2">
        <select className={input} value={add} onChange={(e) => setAdd(e.target.value)} aria-label="Add a product">
          <option value="">Add a product…</option>
          {extra
            .filter((x) => !(x.item_id in qty))
            .map((x) => (
              <option key={x.item_id} value={x.item_id}>
                {x.name}
              </option>
            ))}
        </select>
        <button type="button" disabled={!add} onClick={() => (setQty((c) => ({ ...c, [add]: "1" })), setAdd(""))} className="rounded-xl bg-ink/5 px-3 font-semibold text-ink">
          Add
        </button>
      </div>
      <input className={input} placeholder="Reason for the change (required)" value={reason} onChange={(e) => setReason(e.target.value)} />
      <p className="text-xs text-dark/55">Set a quantity to 0 to remove a line. Prices are worked out again; the original order is kept in the history.</p>
      <button
        type="button"
        disabled={busy || !reason.trim()}
        onClick={() =>
          run(
            "b2b_amend_order",
            { p_order_id: orderId, p_lines: Object.entries(qty).filter(([, q]) => Number(q) > 0).map(([item_id, q]) => ({ item_id, qty: Number(q) })), p_reason: reason },
            "Order changed — operations will review it again"
          )
        }
        className="rounded-xl bg-ink px-4 py-3 font-semibold text-white disabled:opacity-50"
      >
        {busy ? "Saving…" : "Save change"}
      </button>
      {note}
    </div>
  );
}
