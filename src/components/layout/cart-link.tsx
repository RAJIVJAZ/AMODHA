"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-context";

export function CartLink({ onClick }: { onClick?: () => void }) {
  const { itemCount } = useCart();

  return (
    <Link
      href="/cart"
      onClick={onClick}
      aria-label={`Cart, ${itemCount} item${itemCount === 1 ? "" : "s"}`}
      className="relative flex h-10 w-10 items-center justify-center rounded-full border-2 border-ink bg-white transition-transform hover:-translate-y-0.5"
    >
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M3 3h2l.4 2M7 13h10l3-8H5.4M7 13L5.4 5M7 13l-1.7 4.5A1 1 0 0 0 6.24 19H18"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="9" cy="21.5" r="1.5" fill="currentColor" />
        <circle cx="17" cy="21.5" r="1.5" fill="currentColor" />
      </svg>
      {itemCount > 0 ? (
        <span
          aria-hidden="true"
          className="font-heading absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-ink bg-accent px-1 text-[10px] font-bold text-white"
        >
          {itemCount > 99 ? "99+" : itemCount}
        </span>
      ) : null}
    </Link>
  );
}
