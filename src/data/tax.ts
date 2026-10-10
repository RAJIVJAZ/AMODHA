/**
 * HSN code and GST rate for each product, used on tax invoices. Prices on the site include GST.
 * Please have your CA confirm these: rates change from time to time, and the dry fruit box may
 * fall under a different heading from the sweets.
 */
export type ProductTax = { hsn: string; gstRate: number };

/** Indian sweets (mithai / sweetmeats). */
const SWEETMEATS: ProductTax = { hsn: "21069099", gstRate: 5 };

const overrides: Record<string, ProductTax> = {
  // Fresh milk: nil-rated.
  milk: { hsn: "0401", gstRate: 0 },
  // Mixed dried fruits and nuts.
  "premium-dry-fruit-box": { hsn: "08135020", gstRate: 5 },
};

export function productTax(slug: string): ProductTax {
  return overrides[slug] ?? SWEETMEATS;
}
