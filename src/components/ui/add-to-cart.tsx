"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import type { PackSize } from "@/data/dairy-products";

type AddToCartProps = {
  slug: string;
  productName: string;
  icon: string;
  packSizes: PackSize[];
};

export function AddToCart({ slug, productName, icon, packSizes }: AddToCartProps) {
  const { addItem } = useCart();
  const firstPurchasable = packSizes.findIndex((p) => p.purchasable);
  const [selectedIndex, setSelectedIndex] = useState(firstPurchasable >= 0 ? firstPurchasable : 0);
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const selected = packSizes[selectedIndex];

  function handleAdd() {
    if (!selected.purchasable) return;
    addItem(
      { slug, productName, packLabel: selected.label, price: selected.price, icon },
      quantity
    );
    setJustAdded(true);
    window.setTimeout(() => setJustAdded(false), 2500);
  }

  return (
    <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-6">
      <h2 className="font-heading text-lg font-bold text-ink">Choose a Pack Size</h2>
      <div className="mt-3 flex flex-wrap gap-2">
        {packSizes.map((pack, index) => (
          <button
            key={pack.label}
            type="button"
            onClick={() => {
              setSelectedIndex(index);
              setQuantity(1);
            }}
            aria-pressed={selectedIndex === index}
            className={`rounded-full border-2 px-3 py-1.5 text-sm font-medium transition-colors ${
              selectedIndex === index
                ? "border-ink bg-primary-light text-ink"
                : "border-ink/20 bg-blush text-ink/70 hover:border-ink/50"
            }`}
          >
            {pack.label}
            {!pack.purchasable ? <span className="ml-1 text-xs text-ink/50">(bulk)</span> : null}
          </button>
        ))}
      </div>

      {selected.purchasable ? (
        <>
          <div className="mt-5 flex items-center justify-between">
            <span className="font-heading text-2xl font-bold text-ink">{formatInr(selected.price)}</span>
            <div className="flex items-center gap-3 rounded-full border-2 border-ink px-1 py-1">
              <button
                type="button"
                aria-label="Decrease quantity"
                onClick={() => setQuantity((q) => Math.max(1, q - 1))}
                className="font-heading flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-ink hover:bg-blush"
              >
                −
              </button>
              <span className="font-heading w-6 text-center font-bold text-ink" aria-live="polite">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                onClick={() => setQuantity((q) => Math.min(20, q + 1))}
                className="font-heading flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold text-ink hover:bg-blush"
              >
                +
              </button>
            </div>
          </div>

          <button
            type="button"
            onClick={handleAdd}
            className="font-heading sticker-shadow mt-4 flex w-full items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)]"
          >
            Add to Cart — {formatInr(selected.price * quantity)}
          </button>

          {justAdded ? (
            <p role="status" className="mt-3 text-center text-sm font-medium text-primary-dark">
              Added to cart!{" "}
              <Link href="/cart" className="underline underline-offset-2">
                View Cart
              </Link>
            </p>
          ) : null}
        </>
      ) : (
        <div className="mt-5">
          <p className="text-sm text-dark/70">
            {selected.label} is a bulk/institutional size — priced around{" "}
            <span className="font-semibold text-ink">{formatInr(selected.price)}</span> and confirmed
            directly with our sales team.
          </p>
          <Link
            href="/wholesale"
            className="font-heading sticker-shadow mt-4 flex w-full items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-primary px-6 py-3 text-sm font-semibold uppercase tracking-wide text-ink transition-all hover:-translate-y-0.5 hover:shadow-[4px_4px_0_0_var(--color-ink)]"
          >
            Get Bulk Pricing
          </Link>
        </div>
      )}
    </div>
  );
}
