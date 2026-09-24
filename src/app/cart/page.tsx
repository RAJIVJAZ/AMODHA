"use client";

import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();

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
              Amodha Dairy is coming soon — bilona ghee, fresh paneer, farm milk and more. Meanwhile,
              explore Mithaiwallah Sweet Corner.
            </p>
            <ButtonLink href="/" variant="primary">
              Explore Sweet Corner
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
                      className="font-heading flex h-7 w-7 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush"
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
              <p className="mt-1 text-xs text-dark/50">
                Delivery charges (if any) confirmed at checkout based on your location.
              </p>
              <ButtonLink href="/checkout" variant="primary" className="mt-5 w-full">
                Proceed to Checkout
              </ButtonLink>
              <Link
                href="/dairy-products"
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
