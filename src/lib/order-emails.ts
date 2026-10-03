import type { SupabaseClient } from "@supabase/supabase-js";
import { orderAlertRecipients, sendEmail } from "@/lib/email";
import { formatInr } from "@/lib/currency";
import { invoiceUrl } from "@/lib/invoice-link";
import { siteConfig } from "@/lib/site";
import { escapeHtml as escape, indianDate, paymentText, taxInvoiceSection, type InvoiceOrder } from "@/lib/tax-invoice";

export type OrderForEmail = InvoiceOrder;

export const invoiceOrderColumns =
  "id, order_number, invoice_number, invoice_date, created_at, customer_name, phone, email, address, city, pincode, notes, payment_method, payment_status, razorpay_payment_id, subtotal, delivery_fee, discount, discount_reason, total, milk_subscriber, order_items(slug, product_name, pack_label, unit_price, quantity, hsn, gst_rate)";

const orderDate = (value: string) => indianDate(value, true);

export function invoiceEmail(order: OrderForEmail) {
  const link = invoiceUrl(order.id);
  const html = `<!doctype html><html><body style="margin:0;background:#fff0f0;font-family:Arial,Helvetica,sans-serif;color:#17202a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#fff0f0;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:2px solid #16323f;border-radius:16px;padding:28px">
<tr><td>
  <img src="${siteConfig.url}/logos/mithaiwallah.png" alt="${siteConfig.name}" width="140" style="display:block;margin-bottom:12px">
  <h1 style="margin:0;font-size:22px;color:#16323f">Thank you, ${escape(order.customer_name)}! Your order is confirmed.</h1>
  <p style="margin:8px 0 0;color:#4b5563;font-size:14px">We're preparing your sweets fresh in pure desi ghee. Your GST tax invoice is below. You can track your order anytime at <a href="${siteConfig.url}/account" style="color:#1f7a9e">${siteConfig.url.replace("https://", "")}/account</a>.</p>
  <p style="margin:16px 0 20px"><a href="${link}" style="display:inline-block;background:#ff6b4a;color:#ffffff;text-decoration:none;font-weight:bold;font-size:14px;padding:10px 18px;border:2px solid #16323f;border-radius:999px">View / download invoice (PDF)</a></p>

  ${taxInvoiceSection(order)}
  ${order.notes ? `<p style="margin-top:16px;font-size:13px;color:#4b5563"><strong>Delivery notes:</strong> ${escape(order.notes)}</p>` : ""}

  <p style="margin-top:24px;font-size:13px;color:#4b5563">Questions about your order? Reply to this email, call <a href="tel:${siteConfig.contact.phoneHref}" style="color:#1f7a9e">${siteConfig.contact.phone}</a> or write to ${siteConfig.contact.email}.</p>
</td></tr></table>
</td></tr></table></body></html>`;

  const text = [
    `Thank you, ${order.customer_name}! Your ${siteConfig.name} order is confirmed.`,
    "",
    `Tax invoice ${order.invoice_number ?? ""} · Order #${order.order_number} · ${orderDate(order.created_at)}`,
    `Payment: ${paymentText(order)}`,
    "",
    ...order.order_items.map(
      (item) => `${item.product_name} (${item.pack_label}) × ${item.quantity} — ${formatInr(item.unit_price * item.quantity)}`
    ),
    "",
    `Total (incl. GST): ${formatInr(order.total)}`,
    "",
    `View or download your invoice: ${link}`,
    `Track your order: ${siteConfig.url}/account`,
    "",
    `${siteConfig.legalName} (${siteConfig.name}) · GSTIN ${siteConfig.gstin} · FSSAI Lic. No. ${siteConfig.fssaiLicense}`,
  ].join("\n");

  return {
    subject: `Your ${siteConfig.name} order #${order.order_number} is confirmed · Tax invoice ${order.invoice_number ?? ""}`.trim(),
    html,
    text,
  };
}

export function orderAlertEmail(order: OrderForEmail) {
  const lines = order.order_items.map((item) => `${item.product_name} (${item.pack_label}) × ${item.quantity}`);
  const details = [
    `${order.milk_subscriber ? "⭐ MILK SUBSCRIBER · PRIORITY\n" : ""}Order #${order.order_number} · ${orderDate(order.created_at)}`,
    `Payment: ${paymentText(order)}`,
    ...(order.invoice_number ? [`Invoice: ${order.invoice_number} · ${invoiceUrl(order.id)}`] : []),
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
 * Emails the customer their GST tax invoice and the team a new-order alert, once per order.
 * The invoice_emailed_at column is claimed first, so a repeated call (verify + webhook) sends nothing.
 */
export async function sendOrderEmails(admin: SupabaseClient, orderId: string) {
  // Number the invoice first (idempotent: an order keeps the number it was given).
  const { error: numberError } = await admin.rpc("assign_invoice_number", { p_order_id: orderId });
  if (numberError) console.error("[invoice] could not assign an invoice number:", numberError.message);

  const { data: claimed } = await admin
    .from("orders")
    .update({ invoice_emailed_at: new Date().toISOString() })
    .eq("id", orderId)
    .is("invoice_emailed_at", null)
    .select(invoiceOrderColumns)
    .maybeSingle();
  if (!claimed) return null;
  const order = claimed as OrderForEmail;

  const [invoice, alert] = await Promise.all([
    order.email ? sendEmail({ to: order.email, ...invoiceEmail(order) }) : Promise.resolve(null),
    sendEmail({ to: orderAlertRecipients, replyTo: order.email ?? undefined, ...orderAlertEmail(order) }),
  ]);

  // Keep the reason on the order (shown in /admin), and let a later call retry if the
  // customer's invoice didn't go out.
  const problems = [
    invoice && !invoice.sent ? `Customer invoice: ${invoice.error}` : null,
    !alert.sent ? `Order alert: ${alert.error}` : null,
  ].filter(Boolean);
  const update: { email_error: string | null; invoice_emailed_at?: null } = { email_error: problems.join(" · ") || null };
  if (invoice && !invoice.sent) update.invoice_emailed_at = null;
  await admin.from("orders").update(update).eq("id", order.id);
  return update.email_error;
}
