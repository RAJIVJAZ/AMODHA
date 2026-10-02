export const FREE_DELIVERY_THRESHOLD = 999;
export const DELIVERY_FEE = 69;
export const DELIVERY_AREA = "Prayagraj";

export function deliveryFeeFor(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}

/** ₹100 off a signed-in customer's first order of ₹499 or more. */
export const FIRST_ORDER_DISCOUNT = 100;
export const FIRST_ORDER_MINIMUM = 499;

export function firstOrderDiscountFor(subtotal: number, eligible: boolean) {
  return eligible && subtotal >= FIRST_ORDER_MINIMUM ? FIRST_ORDER_DISCOUNT : 0;
}
