import { formatInr } from "@/lib/currency";
import { formatInrPaise, gstBreakdown, type TaxableLine } from "@/lib/gst";
import { discountLabels, type DiscountReason } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";

export type InvoiceOrder = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  invoice_date: string | null;
  created_at: string;
  customer_name: string;
  phone: string;
  email: string | null;
  address: string;
  city: string;
  pincode: string;
  notes: string | null;
  payment_method: "online" | "cod";
  payment_status: string;
  razorpay_payment_id: string | null;
  subtotal: number;
  delivery_fee: number;
  discount: number;
  discount_reason: DiscountReason | null;
  total: number;
  milk_subscriber: boolean;
  order_items: TaxableLine[];
};

export const escapeHtml = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function indianDate(value: string, withTime = false) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "numeric", minute: "2-digit" } : {}),
    timeZone: "Asia/Kolkata",
  });
}

export function paymentText(order: InvoiceOrder) {
  if (order.payment_method === "cod") return "Cash / UPI on delivery";
  return order.payment_status === "paid"
    ? `Paid online${order.razorpay_payment_id ? ` (Razorpay ${order.razorpay_payment_id})` : ""}`
    : "Online payment pending";
}

const cell = "padding:7px 6px;border-bottom:1px solid #e5e7eb;vertical-align:top";
const head = "padding:7px 6px;border-bottom:2px solid #16323f;font-size:11px;text-transform:uppercase;color:#4b5563";

/** The GST tax invoice as an HTML block (inline styles, so it works in email and on the web). */
export function taxInvoiceSection(order: InvoiceOrder) {
  const { lines, groups, totalTaxable, totalTax } = gstBreakdown(order.order_items, order.delivery_fee, order.discount);
  const plant = siteConfig.address.plant;
  const state = siteConfig.gstState;

  const itemRows = lines
    .map(
      (line, index) => `<tr>
      <td style="${cell}">${index + 1}</td>
      <td style="${cell}">${escapeHtml(line.product_name)}<br><span style="color:#6b7280;font-size:12px">${escapeHtml(line.pack_label)}</span></td>
      <td style="${cell}">${escapeHtml(line.hsn)}</td>
      <td style="${cell};text-align:center">${line.quantity}</td>
      <td style="${cell};text-align:right">${formatInr(line.unit_price)}</td>
      <td style="${cell};text-align:center">${line.rate}%</td>
      <td style="${cell};text-align:right">${formatInr(line.gross)}</td>
    </tr>`
    )
    .join("");

  const summaryRows: [string, string][] = [
    ["Items total", formatInr(order.subtotal)],
    ["Delivery", order.delivery_fee === 0 ? "Free" : formatInr(order.delivery_fee)],
  ];
  if (order.discount > 0) {
    summaryRows.push([order.discount_reason ? discountLabels[order.discount_reason] : "Discount", `−${formatInr(order.discount)}`]);
  }

  const taxRows = groups
    .map(
      (group) => `<tr>
      <td style="${cell}">${group.rate}%</td>
      <td style="${cell};text-align:right">${formatInrPaise(group.taxable)}</td>
      <td style="${cell};text-align:right">${formatInrPaise(group.cgst)} <span style="color:#6b7280">(${group.rate / 2}%)</span></td>
      <td style="${cell};text-align:right">${formatInrPaise(group.sgst)} <span style="color:#6b7280">(${group.rate / 2}%)</span></td>
      <td style="${cell};text-align:right">${formatInrPaise(group.cgst + group.sgst)}</td>
    </tr>`
    )
    .join("");

  return `
<table role="presentation" width="100%" style="font-size:13px;border-collapse:collapse">
  <tr>
    <td style="vertical-align:top;padding-bottom:14px">
      <div style="font-size:18px;font-weight:bold;color:#16323f;letter-spacing:.04em">TAX INVOICE</div>
      <div style="color:#4b5563;margin-top:4px">
        Invoice No.: <strong style="color:#16323f;white-space:nowrap">${escapeHtml(order.invoice_number ?? "Pending")}</strong><br>
        Invoice date: ${indianDate(order.invoice_date ?? order.created_at)}<br>
        Order: #${order.order_number}<br>
        Payment: ${escapeHtml(paymentText(order))}
      </div>
    </td>
    <td style="vertical-align:top;text-align:right;padding-bottom:14px;color:#4b5563">
      <strong style="color:#16323f">${escapeHtml(siteConfig.legalName)}</strong><br>
      (${escapeHtml(siteConfig.name)})<br>
      ${escapeHtml(plant.line1)}, ${escapeHtml(plant.line2)}<br>
      ${escapeHtml(plant.city)}, ${escapeHtml(plant.state)} ${escapeHtml(plant.postalCode)}<br>
      GSTIN: <strong style="color:#16323f">${siteConfig.gstin}</strong><br>
      State: ${state.name} (${state.code})<br>
      FSSAI Lic. No.: ${siteConfig.fssaiLicense}
    </td>
  </tr>
  <tr>
    <td colspan="2" style="padding:10px 12px;background:#fff0f0;border-radius:8px;color:#4b5563">
      <strong style="color:#16323f">Bill to / Ship to:</strong> ${escapeHtml(order.customer_name)}, ${escapeHtml(order.address)}, ${escapeHtml(order.city)} – ${escapeHtml(order.pincode)} · +91 ${escapeHtml(order.phone)}<br>
      Place of supply: ${state.name} (${state.code}) · Reverse charge: No
    </td>
  </tr>
</table>

<table role="presentation" width="100%" style="margin-top:14px;font-size:13px;border-collapse:collapse">
  <tr>
    <th align="left" style="${head}">#</th>
    <th align="left" style="${head}">Item</th>
    <th align="left" style="${head}">HSN</th>
    <th style="${head}">Qty</th>
    <th align="right" style="${head}">Rate*</th>
    <th style="${head}">GST</th>
    <th align="right" style="${head}">Amount*</th>
  </tr>
  ${itemRows}
</table>

<table role="presentation" width="100%" style="margin-top:6px;font-size:13px;border-collapse:collapse">
  ${summaryRows
    .map(
      ([label, value]) =>
        `<tr><td style="padding:4px 6px;text-align:right;color:#4b5563">${escapeHtml(label)}</td><td style="padding:4px 6px;text-align:right;width:120px">${value}</td></tr>`
    )
    .join("")}
  <tr><td style="padding:8px 6px;text-align:right;font-weight:bold;font-size:15px;color:#16323f;border-top:2px solid #16323f">Total (incl. GST)</td><td style="padding:8px 6px;text-align:right;font-weight:bold;font-size:15px;color:#16323f;border-top:2px solid #16323f">${formatInr(order.total)}</td></tr>
</table>

<table role="presentation" width="100%" style="margin-top:16px;font-size:12px;border-collapse:collapse">
  <tr>
    <th align="left" style="${head}">GST rate</th>
    <th align="right" style="${head}">Taxable value</th>
    <th align="right" style="${head}">CGST</th>
    <th align="right" style="${head}">SGST</th>
    <th align="right" style="${head}">Total tax</th>
  </tr>
  ${taxRows}
  <tr>
    <td style="padding:7px 6px;font-weight:bold">Total</td>
    <td style="padding:7px 6px;text-align:right;font-weight:bold">${formatInrPaise(totalTaxable)}</td>
    <td colspan="2"></td>
    <td style="padding:7px 6px;text-align:right;font-weight:bold">${formatInrPaise(totalTax)}</td>
  </tr>
</table>
<p style="margin:10px 0 0;font-size:11px;color:#6b7280">* Prices include GST. Delivery charges and discounts are included in the taxable value. This is a computer-generated invoice and does not require a signature.</p>`;
}

/** A standalone, printable invoice page. */
export function invoicePageHtml(order: InvoiceOrder) {
  const title = `Tax Invoice ${order.invoice_number ?? ""} · ${siteConfig.name}`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex"><title>${escapeHtml(title)}</title>
<style>
  body{margin:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#17202a}
  .sheet{max-width:780px;margin:24px auto;background:#fff;padding:28px;border:1px solid #d1d5db;border-radius:12px}
  .bar{max-width:780px;margin:24px auto 0;display:flex;justify-content:space-between;align-items:center;padding:0 4px}
  .bar button{background:#ff6b4a;color:#fff;border:2px solid #16323f;border-radius:999px;padding:10px 18px;font-weight:bold;cursor:pointer}
  .bar a{color:#1f7a9e;font-size:14px}
  @media print{body{background:#fff}.bar{display:none}.sheet{margin:0;border:none;border-radius:0;padding:0}}
</style></head><body>
<div class="bar"><a href="${siteConfig.url}">← ${escapeHtml(siteConfig.name)}</a><button onclick="window.print()">Print / Save as PDF</button></div>
<div class="sheet">
  <img src="${siteConfig.url}/logos/mithaiwallah.png" alt="${escapeHtml(siteConfig.name)}" width="120" style="display:block;margin-bottom:14px">
  ${taxInvoiceSection(order)}
</div></body></html>`;
}
