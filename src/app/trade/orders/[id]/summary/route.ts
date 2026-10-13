import { paymentMethods } from "@/lib/b2b/labels";
import type { OrderDetail } from "@/lib/b2b/types";
import { date, dateTime, inr, qty } from "@/lib/ops/format";
import { siteConfig } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Order not found.", { status: 404, headers: { "Content-Type": "text/plain; charset=utf-8", "X-Robots-Tag": "noindex" } });
}

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// A printable order confirmation for the shop (not a tax invoice). Uses the signed-in person's own
// access, so a shop only ever gets its own orders.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) return notFound();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("b2b_order_detail", { p_order_id: id });
  if (error || !data) return notFound();
  const { order, customer, lines } = data as OrderDetail;

  const gst = lines.reduce((sum, l) => {
    const rate = Number(l.gst_rate ?? 0);
    return sum + (rate > 0 ? (Number(l.line_total) * rate) / (100 + rate) : 0);
  }, 0);
  const office = siteConfig.address.office;
  const rows = lines
    .map(
      (l, i) => `<tr><td>${i + 1}</td><td><strong>${esc(l.name)}</strong><br><small>${esc([l.code, l.pack].filter(Boolean).join(" · "))}</small></td>
<td class="r">${esc(qty(l.qty))}</td><td class="r">${esc(inr(l.unit_price))}</td><td class="r">${esc(l.gst_rate ?? 0)}%</td><td class="r">${esc(inr(l.line_total))}</td></tr>`
    )
    .join("\n");

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Order ${esc(order.order_no)} · Mithai Wallah Wholesale</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f6f4f1;color:#17202a;font:14px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif}
.page{max-width:820px;margin:16px auto;background:#fff;padding:28px;border-radius:12px}
header{display:flex;justify-content:space-between;gap:16px;border-bottom:3px solid #16323f;padding-bottom:14px;flex-wrap:wrap}
h1{margin:0;font-size:22px;color:#16323f}h2{margin:0 0 4px;font-size:15px;color:#16323f}
.muted{color:#5b6670;font-size:12px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:18px 0}
table{width:100%;border-collapse:collapse;margin-top:8px}th,td{padding:8px 6px;border-bottom:1px solid #e5e7eb;text-align:left;vertical-align:top}
th{font-size:12px;color:#5b6670;background:#f8fafc}.r{text-align:right}tfoot td{border:0}.total td{font-size:17px;font-weight:700;color:#16323f;border-top:2px solid #16323f}
.badge{display:inline-block;padding:2px 10px;border-radius:999px;background:#e0f2fe;color:#075985;font-weight:700;font-size:12px}
.actions{max-width:820px;margin:16px auto 0;display:flex;gap:8px;padding:0 16px}
button,a.btn{background:#16323f;color:#fff;border:0;border-radius:10px;padding:12px 18px;font-size:15px;font-weight:600;cursor:pointer;text-decoration:none}
a.btn{background:#fff;color:#16323f;border:2px solid #16323f}
@media (max-width:600px){.page{padding:16px;margin:8px;border-radius:8px}.grid{grid-template-columns:1fr}}
@media print{body{background:#fff}.actions{display:none}.page{margin:0;padding:0;max-width:none}}
</style></head>
<body>
<div class="actions"><button type="button" onclick="window.print()">Print / Save as PDF</button><a class="btn" href="/trade/orders/${esc(order.id)}">Back to order</a></div>
<div class="page">
<header>
<div><h1>${esc(siteConfig.legalName)}</h1><div><strong>${esc(siteConfig.name)} Wholesale</strong></div>
<div class="muted">${esc(`${office.line1}, ${office.line2}, ${office.city}, ${office.state} ${office.postalCode}`)}<br>GSTIN ${esc(siteConfig.gstin)} · FSSAI ${esc(siteConfig.fssaiLicense)}<br>${esc(siteConfig.contact.phone)} · ${esc(siteConfig.contact.email)}</div></div>
<div style="text-align:right"><h2>ORDER CONFIRMATION</h2><div><strong>${esc(order.order_no)}</strong></div>
<div class="muted">Placed ${esc(dateTime(order.created_at))}</div><div style="margin-top:6px"><span class="badge">${esc(order.status)}</span></div></div>
</header>
<div class="grid">
<div><h2>Customer</h2><div><strong>${esc(customer.shop_name)}</strong></div><div>${esc(customer.owner_name)} · ${esc(customer.mobile)}</div>
<div class="muted">Customer code ${esc(customer.customer_code)}${customer.gstin ? ` · GSTIN ${esc(customer.gstin)}` : ""}</div>
<div class="muted" style="margin-top:6px">Deliver to: ${esc(order.delivery_address)}${order.city ? `, ${esc(order.city)}` : ""}${order.pincode ? ` ${esc(order.pincode)}` : ""}</div></div>
<div><h2>Order details</h2>
<div>Payment: ${esc(paymentMethods[order.payment_method] ?? order.payment_method)}</div>
<div>Requested delivery: ${esc(order.requested_delivery_date ? date(order.requested_delivery_date) : "Earliest available")}</div>
<div>Confirmed delivery: ${esc(order.delivery_date ? date(order.delivery_date) : "To be confirmed")}</div>
${order.invoice_number ? `<div>Tax invoice: ${esc(order.invoice_number)}${order.invoice_date ? ` (${esc(date(order.invoice_date))})` : ""}</div>` : ""}
<div>Placed by: ${esc(order.source === "sales_rep" ? `Salesperson${order.entered_by ? ` — ${order.entered_by}` : ""}` : order.entered_by ?? "")}</div></div>
</div>
<table>
<thead><tr><th>#</th><th>Item</th><th class="r">Qty</th><th class="r">Rate</th><th class="r">GST</th><th class="r">Amount</th></tr></thead>
<tbody>${rows}</tbody>
<tfoot>
<tr><td colspan="5" class="r">Subtotal</td><td class="r">${esc(inr(order.subtotal))}</td></tr>
<tr><td colspan="5" class="r">Delivery</td><td class="r">${esc(Number(order.delivery_fee) > 0 ? inr(order.delivery_fee) : "Free")}</td></tr>
<tr class="total"><td colspan="5" class="r">Total (GST included)</td><td class="r">${esc(inr(order.total))}</td></tr>
<tr><td colspan="6" class="r muted">GST included in the above: ${esc(inr(gst))}</td></tr>
</tfoot></table>
${order.notes ? `<p><strong>Notes:</strong> ${esc(order.notes)}</p>` : ""}
${order.cancel_reason && order.stage === "cancelled" ? `<p><strong>Cancelled:</strong> ${esc(order.cancel_reason)}</p>` : ""}
<p class="muted" style="margin-top:20px">This is an order confirmation, not a tax invoice. The GST tax invoice is issued when the goods are dispatched. Prices and quantities are as recorded on ${esc(dateTime(new Date().toISOString()))}.</p>
</div>
</body></html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
