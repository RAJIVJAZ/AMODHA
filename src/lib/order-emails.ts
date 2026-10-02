import type { SupabaseClient } from "@supabase/supabase-js";
import { orderAlertRecipients, sendEmail } from "@/lib/email";
import { formatInr } from "@/lib/currency";
import { discountLabels, type DiscountReason } from "@/lib/order-rules";
import { siteConfig } from "@/lib/site";

export type OrderForEmail = {
  id: string;
  order_number: number;
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
  order_items: { product_name: string; pack_label: string; unit_price: number; quantity: number }[];
};

const escape = (value: string) =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function orderDate(value: string) {
  return new Date(value).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function paymentText(order: OrderForEmail) {
  if (order.payment_method === "cod") return "Cash / UPI on delivery";
  return order.payment_status === "paid"
    ? `Paid online${order.razorpay_payment_id ? ` (Razorpay ${order.razorpay_payment_id})` : ""}`
    : "Online payment pending";
}

function totalsRows(order: OrderForEmail) {
  const rows: [string, string][] = [
    ["Subtotal", formatInr(order.subtotal)],
    ["Delivery", order.delivery_fee === 0 ? "Free" : formatInr(order.delivery_fee)],
  ];
  if (order.discount > 0) {
    rows.push([order.discount_reason ? discountLabels[order.discount_reason] : "Discount", `−${formatInr(order.discount)}`]);
  }
  return rows;
}

export function invoiceEmail(order: OrderForEmail) {
  const plant = siteConfig.address.plant;
  const sellerAddress = `${plant.line1}, ${plant.line2}, ${plant.city}, ${plant.state} ${plant.postalCode}`;
  const itemRows = order.order_items
    .map(
      (item) => `<tr>
        <td style="padding:8px 0;border-bottom:1px solid #eee">${escape(item.product_name)}<br><span style="color:#6b7280;font-size:12px">${escape(item.pack_label)}</span></td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:center">${item.quantity}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatInr(item.unit_price)}</td>
        <td style="padding:8px 0;border-bottom:1px solid #eee;text-align:right">${formatInr(item.unit_price * item.quantity)}</td>
      </tr>`
    )
    .join("");
  const totals = totalsRows(order)
    .map(
      ([label, value]) =>
        `<tr><td colspan="3" style="padding:4px 0;text-align:right;color:#4b5563">${escape(label)}</td><td style="padding:4px 0;text-align:right">${value}</td></tr>`
    )
    .join("");

  const html = `<!doctype html><html><body style="margin:0;background:#fff0f0;font-family:Arial,Helvetica,sans-serif;color:#17202a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:2px solid #16323f;border-radius:16px;padding:28px">
<tr><td>
  <img src="${siteConfig.url}/logos/mithaiwallah.png" alt="${siteConfig.name}" width="140" style="display:block;margin-bottom:12px">
  <h1 style="margin:0;font-size:22px;color:#16323f">Thank you, ${escape(order.customer_name)}! Your order is confirmed.</h1>
  <p style="margin:8px 0 0;color:#4b5563;font-size:14px">We're preparing your sweets fresh in pure desi ghee. You can track your order anytime at <a href="${siteConfig.url}/account" style="color:#1f7a9e">${siteConfig.url.replace("https://", "")}/account</a>.</p>

  <table role="presentation" width="100%" style="margin-top:24px;font-size:14px">
    <tr>
      <td style="vertical-align:top"><strong style="font-size:16px;color:#16323f">Invoice / Order #${order.order_number}</strong><br>
        <span style="color:#4b5563">${orderDate(order.created_at)}</span><br>
        <span style="color:#4b5563">Payment: ${escape(paymentText(order))}</span></td>
      <td style="vertical-align:top;text-align:right;color:#4b5563">
        <strong style="color:#16323f">Deliver to</strong><br>${escape(order.customer_name)}<br>${escape(order.address)}<br>${escape(order.city)} – ${escape(order.pincode)}<br>+91 ${escape(order.phone)}</td>
    </tr>
  </table>

  <table role="presentation" width="100%" style="margin-top:20px;font-size:14px;border-collapse:collapse">
    <tr style="color:#6b7280;font-size:12px;text-transform:uppercase">
      <th align="left" style="padding-bottom:6px;border-bottom:2px solid #16323f">Item</th>
      <th style="padding-bottom:6px;border-bottom:2px solid #16323f">Qty</th>
      <th align="right" style="padding-bottom:6px;border-bottom:2px solid #16323f">Price</th>
      <th align="right" style="padding-bottom:6px;border-bottom:2px solid #16323f">Amount</th>
    </tr>
    ${itemRows}
    ${totals}
    <tr><td colspan="3" style="padding:10px 0 0;text-align:right;font-weight:bold;font-size:16px;color:#16323f">Total</td><td style="padding:10px 0 0;text-align:right;font-weight:bold;font-size:16px;color:#16323f">${formatInr(order.total)}</td></tr>
  </table>
  ${order.notes ? `<p style="margin-top:16px;font-size:13px;color:#4b5563"><strong>Delivery notes:</strong> ${escape(order.notes)}</p>` : ""}

  <p style="margin-top:24px;font-size:13px;color:#4b5563">Questions about your order? Reply to this email, call <a href="tel:${siteConfig.contact.phoneHref}" style="color:#1f7a9e">${siteConfig.contact.phone}</a> or write to ${siteConfig.contact.email}.</p>

  <hr style="border:none;border-top:1px solid #eee;margin:20px 0">
  <p style="margin:0;font-size:12px;color:#6b7280;line-height:1.6">
    <strong style="color:#16323f">${siteConfig.legalName}</strong> (${siteConfig.name})<br>
    ${escape(sellerAddress)}<br>
    FSSAI Lic. No. ${siteConfig.fssaiLicense} · ${siteConfig.url.replace("https://", "")}
  </p>
</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    `Thank you, ${order.customer_name}! Your ${siteConfig.name} order is confirmed.`,
    "",
    `Invoice / Order #${order.order_number} · ${orderDate(order.created_at)}`,
    `Payment: ${paymentText(order)}`,
    "",
    ...order.order_items.map(
      (item) => `${item.product_name} (${item.pack_label}) × ${item.quantity} — ${formatInr(item.unit_price * item.quantity)}`
    ),
    "",
    ...totalsRows(order).map(([label, value]) => `${label}: ${value}`),
    `Total: ${formatInr(order.total)}`,
    "",
    `Deliver to: ${order.customer_name}, ${order.address}, ${order.city} – ${order.pincode}, +91 ${order.phone}`,
    `Track your order: ${siteConfig.url}/account`,
    "",
    `${siteConfig.legalName} (${siteConfig.name}) · ${sellerAddress} · FSSAI Lic. No. ${siteConfig.fssaiLicense}`,
  ].join("\n");

  return { subject: `Your ${siteConfig.name} order #${order.order_number} is confirmed`, html, text };
}

export function orderAlertEmail(order: OrderForEmail) {
  const lines = order.order_items.map((item) => `${item.product_name} (${item.pack_label}) × ${item.quantity}`);
  const details = [
    `${order.milk_subscriber ? "⭐ MILK SUBSCRIBER · PRIORITY\n" : ""}Order #${order.order_number} · ${orderDate(order.created_at)}`,
    `Payment: ${paymentText(order)}`,
    `Total: ${formatInr(order.total)}${order.discount > 0 ? ` (after ${formatInr(order.discount)} discount)` : ""}`,
    "",
    ...lines,
    "",
    `Customer: ${order.customer_name} · +91 ${order.phone}${order.email ? ` · ${order.email}` : ""}`,
    `Address: ${order.address}, ${order.city} – ${order.pincode}`,
    order.notes ? `Notes: ${order.notes}` : "",
    "",
    `Manage it: ${siteConfig.url}/admin`,
  ].filter((line, index, all) => line !== "" || all[index - 1] !== "");
  const text = details.join("\n");
  const html = `<pre style="font-family:Arial,Helvetica,sans-serif;font-size:14px;white-space:pre-wrap">${escape(text)}</pre>`;
  const payment = order.payment_method === "cod" ? "COD" : "Paid online";
  return {
    subject: `🛒 New order #${order.order_number} · ${formatInr(order.total)} · ${payment}${order.milk_subscriber ? " · ⭐ subscriber" : ""}`,
    html,
    text,
  };
}

/**
 * Emails the customer their invoice and the team a new-order alert, once per order.
 * The invoice_emailed_at column is claimed first, so a repeated call (verify + webhook) sends nothing.
 */
export async function sendOrderEmails(admin: SupabaseClient, orderId: string) {
  const { data: claimed } = await admin
    .from("orders")
    .update({ invoice_emailed_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("invoice_emailed_at", null)
    .select(
      "id, order_number, created_at, customer_name, phone, email, address, city, pincode, notes, payment_method, payment_status, razorpay_payment_id, subtotal, delivery_fee, discount, discount_reason, total, milk_subscriber, order_items(product_name, pack_label, unit_price, quantity)"
    )
    .maybeSingle();
  if (!claimed) return;
  const order = claimed as OrderForEmail;

  const [invoiceSent] = await Promise.all([
    order.email ? sendEmail({ to: order.email, ...invoiceEmail(order) }) : Promise.resolve(false),
    sendEmail({ to: orderAlertRecipients, replyTo: order.email ?? undefined, ...orderAlertEmail(order) }),
  ]);

  // Let a later call retry if the customer's invoice didn't go out.
  if (order.email && !invoiceSent) {
    await admin.from("orders").update({ invoice_emailed_at: null }).eq("id", order.id);
  }
}
