export const FREE_DELIVERY_THRESHOLD = 999;
export const DELIVERY_FEE = 69;
export const DELIVERY_AREA = "Prayagraj";

/** Active milk subscribers get free delivery on Mithai Wallah orders from this amount. */
export const SUBSCRIBER_FREE_DELIVERY_MINIMUM = 499;

export function deliveryFeeFor(subtotal: number, milkSubscriber = false) {
  if (milkSubscriber && subtotal >= SUBSCRIBER_FREE_DELIVERY_MINIMUM) return 0;
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}

/** ₹100 off a signed-in customer's first order of ₹499 or more. */
export const FIRST_ORDER_DISCOUNT = 100;
export const FIRST_ORDER_MINIMUM = 499;

export function firstOrderDiscountFor(subtotal: number, eligible: boolean) {
  return eligible && subtotal >= FIRST_ORDER_MINIMUM ? FIRST_ORDER_DISCOUNT : 0;
}

/** Active milk subscribers get this much off Mithai Wallah products (milk itself is excluded). */
export const SUBSCRIBER_DISCOUNT_PERCENT = 20;

export type DiscountReason = "first_order" | "milk_subscriber";

export const discountLabels: Record<DiscountReason, string> = {
  first_order: "First-order discount",
  milk_subscriber: `Milk subscriber discount (${SUBSCRIBER_DISCOUNT_PERCENT}%)`,
};

/**
 * The discount for an order. Offers don't stack: the customer gets whichever is bigger,
 * the ₹100 first-order offer or the milk subscriber percentage.
 */
export function bestDiscountFor(subtotal: number, offers: { firstOrderEligible: boolean; milkSubscriber: boolean }) {
  const firstOrder = firstOrderDiscountFor(subtotal, offers.firstOrderEligible);
  const subscriber = offers.milkSubscriber ? Math.round((subtotal * SUBSCRIBER_DISCOUNT_PERCENT) / 100) : 0;
  if (subscriber > 0 && subscriber >= firstOrder) return { discount: subscriber, reason: "milk_subscriber" as DiscountReason };
  if (firstOrder > 0) return { discount: firstOrder, reason: "first_order" as DiscountReason };
  return { discount: 0, reason: null };
}
