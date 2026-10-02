"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import {
  DELIVERY_AREA,
  FREE_DELIVERY_THRESHOLD,
  MAX_ONLINE_ORDER_GRAMS,
  deliveryFeeFor,
  formatGrams,
} from "@/lib/order-rules";

export default function CartPage() {
  const { items, subtotal, totalGrams, updateQuantity, removeItem } = useCart();
  const deliveryFee = deliveryFeeFor(subtotal);
  const overLimit = totalGrams > MAX_ONLINE_ORDER_GRAMS;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Cart" }]} />

      <section className="container-site py-14 sm:py-20">
        <h1 className="text-3xl font-bold text-ink sm:text-4xl">Your Cart</h1>

        {items.length === 0 ? (
          <div className="sticker-shadow mt-8 flex flex-col items-center gap-4 rounded-3xl border-2 border-ink bg-blush p-12 text-center">
            <span aria-hidden="true" className="text-5xl">
              🛒
            </span>
            <p className="font-heading text-xl font-bold text-ink">Your cart is empty</p>
            <p className="max-w-sm text-sm text-dark/70">
              Fresh mithai made in 100% pure desi ghee, delivered across {DELIVERY_AREA} — free on orders{" "}
              {formatInr(FREE_DELIVERY_THRESHOLD)}+.
            </p>
            <ButtonLink href="/#catalog" variant="primary">
              Browse Sweets
            </ButtonLink>
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_360px] lg:items-start">
            <ul className="flex flex-col gap-4">
              {items.map((item) => (
                <li
                  key={item.key}
                  className="sticker-shadow-sm flex flex-wrap items-center gap-4 rounded-2xl border-2 border-ink bg-white p-4 sm:flex-nowrap"
                >
                  <span
                    aria-hidden="true"
                    className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border-2 border-ink text-2xl"
                    style={{ backgroundColor: "var(--color-blush)" }}
                  >
                    {item.icon}
                  </span>
                  <div className="min-w-[9rem] flex-1">
                    <p className="font-heading font-bold text-ink">{item.productName}</p>
                    <p className="text-sm text-dark/60">{item.packLabel}</p>
                  </div>
                  <div className="flex items-center gap-2 rounded-full border-2 border-ink px-1 py-1">
                    <button
                      type="button"
                      aria-label={`Decrease quantity of ${item.productName}`}
                      onClick={() => updateQuantity(item.key, item.quantity - 1)}
                      className="font-heading flex h-7 w-7 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush"
                    >
                      −
                    </button>
                    <span className="font-heading w-5 text-center text-sm font-bold text-ink">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      aria-label={`Increase quantity of ${item.productName}`}
                      onClick={() => updateQuantity(item.key, item.quantity + 1)}
                      disabled={totalGrams + item.grams > MAX_ONLINE_ORDER_GRAMS}
                      className="font-heading flex h-7 w-7 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush disabled:cursor-not-allowed disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <span className="font-heading w-24 text-right font-bold text-ink">
                    {formatInr(item.price * item.quantity)}
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${item.productName} from cart`}
                    onClick={() => removeItem(item.key)}
                    className="text-sm font-semibold text-accent hover:text-accent-dark"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <div className="sticker-shadow sticky top-24 rounded-2xl border-2 border-ink bg-blush p-6">
              <h2 className="font-heading text-lg font-bold text-ink">Order Summary</h2>
              <div className="mt-4 flex items-center justify-between text-sm text-dark/70">
                <span>Subtotal</span>
                <span className="font-semibold text-ink">{formatInr(subtotal)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between text-sm text-dark/70">
                <span>Delivery</span>
                <span className="font-semibold text-ink">{deliveryFee === 0 ? "Free" : formatInr(deliveryFee)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between border-t-2 border-dashed border-ink/20 pt-3">
                <span className="font-heading font-bold text-ink">Total</span>
                <span className="font-heading font-bold text-ink">{formatInr(subtotal + deliveryFee)}</span>
              </div>
              {deliveryFee > 0 ? (
                <p className="mt-2 text-xs font-medium text-primary-dark">
                  Add {formatInr(FREE_DELIVERY_THRESHOLD - subtotal)} more for free delivery.
                </p>
              ) : null}
              <p className="mt-2 text-xs text-dark/50">
                Delivering in {DELIVERY_AREA} only · {formatGrams(totalGrams)} of {formatGrams(MAX_ONLINE_ORDER_GRAMS)} online
                limit used
              </p>
              {overLimit ? (
                <p className="mt-3 text-sm font-medium text-accent-dark">
                  Online orders are limited to {formatGrams(MAX_ONLINE_ORDER_GRAMS)}. Please reduce your cart or{" "}
                  <Link href="/contact" className="underline">
                    contact us for bulk pricing
                  </Link>
                  .
                </p>
              ) : (
                <ButtonLink href="/checkout" variant="primary" className="mt-5 w-full">
                  Proceed to Checkout
                </ButtonLink>
              )}
              <Link
                href="/"
                className="mt-3 block text-center text-sm font-semibold text-primary-dark hover:underline"
              >
                Continue Shopping
              </Link>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
