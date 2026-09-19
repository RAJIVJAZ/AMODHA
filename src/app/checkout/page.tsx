"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import { siteConfig } from "@/lib/site";

const inputClass =
  "rounded-xl border-2 border-ink/30 px-3 py-2.5 text-sm text-dark focus:border-primary focus:outline-none";

export default function CheckoutPage() {
  const { items, subtotal, clearCart } = useCart();
  const [placed, setPlaced] = useState(false);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    email: "",
    address: "",
    city: "",
    pincode: "",
    notes: "",
  });

  function updateField(name: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const lines = [
      "New Order from amodhadairy.com",
      "",
      "Items:",
      ...items.map(
        (item) => `- ${item.productName} (${item.packLabel}) x${item.quantity} — ${formatInr(item.price * item.quantity)}`
      ),
      "",
      `Subtotal: ${formatInr(subtotal)}`,
      "",
      `Name: ${form.name}`,
      `Phone: ${form.phone}`,
      form.email ? `Email: ${form.email}` : "",
      `Delivery Address: ${form.address}, ${form.city} - ${form.pincode}`,
      form.notes ? `Notes: ${form.notes}` : "",
      "",
      "Payment: To be confirmed with the team (COD / UPI on delivery).",
    ].filter(Boolean);

    const message = encodeURIComponent(lines.join("\n"));
    window.open(`https://wa.me/${siteConfig.contact.whatsapp}?text=${message}`, "_blank", "noopener,noreferrer");
    setPlaced(true);
    clearCart();
  }

  if (placed) {
    return (
      <section className="container-site flex flex-col items-center gap-4 py-24 text-center">
        <span aria-hidden="true" className="text-5xl">
          ✅
        </span>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Order Sent!</h1>
        <p className="max-w-md text-dark/70">
          We&rsquo;ve opened WhatsApp with your order details pre-filled — please send that message so
          our team can confirm availability, delivery timing and payment (COD or UPI on delivery).
        </p>
        <ButtonLink href="/dairy-products" variant="primary">
          Continue Shopping
        </ButtonLink>
      </section>
    );
  }

  if (items.length === 0) {
    return (
      <section className="container-site flex flex-col items-center gap-4 py-24 text-center">
        <span aria-hidden="true" className="text-5xl">
          🛒
        </span>
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Your Cart Is Empty</h1>
        <p className="max-w-md text-dark/70">Add a few products before checking out.</p>
        <ButtonLink href="/dairy-products" variant="primary">
          Shop Dairy Products
        </ButtonLink>
      </section>
    );
  }

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart", href: "/cart" }, { label: "Checkout" }]} />

      <section className="container-site py-14 sm:py-20">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Checkout</h1>
        <p className="mt-2 max-w-xl text-dark/70">
          Fill in your delivery details below. Placing your order opens WhatsApp with everything
          pre-filled so our team can confirm it directly with you — payment is settled as COD or UPI on
          delivery.
        </p>

        <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-[1.2fr_1fr] lg:items-start">
          <form onSubmit={handleSubmit} className="sticker-shadow flex flex-col gap-5 rounded-2xl border-2 border-ink bg-white p-6 sm:p-8">
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="name" className="text-sm font-semibold text-ink">
                  Full Name <span className="text-accent">*</span>
                </label>
                <input
                  id="name"
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
                Email Address
              </label>
              <input
                id="email"
                type="email"
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

            <button
              type="submit"
              className="font-heading sticker-shadow mt-2 flex w-full items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)] sm:w-auto"
            >
              Place Order via WhatsApp — {formatInr(subtotal)}
            </button>
            <p className="text-xs text-dark/50">
              We don&rsquo;t process card/UPI payments on this site yet — your order is confirmed
              directly with our team over WhatsApp, with payment as Cash on Delivery or UPI on
              delivery.
            </p>
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
            <div className="mt-4 flex items-center justify-between border-t-2 border-dashed border-ink/20 pt-4">
              <span className="font-heading font-bold text-ink">Subtotal</span>
              <span className="font-heading font-bold text-ink">{formatInr(subtotal)}</span>
            </div>
            <Link href="/cart" className="mt-4 block text-center text-sm font-semibold text-primary-dark hover:underline">
              Edit Cart
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
