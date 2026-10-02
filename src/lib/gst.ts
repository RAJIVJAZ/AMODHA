import { productTax } from "@/data/tax";

export type TaxableLine = {
  slug: string;
  product_name: string;
  pack_label: string;
  unit_price: number;
  quantity: number;
  hsn: string | null;
  gst_rate: number | null;
};

export type TaxedLine = TaxableLine & { hsn: string; rate: number; gross: number; taxable: number; tax: number };
export type TaxGroup = { rate: number; taxable: number; cgst: number; sgst: number };

/**
 * Splits a GST-inclusive order into taxable value and CGST/SGST (intra-state supply).
 * Delivery charges and discounts are spread over the lines in proportion to their value,
 * so the taxable values add up exactly to the amount the customer paid. Works in paise.
 */
export function gstBreakdown(lines: TaxableLine[], deliveryFee: number, discount: number) {
  const gross = lines.map((line) => line.unit_price * line.quantity * 100);
  const sumGross = gross.reduce((a, b) => a + b, 0);
  const adjust = (deliveryFee - discount) * 100;

  let allocated = 0;
  const net = gross.map((value, index) => {
    if (index === gross.length - 1) return value + (adjust - allocated);
    const share = sumGross > 0 ? Math.round((adjust * value) / sumGross) : 0;
    allocated += share;
    return value + share;
  });

  const taxed: TaxedLine[] = lines.map((line, index) => {
    const fallback = productTax(line.slug);
    const rate = Number(line.gst_rate ?? fallback.gstRate);
    const taxable = Math.round((net[index] * 100) / (100 + rate));
    return {
      ...line,
      hsn: line.hsn ?? fallback.hsn,
      rate,
      gross: gross[index] / 100,
      taxable: taxable / 100,
      tax: (net[index] - taxable) / 100,
    };
  });

  const byRate = new Map<number, { taxable: number; tax: number }>();
  for (const [index, line] of taxed.entries()) {
    const taxablePaise = Math.round(line.taxable * 100);
    const entry = byRate.get(line.rate) ?? { taxable: 0, tax: 0 };
    entry.taxable += taxablePaise;
    entry.tax += net[index] - taxablePaise;
    byRate.set(line.rate, entry);
  }
  const groups: TaxGroup[] = [...byRate.entries()]
    .sort(([a], [b]) => a - b)
    .map(([rate, { taxable, tax }]) => {
      const cgst = Math.round(tax / 2);
      return { rate, taxable: taxable / 100, cgst: cgst / 100, sgst: (tax - cgst) / 100 };
    });

  const totalTaxable = groups.reduce((sum, group) => sum + group.taxable, 0);
  const totalTax = groups.reduce((sum, group) => sum + group.cgst + group.sgst, 0);
  return { lines: taxed, groups, totalTaxable, totalTax };
}

/** ₹ with paise, for tax figures. */
export function formatInrPaise(amount: number) {
  return new Intl.NumberFormat("en-IN", { style: "currency", currency: "INR", minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
    amount
  );
}
