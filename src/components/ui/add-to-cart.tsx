"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import type { PackSize } from "@/data/sweets";

export function AddToCart({
  slug,
  productName,
  packSizes,
}: {
  slug: string;
  productName: string;
  packSizes: PackSize[];
}) {
  const { addItem } = useCart();
  const purchasable = packSizes.filter((size) => size.purchasable);
  const bulkOnly = packSizes.filter((size) => !size.purchasable);
  const [selectedLabel, setSelectedLabel] = useState(purchasable[0]?.label ?? "");
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const selected = purchasable.find((size) => size.label === selectedLabel);

  function handleAddToCart() {
    if (!selected) return;
    addItem(
      { slug, productName, packLabel: selected.label, price: selected.price, icon: "🍬" },
      quantity
    );
    setJustAdded(true);
    setQuantity(1);
  }

  if (purchasable.length === 0) {
    return (
      <p className="text-sm text-dark/60">
        This item is available in bulk only — reach out via{" "}
        <Link href="/wholesale" className="font-semibold text-primary-dark hover:underline">
          our wholesale enquiry
        </Link>{" "}
        for pricing.
      </p>
    );
  }

  return (
    <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-6">
      <h2 className="font-heading text-lg font-bold text-ink">Add to Cart</h2>

      <div className="mt-4 flex flex-wrap gap-2">
        {purchasable.map((size) => (
          <button
            key={size.label}
            type="button"
            onClick={() => {
              setSelectedLabel(size.label);
              setJustAdded(false);
            }}
            className={`rounded-full border-2 px-4 py-2 text-sm font-semibold transition-colors ${
              selectedLabel === size.label
                ? "border-ink bg-accent text-white"
                : "border-ink/20 bg-blush text-ink hover:border-ink/50"
            }`}
          >
            {size.label} — {formatInr(size.price)}
          </button>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2 rounded-full border-2 border-ink px-1 py-1">
          <button
            type="button"
            aria-label="Decrease quantity"
            onClick={() => setQuantity((q) => Math.max(1, q - 1))}
            className="font-heading flex h-8 w-8 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush"
          >
            −
          </button>
          <span className="font-heading w-6 text-center text-sm font-bold text-ink">{quantity}</span>
          <button
            type="button"
            aria-label="Increase quantity"
            onClick={() => setQuantity((q) => q + 1)}
            className="font-heading flex h-8 w-8 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!selected}
          className="font-heading sticker-shadow flex flex-1 items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-accent px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
        >
          Add to Cart{selected ? ` — ${formatInr(selected.price * quantity)}` : ""}
        </button>
      </div>

      {justAdded ? (
        <p className="mt-3 text-sm font-semibold text-primary-dark">
          Added to cart —{" "}
          <Link href="/cart" className="underline">
            View Cart
          </Link>
        </p>
      ) : null}

      {bulkOnly.length > 0 ? (
        <p className="mt-4 text-xs text-dark/50">
          Also available in bulk ({bulkOnly.map((size) => size.label).join(", ")}) — contact us via{" "}
          <Link href="/wholesale" className="font-semibold text-primary-dark hover:underline">
            wholesale enquiry
          </Link>
          .
        </p>
      ) : null}
    </div>
  );
}
