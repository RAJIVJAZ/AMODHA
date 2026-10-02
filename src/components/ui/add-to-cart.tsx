"use client";

import Link from "next/link";
import { useState } from "react";
import { useCart } from "@/lib/cart-context";
import { formatInr } from "@/lib/currency";
import {
  DELIVERY_AREA,
  DELIVERY_FEE,
  FREE_DELIVERY_THRESHOLD,
  MAX_ONLINE_ORDER_GRAMS,
  formatGrams,
} from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";
import type { PackSize, PurchasablePackSize } from "@/data/sweets";

function bulkOrderHref(productName: string) {
  const message = `Hi Mithaiwallah, I'd like to order more than ${formatGrams(MAX_ONLINE_ORDER_GRAMS)} of ${productName}. Please share bulk pricing.`;
  return `https://wa.me/${siteConfig.contact.whatsapp}?text=${encodeURIComponent(message)}`;
}

export function AddToCart({
  slug,
  productName,
  packSizes,
}: {
  slug: string;
  productName: string;
  packSizes: PackSize[];
}) {
  const { addItem, totalGrams } = useCart();
  const purchasable = packSizes.filter((size): size is PurchasablePackSize => size.purchasable);
  const [selectedLabel, setSelectedLabel] = useState(purchasable[0]?.label ?? "");
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);

  const selected = purchasable.find((size) => size.label === selectedLabel);
  const remainingGrams = MAX_ONLINE_ORDER_GRAMS - totalGrams;
  const maxQuantity = selected ? Math.floor(remainingGrams / selected.grams) : 0;
  const canAdd = selected !== undefined && quantity <= maxQuantity;

  function handleAddToCart() {
    if (!selected || !canAdd) return;
    addItem(
      { slug, productName, packLabel: selected.label, price: selected.price, grams: selected.grams, icon: "🍬" },
      quantity
    );
    setJustAdded(true);
    setQuantity(1);
  }

  const bulkLink = (
    <a
      href={bulkOrderHref(productName)}
      target="_blank"
      rel="noopener noreferrer"
      className="font-semibold text-primary-dark underline"
    >
      contact us for bulk pricing
    </a>
  );

  if (purchasable.length === 0) {
    return (
      <p className="text-sm text-dark/60">
        This item is available in bulk only — {bulkLink}.
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
              setQuantity(1);
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
            disabled={quantity >= maxQuantity}
            className="font-heading flex h-8 w-8 items-center justify-center rounded-full text-base font-bold text-ink hover:bg-blush disabled:cursor-not-allowed disabled:opacity-30"
          >
            +
          </button>
        </div>

        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canAdd}
          className="font-heading sticker-shadow flex flex-1 items-center justify-center gap-2 rounded-full border-[2.5px] border-ink bg-accent px-6 py-2.5 text-sm font-semibold uppercase tracking-wide text-white transition-all hover:-translate-y-0.5 hover:bg-accent-dark hover:shadow-[4px_4px_0_0_var(--color-ink)] active:translate-y-0 active:shadow-[1px_1px_0_0_var(--color-ink)] disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
        >
          Add to Cart{selected ? ` — ${formatInr(selected.price * quantity)}` : ""}
        </button>
      </div>

      {!canAdd ? (
        <p className="mt-3 text-sm font-medium text-accent-dark">
          Online orders are limited to {formatGrams(MAX_ONLINE_ORDER_GRAMS)}
          {totalGrams > 0 ? ` and your cart already has ${formatGrams(totalGrams)}` : ""}. Need more? {bulkLink}.
        </p>
      ) : null}

      {justAdded ? (
        <p className="mt-3 text-sm font-semibold text-primary-dark">
          Added to cart —{" "}
          <Link href="/cart" className="underline">
            View Cart
          </Link>
        </p>
      ) : null}

      <ul className="mt-5 flex flex-col gap-1.5 border-t-2 border-dashed border-ink/15 pt-4 text-sm text-dark/70">
        <li>📍 Delivery currently available in {DELIVERY_AREA} only</li>
        <li>
          🚚 Free delivery on orders {formatInr(FREE_DELIVERY_THRESHOLD)}+ ({formatInr(DELIVERY_FEE)} below that)
        </li>
        <li>
          ⚖️ Online orders up to {formatGrams(MAX_ONLINE_ORDER_GRAMS)} — want more? {bulkLink}
        </li>
      </ul>
    </div>
  );
}
