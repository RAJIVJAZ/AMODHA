"use client";

import { useEffect, useState, type FormEvent, type MouseEvent } from "react";
import Link from "next/link";
import Script from "next/script";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { OrderConfirmation, type PlacedOrder } from "@/components/checkout/order-confirmation";
import { FirstOrderNote } from "@/components/ui/first-order-note";
import { ButtonLink } from "@/components/ui/button-link";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import {
  DELIVERY_AREA,
  FIRST_ORDER_DISCOUNT,
  FIRST_ORDER_MINIMUM,
  bestDiscountFor,
  deliveryFeeFor,
  discountLabels,
} from "@/lib/order-rules";
import type { OrderSummary } from "@/lib/orders";
import { createClient } from "@/lib/supabase/client";
import { siteConfig } from "@/lib/site";

const inputClass =
  "rounded-xl border-2 border-ink/30 px-3 py-2.5 text-sm text-dark focus:border-primary focus:outline-none";

type RazorpayHandlerResponse = {
  razorpay_payment_id: string;
  razorpay_order_id: string;
  razorpay_signature: string;
};

type RazorpayOptions = {
  key: string;
  amount: number;
  currency: string;
  name: string;
  description?: string;
  order_id: string;
  prefill?: { name?: string; email?: string; contact?: string };
  theme?: { color?: string };
  handler: (response: RazorpayHandlerResponse) => void;
  modal?: { ondismiss?: () => void };
};

type RazorpayInstance = {
  open: () => void;
  on: (event: "payment.failed", callback: (response: { error: { description: string } }) => void) => void;
};

type SavedAddress = { id: string; label: string; address: string; city: string; pincode: string };

declare global {
  interface Window {
    Razorpay?: new (options: RazorpayOptions) => RazorpayInstance;
  }
}

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const [firstOrderEligible, setFirstOrderEligible] = useState(false);
  const [milkSubscriber, setMilkSubscriber] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const deliveryFee = deliveryFeeFor(subtotal, milkSubscriber);
  const [savedAddresses, setSavedAddresses] = useState<SavedAddress[]>([]);
  const { discount, reason: discountReason } = bestDiscountFor(subtotal, { firstOrderEligible, milkSubscriber });
  const total = subtotal + deliveryFee - discount;
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [fallbackUrl, setFallbackUrl] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);
  const [paymentError, setPaymentError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: DELIVERY_AREA,
    pincode: "",
    notes: "",
  });

  useEffect(() => {
    let cancelled = false;
    async function loadAccount() {
      const offer = await fetch("/api/account/first-order").then((res) => (res.ok ? res.json() : null)).catch(() => null);
      if (cancelled) return;
      setSignedIn(Boolean(offer?.signedIn));
      if (!offer?.signedIn) return;
      setFirstOrderEligible(Boolean(offer.eligible));
      setMilkSubscriber(Boolean(offer.milkSubscriber));

      const supabase = createClient();
      const [{ data: userData }, { data: addresses }] = await Promise.all([
        supabase.auth.getUser(),
        supabase.from("addresses").select("id, label, address, city, pincode").order("created_at"),
      ]);
      if (cancelled) return;
      const phone = userData.user?.phone?.replace(/\D/g, "").slice(-10);
      const email = userData.user?.email;
      setForm((prev) => ({
        ...prev,
        phone: prev.phone || phone || "",
        email: prev.email || email || "",
      }));
      if (addresses) setSavedAddresses(addresses);
    }
    loadAccount();
    return () => {
      cancelled = true;
    };
  }, []);

  function updateField(name: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function applySavedAddress(id: string) {
    const saved = savedAddresses.find((entry) => entry.id === id);
    if (saved) setForm((prev) => ({ ...prev, address: saved.address, city: saved.city, pincode: saved.pincode }));
  }

  function orderPayload() {
    return {
      items: items.map(({ slug, packLabel, quantity }) => ({ slug, packLabel, quantity })),
      customer: form,
    };
  }

  /** Only used if the order can't be saved: lets the customer send it to us manually instead. */
  function whatsAppFallbackUrl() {
    const lines = [
      "New Order from mithaiwallah.shop (website couldn't save it)",
      "",
      ...items.map((item) => `- ${item.productName} (${item.packLabel}) x${item.quantity} — ${formatInr(item.price * item.quantity)}`),
      "",
      `Total (approx.): ${formatInr(total)}`,
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      `Email: ${form.email}`,
      `Delivery Address: ${form.address}, ${form.city} - ${form.pincode}`,
      form.notes ? `Notes: ${form.notes}` : "",
      "Payment: COD / UPI on delivery",
    ].filter(Boolean);
    return `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(lines.join("\n"))}`;
  }

  async function handleCodOrder(event: MouseEvent<HTMLButtonElement>) {
    if (!event.currentTarget.form?.reportValidity()) return;
    setPaymentError(null);
    setFallbackUrl(null);
    setIsPaying(true);
    try {
      const res = await fetch("/api/orders/cod", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(orderPayload()),
      });
      const data = await res.json();
      if (!res.ok) {
        setPaymentError(data?.error ?? "Could not place the order. Please try again.");
        if (res.status >= 500) setFallbackUrl(whatsAppFallbackUrl());
        return;
      }
      setPlaced({ summary: data as OrderSummary, payment: "Cash / UPI on delivery" });
      clearCart();
      window.scrollTo({ top: 0 });
    } catch (err) {
      console.error("Placing COD order failed:", err);
      setPaymentError("We couldn't reach our server. Check your connection and try again.");
      setFallbackUrl(whatsAppFallbackUrl());
    } finally {
      setIsPaying(false);
    }
  }

  async function handlePayNow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPaymentError(null);
    setFallbackUrl(null);

    if (!window.Razorpay) {
      setPaymentError("Payment is still loading — please wait a moment and try again.");
      return;
    }

    if (!event.currentTarget.reportValidity()) return;

    setIsPaying(true);
    try {
      const orderRes = await fetch("/api/razorpay/create-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...orderPayload(), receipt: `mw_${Date.now()}` }),
      });
      const order = await orderRes.json();
      if (!orderRes.ok) throw new Error(order?.error ?? "Could not start payment");

      const razorpay = new window.Razorpay({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        name: "Mithai Wallah",
        description: "Fresh mithai from Mithai Wallah, Prayagraj",
        order_id: order.id,
        prefill: {
          name: form.name,
          email: form.email,
          contact: form.phone,
        },
        theme: { color: "#ff6b4a" },
        handler: async (response: RazorpayHandlerResponse) => {
          try {
            const verifyRes = await fetch("/api/razorpay/verify", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                orderId: response.razorpay_order_id,
                paymentId: response.razorpay_payment_id,
                signature: response.razorpay_signature,
              }),
            });
            const verifyData = await verifyRes.json();
            if (!verifyData.verified) {
              setPaymentError("We couldn't verify that payment. Please contact us before retrying.");
              return;
            }
            const summary = order.summary as OrderSummary;
            setPlaced({
              summary: { ...summary, orderNumber: verifyData.orderNumber ?? summary.orderNumber },
              payment: `Paid online (Razorpay ${response.razorpay_payment_id})`,
            });
            clearCart();
            window.scrollTo({ top: 0 });
          } finally {
            setIsPaying(false);
          }
        },
        modal: {
          ondismiss: () => setIsPaying(false),
        },
      });
      razorpay.on("payment.failed", (response) => {
        setPaymentError(`Payment failed: ${response.error.description}. You can try again.`);
        setIsPaying(false);
      });
      razorpay.open();
    } catch (err) {
      console.error("Payment start failed:", err);
      setPaymentError(err instanceof Error ? err.message : "Something went wrong starting the payment.");
      setIsPaying(false);
    }
  }

  if (placed) return <OrderConfirmation placed={placed} signedIn={Boolean(signedIn)} />;

  if (items.length === 0) {
    return (
      <section className="container-site flex flex-col items-center gap-4 py-24 text-center">
        <span aria-hidden="true" className="text-5xl">
          🛒
        </span>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Your Cart Is Empty</h1>
        <p className="max-w-md text-dark/70">
          Pick your sweets first — fresh mithai made in 100% pure desi ghee, delivered across {DELIVERY_AREA}.
        </p>
        <ButtonLink href="/#catalog" variant="primary">
          Browse Sweets
        </ButtonLink>
      </section>
    );
  }

  return (
    <>
      <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Checkout" }]} />

      <section className="container-site py-14 sm:py-20">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Checkout</h1>
        <p className="mt-2 max-w-xl text-dark/70">
          Fill in your delivery details below, then pay securely online or place your order for Cash on
          Delivery / UPI on delivery.
        </p>
        <p className="font-heading sticker-shadow-sm mt-4 inline-block rounded-full border-2 border-ink bg-blush px-4 py-1.5 text-sm font-semibold text-ink">
          📍 We currently deliver within {DELIVERY_AREA} only
        </p>

        {siteConfig.accountsLive && signedIn === false ? (
          <p className="mt-4 rounded-xl border-2 border-ink/15 bg-white px-4 py-3 text-sm text-dark/75">
            First order?{" "}
            <Link href="/login?next=/checkout" className="font-semibold text-primary-dark hover:underline">
              Sign in or sign up
            </Link>{" "}
            to get {formatInr(FIRST_ORDER_DISCOUNT)} off orders of {formatInr(FIRST_ORDER_MINIMUM)} or more, and to track your order.
          </p>
        ) : null}

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <form onSubmit={handlePayNow} className="sticker-shadow flex flex-col gap-5 rounded-2xl border-2 border-ink bg-white p-6 sm:p-8">
            {savedAddresses.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <label htmlFor="saved-address" className="text-sm font-semibold text-ink">
                  Use a saved address
                </label>
                <select
                  id="saved-address"
                  defaultValue=""
                  onChange={(e) => applySavedAddress(e.target.value)}
                  className={inputClass}
                >
                  <option value="" disabled>
                    Choose an address
                  </option>
                  {savedAddresses.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.label} — {entry.address}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-sm font-semibold text-ink">
                  Full Name <span className="text-accent">*</span>
                </label>
                <input
                  id="name"
                  name="name"
                  required
                  value={form.name}
                  onChange={(e) => updateField("name", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="phone" className="text-sm font-semibold text-ink">
                  Phone Number <span className="text-accent">*</span>
                </label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  required
                  value={form.phone}
                  onChange={(e) => updateField("phone", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold text-ink">
                Email Address <span className="text-accent">*</span>
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                value={form.email}
                onChange={(e) => updateField("email", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="address" className="text-sm font-semibold text-ink">
                Delivery Address <span className="text-accent">*</span>
              </label>
              <textarea
                id="address"
                required
                rows={3}
                value={form.address}
                onChange={(e) => updateField("address", e.target.value)}
                className={inputClass}
              />
            </div>

            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="city" className="text-sm font-semibold text-ink">
                  City <span className="text-accent">*</span>
                </label>
                <input
                  id="city"
                  required
                  value={form.city}
                  onChange={(e) => updateField("city", e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="pincode" className="text-sm font-semibold text-ink">
                  Pincode <span className="text-accent">*</span>
                </label>
                <input
                  id="pincode"
                  required
                  value={form.pincode}
                  onChange={(e) => updateField("pincode", e.target.value)}
                  className={inputClass}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="notes" className="text-sm font-semibold text-ink">
                Delivery Notes (optional)
              </label>
              <textarea
                id="notes"
                rows={2}
                value={form.notes}
                onChange={(e) => updateField("notes", e.target.value)}
                className={inputClass}
              />
            </div>

            {paymentError ? (
              <p role="alert" className="text-sm font-medium text-accent-dark">
                {paymentError}
                {fallbackUrl ? (
                  <>
                    {" "}
                    <a href={fallbackUrl} target="_blank" rel="noopener noreferrer" className="font-semibold underline">
                      Send this order to us on WhatsApp instead
                    </a>
                  </>
                ) : null}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isPaying}
              className="font-heading sticker-shadow mt-2 flex w-full items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
            >
              {isPaying ? "Processing…" : `Pay Now — ${formatInr(total)}`}
            </button>

            <button
              type="button"
              onClick={handleCodOrder}
              disabled={isPaying}
              className="font-heading flex w-full items-center justify-center gap-2 rounded-full border-2 border-ink bg-white px-6 py-3 text-sm font-semibold uppercase tracking-wide text-ink transition-all hover:-translate-y-0.5 sm:w-auto"
            >
              Place Order for COD / UPI on Delivery
            </button>

            <div className="flex items-start gap-3 rounded-xl border-2 border-ink/15 bg-blush px-4 py-3">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="mt-0.5 shrink-0 text-primary-dark">
                <rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p className="text-xs text-dark/70">
                <span className="font-semibold text-ink">Secure checkout.</span> Online payments are processed
                by Razorpay over an encrypted connection — UPI, cards and netbanking accepted. We never see or
                store your card details. Prefer to pay on delivery? Use the second button. Either way you&rsquo;ll
                see your order details here and get the invoice by email.
              </p>
            </div>
          </form>

          <div className="sticker-shadow rounded-2xl border-2 border-ink bg-blush p-6">
            <h2 className="font-heading text-lg font-bold text-ink">Order Summary</h2>
            <ul className="mt-4 flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.key} className="flex items-center justify-between text-sm">
                  <span className="text-dark/75">
                    {item.productName} ({item.packLabel}) × {item.quantity}
                  </span>
                  <span className="font-semibold text-ink">{formatInr(item.price * item.quantity)}</span>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex items-center justify-between border-t-2 border-dashed border-ink/20 pt-4 text-sm text-dark/70">
              <span>Subtotal</span>
              <span className="font-semibold text-ink">{formatInr(subtotal)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between text-sm text-dark/70">
              <span>Delivery</span>
              <span className="font-semibold text-ink">{deliveryFee === 0 ? "Free" : formatInr(deliveryFee)}</span>
            </div>
            {discount > 0 ? (
              <div className="mt-2 flex items-center justify-between text-sm text-dark/70">
                <span>{discountReason ? discountLabels[discountReason] : "Discount"}</span>
                <span className="font-semibold text-green-700">−{formatInr(discount)}</span>
              </div>
            ) : null}
            <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-ink/20 pt-3">
              <span className="font-heading font-bold text-ink">Total</span>
              <span className="font-heading font-bold text-ink">{formatInr(total)}</span>
            </div>
            {signedIn ? (
              <FirstOrderNote offer={{ signedIn, eligible: firstOrderEligible, milkSubscriber }} subtotal={subtotal} next="/checkout" />
            ) : null}
            <Link href="/cart" className="mt-4 block text-center text-sm font-semibold text-primary-dark hover:underline">
              Edit Cart
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
