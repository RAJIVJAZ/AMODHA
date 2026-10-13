"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { b2bCall } from "@/lib/b2b/actions";
import { customerTypes } from "@/lib/b2b/labels";

type Match = { id: string; customer_code: string; shop_name: string; locality: string | null; city: string; status: string; match: string; mine: boolean };

const input = "w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-base text-ink focus:border-primary focus:outline-none";

function Field({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold text-ink">
        {label}
        {required ? <span className="text-accent-dark"> *</span> : <span className="font-normal text-dark/45"> (optional)</span>}
      </span>
      {children}
      {hint ? <span className="text-xs text-dark/55">{hint}</span> : null}
    </label>
  );
}

/**
 * New B2B customer. mode "sales" / "staff": ADD NEW B2B CUSTOMER (creates a lead, checks for duplicates
 * as the mobile number is typed). mode "register": a shop registering itself in the Wholesale app.
 */
export function CustomerForm({
  mode,
  required,
  doneBase,
  salespeople,
}: {
  mode: "sales" | "staff" | "register";
  required: string[];
  doneBase: string;
  salespeople?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState<Record<string, string>>({ city: "Prayagraj", customer_type: "sweet_shop" });
  const [sameAddress, setSameAddress] = useState(true);
  const [matches, setMatches] = useState<Match[]>([]);
  const [confirmDifferent, setConfirmDifferent] = useState(false);
  const [needsConfirm, setNeedsConfirm] = useState(false);
  const [consent, setConsent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const key = useRef<string | null>(null);
  const req = new Set([...required, "shop_name", "owner_name", "mobile"]);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((cur) => ({ ...cur, [k]: e.target.value }));

  async function checkDuplicates() {
    if (mode === "register") return;
    const mobile = (v.mobile ?? "").replace(/\D/g, "");
    if (mobile.length < 10 && !(v.gstin ?? "").trim() && (v.shop_name ?? "").trim().length < 3) return;
    const res = await b2bCall<Match[]>("b2b_find_matches", { p_mobile: mobile || null, p_gstin: v.gstin || null, p_shop_name: v.shop_name || null, p_city: v.city || null });
    if (res.ok) setMatches(res.data);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const p: Record<string, unknown> = { ...v, delivery_address: sameAddress ? v.business_address : v.delivery_address };
    if (p.expected_monthly_value === "") delete p.expected_monthly_value;
    setBusy(true);
    if (mode === "register") {
      const res = await b2bCall<{ status: string }>("b2b_register", { p: { ...p, consent_channels: consent } }, { refresh: true });
      setBusy(false);
      if (!res.ok) return setError(res.message);
      setDone(res.data.status);
      router.refresh();
      return;
    }
    key.current ??= crypto.randomUUID();
    const res = await b2bCall<string>("b2b_create_customer", { p, p_confirm_not_duplicate: confirmDifferent, p_key: key.current });
    if (!res.ok) {
      setBusy(false);
      if (/confirm and save again/.test(res.message)) setNeedsConfirm(true);
      if (/already/.test(res.message)) checkDuplicates();
      // A refused attempt never saved anything, so the same key can be used again.
      if (/already saved/.test(res.message)) key.current = null;
      return setError(res.message);
    }
    if (consent.length) {
      await b2bCall("b2b_record_consent", {
        p_customer_id: res.data,
        p_consent: true,
        p_channels: consent,
        p_source: `Asked in person when registering the shop (${mode === "sales" ? "salesperson" : "staff"})`,
      });
    }
    router.push(`${doneBase}/${res.data}`);
  }

  if (done) {
    return (
      <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
        <p className="text-4xl" aria-hidden="true">🙏</p>
        <h2 className="mt-2 font-heading text-xl font-bold text-ink">Thank you — we have your details</h2>
        <p className="mt-2 text-sm text-dark/70">
          {done === "link_requested"
            ? "This mobile number or GSTIN is already with us. Our team will check and link your login to your existing account."
            : "Our sales team will verify your shop and approve your wholesale account. You will then see your prices here."}
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <section className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2">
        <Field label="Shop name" required>
          <input className={input} value={v.shop_name ?? ""} onChange={set("shop_name")} onBlur={checkDuplicates} required maxLength={120} />
        </Field>
        <Field label="Owner / contact person" required>
          <input className={input} value={v.owner_name ?? ""} onChange={set("owner_name")} required maxLength={120} />
        </Field>
        <Field label="Mobile number" required hint={mode === "register" ? "We call this number to verify your shop" : "We check this for an existing customer"}>
          <input className={input} type="tel" inputMode="numeric" value={v.mobile ?? ""} onChange={set("mobile")} onBlur={checkDuplicates} required placeholder="98765 43210" />
        </Field>
        <Field label="WhatsApp number" required={req.has("whatsapp")}>
          <input className={input} type="tel" inputMode="numeric" value={v.whatsapp ?? ""} onChange={set("whatsapp")} required={req.has("whatsapp")} />
        </Field>
        <Field label="Customer type" required>
          <select className={input} value={v.customer_type} onChange={set("customer_type")}>
            {Object.entries(customerTypes).map(([k, l]) => (
              <option key={k} value={k}>
                {l}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Expected monthly purchase (₹)" required={req.has("expected_monthly_value")}>
          <input className={input} inputMode="numeric" value={v.expected_monthly_value ?? ""} onChange={set("expected_monthly_value")} required={req.has("expected_monthly_value")} />
        </Field>
      </section>

      {matches.length ? (
        <div className="rounded-2xl border-2 border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">This shop may already be a customer:</p>
          <ul className="mt-2 flex flex-col gap-1">
            {matches.map((m) => (
              <li key={m.id}>
                {m.customer_code} · <strong>{m.shop_name}</strong> · {m.locality ?? m.city} · {m.status} (same {m.match})
                {m.mine || mode === "staff" ? (
                  <Link href={`${doneBase}/${m.id}`} className="ml-2 font-semibold text-primary-dark underline">
                    Use this customer
                  </Link>
                ) : (
                  <span className="ml-2">— assigned to another salesperson; ask your manager</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <section className="grid gap-3 rounded-2xl bg-white p-4 sm:grid-cols-2">
        <Field label="Business address" required={req.has("business_address") || mode === "register"}>
          <textarea className={input} rows={2} value={v.business_address ?? ""} onChange={set("business_address")} required={req.has("business_address") || mode === "register"} />
        </Field>
        <div className="flex flex-col gap-2">
          <label className="flex items-center gap-2 text-sm font-semibold text-ink">
            <input type="checkbox" checked={sameAddress} onChange={(e) => setSameAddress(e.target.checked)} className="h-5 w-5 accent-ink" />
            Deliver to the business address
          </label>
          {!sameAddress ? (
            <Field label="Delivery address" required={req.has("delivery_address")}>
              <textarea className={input} rows={2} value={v.delivery_address ?? ""} onChange={set("delivery_address")} required={req.has("delivery_address")} />
            </Field>
          ) : null}
        </div>
        <Field label="Locality" required={req.has("locality") || mode === "register"}>
          <input className={input} value={v.locality ?? ""} onChange={set("locality")} required={req.has("locality") || mode === "register"} placeholder="e.g. Katra, Civil Lines" />
        </Field>
        <Field label="City" required>
          <input className={input} value={v.city ?? ""} onChange={set("city")} required onBlur={checkDuplicates} />
        </Field>
        <Field label="Pincode" required={req.has("pincode")}>
          <input className={input} inputMode="numeric" value={v.pincode ?? ""} onChange={set("pincode")} required={req.has("pincode")} maxLength={6} />
        </Field>
        <Field label="GSTIN" required={req.has("gstin")} hint="If the business is GST registered">
          <input className={`${input} uppercase`} value={v.gstin ?? ""} onChange={set("gstin")} onBlur={checkDuplicates} required={req.has("gstin")} maxLength={15} />
        </Field>
        <Field label="Email" required={req.has("email")}>
          <input className={input} type="email" value={v.email ?? ""} onChange={set("email")} required={req.has("email")} />
        </Field>
        <Field label="Alternate contact">
          <input className={input} value={v.alternate_contact ?? ""} onChange={set("alternate_contact")} />
        </Field>
        <Field label="Products they want">
          <input className={input} value={v.preferred_products ?? ""} onChange={set("preferred_products")} placeholder="Milk cake, kalakand, ghee…" />
        </Field>
        <Field label="Notes">
          <textarea className={input} rows={2} value={v.business_notes ?? ""} onChange={set("business_notes")} />
        </Field>
        {mode === "staff" && salespeople?.length ? (
          <Field label="Assign to salesperson">
            <select className={input} value={v.assigned_salesperson ?? ""} onChange={set("assigned_salesperson")}>
              <option value="">— not assigned —</option>
              {salespeople.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
      </section>

      <fieldset className="rounded-2xl bg-white p-4 text-sm">
        <legend className="px-1 font-semibold text-ink">Offers and new products (optional)</legend>
        <p className="text-dark/65">
          {mode === "register" ? "Would you like to hear about offers and new products?" : "Only tick if the owner has just said yes to receiving offers."} Leaving these unticked means no promotional messages.
        </p>
        <div className="mt-2 flex flex-wrap gap-4">
          {["whatsapp", "sms", "email"].map((c) => (
            <label key={c} className="flex items-center gap-2 font-semibold capitalize text-ink">
              <input type="checkbox" className="h-5 w-5 accent-ink" checked={consent.includes(c)} onChange={(e) => setConsent((cur) => (e.target.checked ? [...cur, c] : cur.filter((x) => x !== c)))} />
              {c === "sms" ? "SMS" : c}
            </label>
          ))}
        </div>
      </fieldset>

      {needsConfirm ? (
        <label className="flex items-start gap-2 rounded-2xl bg-amber-50 p-3 text-sm font-semibold text-amber-900">
          <input type="checkbox" checked={confirmDifferent} onChange={(e) => setConfirmDifferent(e.target.checked)} className="mt-0.5 h-5 w-5 accent-ink" />
          I have checked: this is a different business from the one listed above.
        </label>
      ) : null}
      {error ? <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-900">{error}</p> : null}
      <button type="submit" disabled={busy} className="rounded-xl bg-accent px-4 py-3.5 text-base font-bold text-white disabled:opacity-60">
        {busy ? "Saving…" : mode === "register" ? "Submit for approval" : "Save as lead (pending approval)"}
      </button>
    </form>
  );
}
