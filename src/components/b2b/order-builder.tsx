"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { b2bCall } from "@/lib/b2b/actions";
import { registerFlusher } from "@/lib/staff/autosave";
import { approvalReasons, availabilityLabels, paymentMethods, productImage, statusTone } from "@/lib/b2b/labels";
import type { CatalogueItem, PlaceOrderResult, Quote } from "@/lib/b2b/types";

const inr = (n: number | null | undefined) =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", maximumFractionDigits: 0 }).format(Number(n ?? 0));

type Line = { item_id: string; qty: number };

/**
 * One screen to build a wholesale order: search, enter quantities, review the server's prices, submit.
 * Used by the Sales app (salesperson for a shop) and the Wholesale app (the shop itself). Prices shown
 * while typing are the catalogue prices; the review step asks the server, which applies every pricing,
 * quantity, stock and credit rule again. The browser never sends a price.
 */
export function OrderBuilder({
  customerId,
  customerLabel,
  catalogue,
  initialLines = [],
  initialNotes = "",
  paymentOptions,
  defaultPayment,
  earliestDate,
  ordersBase,
  showExactStock = false,
  allowCsv = true,
  notice,
}: {
  customerId: string;
  customerLabel: string;
  catalogue: CatalogueItem[];
  initialLines?: Line[];
  initialNotes?: string;
  paymentOptions: string[];
  defaultPayment: string;
  earliestDate: string;
  ordersBase: string;
  showExactStock?: boolean;
  allowCsv?: boolean;
  notice?: React.ReactNode;
}) {
  const known = useMemo(() => new Map(catalogue.map((c) => [c.item_id, c])), [catalogue]);
  const [qty, setQty] = useState<Record<string, string>>(() =>
    Object.fromEntries(initialLines.filter((l) => known.has(l.item_id)).map((l) => [l.item_id, String(l.qty)]))
  );
  const dropped = initialLines.filter((l) => !known.has(l.item_id)).length;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [onlySelected, setOnlySelected] = useState(false);
  const [notes, setNotes] = useState(initialNotes);
  const [date, setDate] = useState("");
  const [payment, setPayment] = useState(paymentOptions.includes(defaultPayment) ? defaultPayment : paymentOptions[0] ?? "cod");
  const [step, setStep] = useState<"build" | "review" | "done">("build");
  const [quote, setQuote] = useState<Quote | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "good" | "bad"; text: string } | null>(null);
  const [result, setResult] = useState<PlaceOrderResult | null>(null);
  const [csvOpen, setCsvOpen] = useState(false);
  const [csvText, setCsvText] = useState("");
  const key = useRef<string | null>(null);

  const lines: Line[] = Object.entries(qty)
    .map(([item_id, v]) => ({ item_id, qty: Number(v) }))
    .filter((l) => Number.isFinite(l.qty) && l.qty > 0);

  // Autosave the unfinished order as this shop's draft (a draft is never an order), and save it before
  // any sign-out. "Pending" means the last change has not reached the server yet.
  const [autoState, setAutoState] = useState<"idle" | "saving" | "saved" | "pending">("idle");
  const latest = useRef({ lines, notes });
  const dirty = useRef(false);
  const linesKey = JSON.stringify(lines);
  useEffect(() => {
    latest.current = { lines: JSON.parse(linesKey) as Line[], notes };
  }, [linesKey, notes]);
  useEffect(() => {
    if (step === "done") return;
    const save = async (): Promise<"saved" | "failed" | "nothing_pending"> => {
      if (!dirty.current) return "nothing_pending";
      setAutoState("saving");
      const res = await b2bCall("b2b_save_draft", { p_customer_id: customerId, p_lines: latest.current.lines, p_notes: latest.current.notes || null }).catch(() => null);
      if (res && res.ok) {
        dirty.current = false;
        setAutoState("saved");
        return "saved";
      }
      setAutoState("pending");
      return "failed";
    };
    return registerFlusher(save);
  }, [customerId, step]);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    if (step === "done") return;
    dirty.current = true;
    const t = setTimeout(async () => {
      if (!dirty.current) return;
      setAutoState("saving");
      const res = await b2bCall("b2b_save_draft", { p_customer_id: customerId, p_lines: JSON.parse(linesKey), p_notes: notes || null }).catch(() => null);
      if (res && res.ok) dirty.current = false;
      setAutoState(res && res.ok ? "saved" : "pending");
    }, 2000);
    return () => clearTimeout(t);
  }, [linesKey, notes, customerId, step]);
  const estimate = lines.reduce((sum, l) => sum + (known.get(l.item_id)?.price ?? 0) * l.qty, 0);
  const categories = Array.from(new Map(catalogue.map((c) => [c.category, c.category_label ?? c.category])).entries());

  const q = search.trim().toLowerCase();
  const shown = catalogue.filter(
    (c) =>
      (!category || c.category === category) &&
      (!onlySelected || Number(qty[c.item_id] ?? 0) > 0) &&
      (!q || `${c.name} ${c.product_name} ${c.code} ${c.pack ?? ""}`.toLowerCase().includes(q))
  );

  function setLine(item: CatalogueItem, value: string) {
    setQty((cur) => ({ ...cur, [item.item_id]: value.replace(/[^\d]/g, "") }));
    setMessage(null);
  }
  function step1(item: CatalogueItem, dir: 1 | -1) {
    const cur = Number(qty[item.item_id] ?? 0);
    let next = cur + dir * item.multiple;
    if (dir === 1 && next < item.min_qty) next = item.min_qty;
    if (dir === -1 && next < item.min_qty) next = 0;
    setLine(item, next > 0 ? String(next) : "");
  }

  async function review() {
    if (!lines.length) {
      setMessage({ tone: "bad", text: "Enter a quantity for at least one product." });
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await b2bCall<Quote>("b2b_quote", { p_customer_id: customerId, p_lines: lines });
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "bad", text: res.message });
      return;
    }
    setQuote(res.data);
    setStep("review");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveDraft() {
    setBusy(true);
    const res = await b2bCall("b2b_save_draft", { p_customer_id: customerId, p_lines: lines, p_notes: notes || null });
    setBusy(false);
    setMessage(res.ok ? { tone: "good", text: "Draft saved. It will be here next time." } : { tone: "bad", text: res.message });
  }

  async function submit() {
    if (!quote || quote.errors.length) return;
    key.current ??= crypto.randomUUID();
    setBusy(true);
    setMessage(null);
    const res = await b2bCall<PlaceOrderResult>(
      "b2b_place_order",
      { p_customer_id: customerId, p_lines: lines, p_payment_method: payment, p_requested_delivery_date: date || null, p_notes: notes || null, p_key: key.current },
      { refresh: true }
    );
    setBusy(false);
    if (!res.ok) {
      setMessage({ tone: "bad", text: res.message });
      return;
    }
    setResult(res.data);
    setStep("done");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function importCsv() {
    const problems: string[] = [];
    const byCode = new Map(catalogue.map((c) => [c.code.toUpperCase(), c]));
    const next: Record<string, string> = { ...qty };
    let added = 0;
    csvText
      .split(/\r?\n/)
      .map((r) => r.trim())
      .filter(Boolean)
      .forEach((row, i) => {
        const [codeRaw, qtyRaw] = row.split(/[,;\t]/).map((s) => (s ?? "").trim().replace(/^"|"$/g, ""));
        if (i === 0 && /code/i.test(codeRaw ?? "")) return; // header
        const item = byCode.get((codeRaw ?? "").toUpperCase());
        const n = Number(qtyRaw);
        if (!item) return problems.push(`Row ${i + 1}: product code "${codeRaw}" is not in your catalogue`);
        if (!Number.isInteger(n) || n <= 0) return problems.push(`Row ${i + 1}: quantity for ${item.code} must be a whole number`);
        next[item.item_id] = String(n);
        added += 1;
      });
    setQty(next);
    setMessage(problems.length ? { tone: "bad", text: `${added} lines imported. ${problems.slice(0, 5).join(" · ")}` } : { tone: "good", text: `${added} lines imported. Review before submitting.` });
    if (!problems.length) setCsvOpen(false);
  }

  function downloadTemplate() {
    const rows = ["code,qty,product", ...catalogue.map((c) => `${c.code},,"${c.name.replace(/"/g, "'")}"`)];
    const blob = new Blob([rows.join("\r\n")], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "mithaiwallah-order-template.csv";
    a.click();
    URL.revokeObjectURL(a.href);
  }

  if (step === "done" && result) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-5 text-center">
          <p className="text-4xl" aria-hidden="true">✅</p>
          <h2 className="mt-2 font-heading text-2xl font-bold text-ink">Order {result.order_no}</h2>
          <p className="mt-1 text-sm text-dark/70">
            {result.duplicate ? "This order was already submitted — nothing was sent twice." : `Submitted for ${customerLabel}.`}
          </p>
          <p className="mt-3">
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusTone(result.status)}`}>{result.status}</span>
          </p>
          <p className="mt-3 font-heading text-xl font-bold text-ink">{inr(result.total)}</p>
          {result.approval_reasons?.length ? (
            <ul className="mx-auto mt-3 max-w-sm text-left text-sm text-amber-900">
              {result.approval_reasons.map((r) => (
                <li key={r}>• {approvalReasons[r] ?? r}</li>
              ))}
            </ul>
          ) : null}
          {result.needs_confirmation ? <p className="mt-3 text-sm text-amber-900">The shop will be asked to confirm this order in the Wholesale app.</p> : null}
        </div>
        <Link href={`${ordersBase}/${result.order_id}`} className="rounded-xl bg-ink px-4 py-3 text-center font-semibold text-white">
          Track this order
        </Link>
      </div>
    );
  }

  if (step === "review" && quote) {
    const blocking = quote.errors.length > 0;
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-xl font-bold text-ink">Review order</h2>
          <button type="button" onClick={() => setStep("build")} className="text-sm font-semibold text-primary-dark">
            ← Change items
          </button>
        </div>
        <p className="text-sm text-dark/65">For {customerLabel}. Prices below are from today&rsquo;s approved price list and include GST.</p>
        {quote.errors.length ? (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-900">
            {quote.errors.map((e, i) => (
              <p key={i}>• {e.error}</p>
            ))}
          </div>
        ) : null}
        <ul className="divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-white">
          {quote.lines.map((l) => (
            <li key={l.item_id} className="flex items-start justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="font-semibold text-ink">{l.name}</p>
                <p className="text-xs text-dark/60">
                  {l.code} · {l.qty} × {inr(l.unit_price)}
                  {l.list_price > l.unit_price ? <span className="ml-1 text-dark/40 line-through">{inr(l.list_price)}</span> : null}
                  {l.price_source !== "standard" ? <span className="ml-1 font-semibold text-emerald-700">{l.price_source === "customer" || l.price_source === "special_approval" ? "your price" : l.price_source === "promotion" ? "offer" : "category price"}</span> : null}
                </p>
                {!l.in_stock ? <p className="text-xs font-semibold text-amber-800">Only {l.available} in stock now — the rest will be made / restocked</p> : null}
              </div>
              <p className="shrink-0 font-semibold tabular-nums text-ink">{inr(l.line_total)}</p>
            </li>
          ))}
        </ul>
        <dl className="grid grid-cols-2 gap-1 rounded-2xl border border-ink/10 bg-white p-3 text-sm">
          <dt className="text-dark/65">Items</dt>
          <dd className="text-right tabular-nums">{inr(quote.subtotal)}</dd>
          {quote.savings > 0 ? (
            <>
              <dt className="text-emerald-700">Your discount vs list</dt>
              <dd className="text-right tabular-nums text-emerald-700">−{inr(quote.savings)}</dd>
            </>
          ) : null}
          <dt className="text-dark/65">Delivery</dt>
          <dd className="text-right tabular-nums">{quote.delivery_fee ? inr(quote.delivery_fee) : "Free"}</dd>
          <dt className="text-dark/65">GST included</dt>
          <dd className="text-right tabular-nums">{inr(quote.gst_included)}</dd>
          <dt className="font-bold text-ink">Total payable</dt>
          <dd className="text-right font-heading text-lg font-bold tabular-nums text-ink">{inr(quote.total)}</dd>
        </dl>
        {quote.shortages.length ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            Some items are short in stock. The order goes to operations as a back-order; they will confirm the delivery date
            (earliest about {new Date(`${quote.earliest_delivery}T00:00:00+05:30`).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}).
          </div>
        ) : null}
        {quote.credit && payment === "credit" && quote.credit.available !== undefined ? (
          <p className={`rounded-xl p-3 text-sm ${Number(quote.credit.available) < quote.total ? "bg-amber-50 text-amber-900" : "bg-sky-50 text-sky-900"}`}>
            Available credit {inr(quote.credit.available)}
            {Number(quote.credit.available) < quote.total ? " — this order is over the limit and will need finance approval." : ""}
          </p>
        ) : null}
        <div className="grid gap-3 rounded-2xl border border-ink/10 bg-white p-3">
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Payment</span>
            <select value={payment} onChange={(e) => setPayment(e.target.value)} className="rounded-lg border-2 border-ink/15 px-3 py-2.5 text-base">
              {paymentOptions.map((p) => (
                <option key={p} value={p}>
                  {paymentMethods[p] ?? p}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Requested delivery date (optional)</span>
            <input type="date" min={earliestDate} value={date} onChange={(e) => setDate(e.target.value)} className="rounded-lg border-2 border-ink/15 px-3 py-2.5 text-base" />
            <span className="text-xs text-dark/55">A request — operations confirm the date when they accept the order.</span>
          </label>
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-semibold text-ink">Notes / delivery instructions</span>
            <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} className="rounded-lg border-2 border-ink/15 px-3 py-2 text-base" />
          </label>
        </div>
        {message ? <p role="alert" className={`text-sm ${message.tone === "good" ? "text-emerald-700" : "text-accent-dark"}`}>{message.text}</p> : null}
        <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] flex gap-2 lg:bottom-4">
          <button type="button" onClick={() => window.print()} className="rounded-xl border-2 border-ink/20 bg-white px-4 py-3 text-sm font-semibold text-ink">
            Print summary
          </button>
          <button
            type="button"
            disabled={busy || blocking}
            onClick={submit}
            className="flex-1 rounded-xl bg-accent px-4 py-3 text-base font-bold text-white shadow-lg disabled:opacity-50"
          >
            {busy ? "Submitting…" : `Submit order · ${inr(quote.total)}`}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {notice}
      {dropped ? <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{dropped} product(s) from the earlier order are no longer available and were left out.</p> : null}
      <div className="sticky top-[3.25rem] z-20 -mx-4 flex flex-col gap-2 bg-[#f5f6f7]/95 px-4 py-2 backdrop-blur lg:top-0">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search products or codes"
          className="w-full rounded-xl border-2 border-ink/15 bg-white px-3 py-2.5 text-base"
        />
        <div className="flex gap-2 overflow-x-auto pb-1">
          <button type="button" onClick={() => setCategory("")} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${!category ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}>
            All
          </button>
          {categories.map(([code, label]) => (
            <button key={code} type="button" onClick={() => setCategory(code)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${category === code ? "bg-ink text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}>
              {label}
            </button>
          ))}
          <button type="button" onClick={() => setOnlySelected(!onlySelected)} className={`shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold ${onlySelected ? "bg-accent text-white" : "bg-white text-ink ring-1 ring-ink/15"}`}>
            In this order ({lines.length})
          </button>
        </div>
      </div>

      {shown.length === 0 ? <p className="rounded-xl bg-ink/5 p-6 text-center text-sm text-dark/60">No products match.</p> : null}
      <ul className="flex flex-col gap-2">
        {shown.map((c) => {
          const img = productImage(c);
          const v = qty[c.item_id] ?? "";
          const n = Number(v || 0);
          const bad = n > 0 && (n < c.min_qty || n % c.multiple !== 0);
          const avail = availabilityLabels[c.availability];
          const bestBreak = (c.breaks ?? []).filter((b) => n >= b.min_qty).pop();
          return (
            <li key={c.item_id} className={`rounded-2xl border-2 bg-white p-3 ${n > 0 ? "border-primary" : "border-transparent"}`}>
              <div className="flex gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-blush">
                  {img ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={img} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-full w-full items-center justify-center text-2xl" aria-hidden="true">
                      🍬
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold leading-tight text-ink">{c.name}</p>
                  <p className="text-xs text-dark/60">
                    {c.code} · {c.pack ?? c.unit}
                    {c.shelf_life_days ? ` · ${c.shelf_life_days}-day shelf life` : ""}
                  </p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    {c.price !== null ? (
                      <span className="font-heading text-lg font-bold text-ink">
                        {inr(bestBreak?.price ?? c.price)}
                        <span className="text-xs font-normal text-dark/55">/{c.unit}</span>
                      </span>
                    ) : (
                      <span className="text-sm text-dark/55">Price after approval</span>
                    )}
                    {c.list_price && c.price !== null && c.list_price > (bestBreak?.price ?? c.price) ? <span className="text-xs text-dark/40 line-through">{inr(c.list_price)}</span> : null}
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${avail.tone}`}>
                      {avail.label}
                      {showExactStock && c.available_qty !== null ? ` · ${c.available_qty}` : ""}
                    </span>
                  </div>
                  {c.breaks?.length ? (
                    <p className="text-[11px] text-emerald-700">
                      {c.breaks.map((b) => `${b.min_qty}+ @ ${inr(b.price)}`).join(" · ")}
                    </p>
                  ) : null}
                  {c.offers?.length ? <p className="text-[11px] font-semibold text-accent-dark">Offer: {c.offers.map((o) => `${inr(o.price)}${o.valid_to ? ` till ${o.valid_to}` : ""}`).join(", ")}</p> : null}
                </div>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <p className="text-[11px] text-dark/55">
                  {c.min_qty > 1 ? `Min ${c.min_qty}` : ""}
                  {c.multiple > 1 ? `${c.min_qty > 1 ? " · " : ""}in ${c.multiple}s` : ""}
                  {c.availability === "made_to_order" ? ` · about ${c.lead_days} day(s)` : ""}
                </p>
                <div className="flex items-center">
                  <button type="button" onClick={() => step1(c, -1)} aria-label={`Less ${c.name}`} className="h-11 w-11 rounded-l-xl bg-ink/5 text-xl font-bold text-ink">
                    −
                  </button>
                  <input
                    inputMode="numeric"
                    aria-label={`Quantity of ${c.name}`}
                    value={v}
                    onChange={(e) => setLine(c, e.target.value)}
                    placeholder="0"
                    className={`h-11 w-16 border-y-2 text-center text-lg font-semibold ${bad ? "border-accent text-accent-dark" : "border-ink/5"}`}
                  />
                  <button type="button" onClick={() => step1(c, 1)} aria-label={`More ${c.name}`} className="h-11 w-11 rounded-r-xl bg-ink text-xl font-bold text-white">
                    +
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ul>

      {allowCsv ? (
        <details open={csvOpen} onToggle={(e) => setCsvOpen((e.target as HTMLDetailsElement).open)} className="rounded-2xl bg-white p-3 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">Import from a CSV file</summary>
          <p className="mt-2 text-dark/65">
            One line per product: <code>code,qty</code>.{" "}
            <button type="button" onClick={downloadTemplate} className="font-semibold text-primary-dark underline">
              Download the template
            </button>{" "}
            with your product codes.
          </p>
          <input
            type="file"
            accept=".csv,text/csv,text/plain"
            className="mt-2 block text-sm"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (f) setCsvText((await f.text()).slice(0, 50000));
            }}
          />
          <textarea rows={4} value={csvText} onChange={(e) => setCsvText(e.target.value)} placeholder={"code,qty\nMILK-CAKE-1KG,20"} className="mt-2 w-full rounded-lg border-2 border-ink/15 p-2 font-mono text-xs" />
          <button type="button" onClick={importCsv} className="mt-2 rounded-lg bg-ink px-3 py-2 text-sm font-semibold text-white">
            Add these lines
          </button>
        </details>
      ) : null}

      {message ? <p role="alert" className={`text-sm ${message.tone === "good" ? "text-emerald-700" : "text-accent-dark"}`}>{message.text}</p> : null}

      <div className="sticky bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-20 flex items-center gap-2 rounded-2xl bg-ink p-2 pl-4 text-white shadow-xl lg:bottom-4">
        <div className="min-w-0 flex-1">
          <p className="text-xs text-white/70">
            {lines.length} product(s)
            {autoState === "saved" ? " · draft saved" : autoState === "saving" ? " · saving…" : autoState === "pending" ? " · not saved yet" : ""}
          </p>
          <p className="font-heading text-lg font-bold">≈ {inr(estimate)}</p>
        </div>
        <button type="button" onClick={saveDraft} disabled={busy || !lines.length} className="rounded-xl bg-white/15 px-3 py-3 text-sm font-semibold disabled:opacity-40">
          Save draft
        </button>
        <button type="button" onClick={review} disabled={busy} className="rounded-xl bg-accent px-4 py-3 text-sm font-bold disabled:opacity-50">
          {busy ? "Checking…" : "Review →"}
        </button>
      </div>
    </div>
  );
}
