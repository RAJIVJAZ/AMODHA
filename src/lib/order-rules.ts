export const MAX_ONLINE_ORDER_GRAMS = 1000;
export const FREE_DELIVERY_THRESHOLD = 999;
export const DELIVERY_FEE = 69;
export const DELIVERY_AREA = "Prayagraj";

export function deliveryFeeFor(subtotal: number) {
  return subtotal >= FREE_DELIVERY_THRESHOLD ? 0 : DELIVERY_FEE;
}

export function formatGrams(grams: number) {
  return grams >= 1000 ? `${grams / 1000} kg` : `${grams} g`;
}
