import Link from "next/link";
import { formatInr } from "@/lib/currency";
import { FIRST_ORDER_DISCOUNT, FIRST_ORDER_MINIMUM } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";
import type { FirstOrderOffer } from "@/lib/use-first-order-offer";

/** Explains the first-order discount next to an order total: applied, almost there, or sign in to get it. */
export function FirstOrderNote({ offer, subtotal, next }: { offer: FirstOrderOffer | null; subtotal: number; next: string }) {
  if (!offer || !siteConfig.accountsLive) return null;

  if (offer.eligible && subtotal >= FIRST_ORDER_MINIMUM) {
    return (
      <p className="mt-3 rounded-xl border-2 border-green-700/30 bg-green-50 px-3 py-2 text-xs font-semibold text-green-800">
        🎉 Your {formatInr(FIRST_ORDER_DISCOUNT)} first-order discount is applied.
      </p>
    );
  }

  if (offer.eligible) {
    return (
      <p className="mt-3 rounded-xl border-2 border-ink/20 bg-[#fbeec4] px-3 py-2 text-xs font-semibold text-ink">
        🎉 You have {formatInr(FIRST_ORDER_DISCOUNT)} off your first order. Add {formatInr(FIRST_ORDER_MINIMUM - subtotal)} more
        (orders of {formatInr(FIRST_ORDER_MINIMUM)}+) to use it.
      </p>
    );
  }

  if (!offer.signedIn) {
    return (
      <p className="mt-3 rounded-xl border-2 border-ink/20 bg-white px-3 py-2 text-xs text-dark/75">
        First order?{" "}
        <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-semibold text-primary-dark hover:underline">
          Sign up
        </Link>{" "}
        to get {formatInr(FIRST_ORDER_DISCOUNT)} off orders of {formatInr(FIRST_ORDER_MINIMUM)} or more.
      </p>
    );
  }

  return null;
}
