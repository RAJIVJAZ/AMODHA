import Link from "next/link";
import { formatInr } from "@/lib/currency";
import { FIRST_ORDER_DISCOUNT, FIRST_ORDER_MINIMUM, SUBSCRIBER_FREE_DELIVERY_MINIMUM } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";
import type { FirstOrderOffer } from "@/lib/use-first-order-offer";

function SubscriberNote({ subtotal }: { subtotal: number }) {
  return (
    <p className="mt-3 rounded-xl border-2 border-primary-dark/30 bg-primary-light/20 px-3 py-2 text-xs font-semibold text-ink">
      🥛 Milk subscriber:{" "}
      {subtotal >= SUBSCRIBER_FREE_DELIVERY_MINIMUM
        ? "free delivery applied."
        : `free delivery on orders of ${formatInr(SUBSCRIBER_FREE_DELIVERY_MINIMUM)}+.`}
    </p>
  );
}

function FirstOrder({ offer, subtotal, next }: { offer: FirstOrderOffer; subtotal: number; next: string }) {
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

/** Explains the customer's offers next to an order total: first-order discount and milk subscriber delivery. */
export function FirstOrderNote({ offer, subtotal, next }: { offer: FirstOrderOffer | null; subtotal: number; next: string }) {
  if (!offer || !siteConfig.accountsLive) return null;
  return (
    <>
      {offer.milkSubscriber ? <SubscriberNote subtotal={subtotal} /> : null}
      <FirstOrder offer={offer} subtotal={subtotal} next={next} />
    </>
  );
}
