import { createClient } from "@/lib/supabase/server";
import type { PackingSlip } from "../../../_lib";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function esc(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function n(value: unknown) {
  return new Intl.NumberFormat("en-IN", { maximumFractionDigits: 3 }).format(Number(value ?? 0));
}

function day(value: string | null | undefined) {
  if (!value) return "—";
  const d = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T00:00:00+05:30`) : new Date(value);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function text(status: number, body: string) {
  return new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });
}

function page(s: PackingSlip) {
  const o = s.order;
  const rows = s.lines
    .map((l) => {
      const lots = l.lots.length
        ? l.lots.map((x) => `${esc(x.lot_code)}${x.batch_no ? ` (batch ${esc(x.batch_no)})` : ""} · ${n(x.qty)}${x.expiry_date ? ` · exp ${esc(day(x.expiry_date))}` : ""}`).join("<br>")
        : `<span class="muted">not reserved</span>`;
      const short = Number(l.to_pick) + Number(l.dispatched) < Number(l.ordered);
      return `<tr>
  <td><strong>${esc(l.name)}</strong><br><span class="muted">${esc(l.pack)}</span></td>
  <td class="mono">${esc(l.sku ?? "—")}</td>
  <td>${esc(l.pack_size ?? l.pack ?? "—")}</td>
  <td class="num">${n(l.ordered)}</td>
  <td class="num${short ? " warn" : ""}">${n(l.to_pick)}</td>
  <td class="num">${l.last_packed !== null && l.last_packed !== undefined ? n(l.last_packed) : "&nbsp;"}</td>
  <td class="lots">${lots}</td>
  <td class="check"><span class="box"></span></td>
</tr>`;
    })
    .join("\n");
  const totalOrdered = s.lines.reduce((t, l) => t + Number(l.ordered), 0);
  const totalPick = s.lines.reduce((t, l) => t + Number(l.to_pick), 0);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>Packing slip ${esc(o.order_no)}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #1c1917; background: #fff; margin: 0; padding: 16px; font-size: 14px; }
  .wrap { max-width: 960px; margin: 0 auto; }
  header { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 12px; border-bottom: 2px solid #1c1917; padding-bottom: 8px; margin-bottom: 12px; }
  h1 { font-size: 22px; margin: 0; }
  .muted { color: #57534e; font-size: 12px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px 16px; margin-bottom: 12px; }
  .grid div { border: 1px solid #d6d3d1; border-radius: 6px; padding: 8px; }
  .label { display: block; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; color: #57534e; font-weight: 600; }
  .tablewrap { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; min-width: 640px; }
  th, td { border: 1px solid #a8a29e; padding: 6px; vertical-align: top; text-align: left; }
  th { background: #f5f5f4; font-size: 11px; text-transform: uppercase; }
  .num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
  .mono { font-family: ui-monospace, monospace; font-size: 12px; }
  .lots { font-size: 12px; }
  .warn { color: #b91c1c; font-weight: 700; }
  .check { text-align: center; width: 56px; }
  .box { display: inline-block; width: 18px; height: 18px; border: 2px solid #1c1917; border-radius: 3px; }
  .checklist { margin: 12px 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 6px; }
  .checklist li { display: flex; gap: 8px; align-items: center; }
  .notes { border: 1px solid #a8a29e; border-radius: 6px; padding: 8px; min-height: 48px; margin-bottom: 12px; white-space: pre-line; }
  .sign { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 24px; margin-top: 28px; }
  .sign div { border-top: 1px solid #1c1917; padding-top: 4px; font-size: 12px; }
  .actions { margin-bottom: 12px; }
  .actions button { font: inherit; padding: 8px 14px; border-radius: 6px; border: 2px solid #1c1917; background: #1c1917; color: #fff; font-weight: 600; cursor: pointer; }
  @media print {
    body { padding: 0; font-size: 12px; }
    .actions { display: none; }
    table { min-width: 0; }
    tr { page-break-inside: avoid; }
    @page { margin: 12mm; }
  }
</style>
</head>
<body>
<div class="wrap">
  <div class="actions"><button type="button" onclick="window.print()">Print</button></div>
  <header>
    <div>
      <h1>Packing slip · ${esc(o.order_no)}</h1>
      <div class="muted">Mithai Wallah · Anuradha Enterprises, Prayagraj</div>
    </div>
    <div class="muted">Placed ${esc(day(o.created_at))}<br>Priority: <strong>${esc(o.priority)}</strong><br>Stage: ${esc(o.stage.replace(/_/g, " "))}</div>
  </header>
  <section class="grid">
    <div><span class="label">Customer / shop</span>${esc(o.customer_name)}${o.customer_code ? ` <span class="muted">(${esc(o.customer_code)})</span>` : ""}${o.owner_name ? `<br><span class="muted">${esc(o.owner_name)}</span>` : ""}</div>
    <div><span class="label">Contact</span>${esc(o.phone)}</div>
    <div><span class="label">Delivery address</span>${esc(o.address)}, ${esc(o.city)} ${esc(o.pincode)}</div>
    <div><span class="label">Delivery date</span>${esc(day(o.delivery_date))}</div>
  </section>
  <div class="tablewrap">
  <table>
    <thead><tr><th>Product</th><th>SKU</th><th>Pack size</th><th class="num">Ordered</th><th class="num">To pick</th><th class="num">Packed</th><th>Batch / lot</th><th>Checked</th></tr></thead>
    <tbody>
${rows || `<tr><td colspan="8" class="muted">No lines.</td></tr>`}
    </tbody>
    <tfoot><tr><th colspan="3">Total</th><th class="num">${n(totalOrdered)}</th><th class="num">${n(totalPick)}</th><th></th><th colspan="2"></th></tr></tfoot>
  </table>
  </div>
  <ul class="checklist">
    <li><span class="box"></span> Count of packs matches the slip</li>
    <li><span class="box"></span> Labels, batch codes and expiry dates checked</li>
    <li><span class="box"></span> Seals and packaging intact</li>
    <li><span class="box"></span> Delivery copy placed with the goods</li>
  </ul>
  <span class="label">Packing instructions / notes</span>
  <div class="notes">${esc(o.notes ?? "")}</div>
  <span class="label">Exceptions (short / substituted items)</span>
  <div class="notes"></div>
  <section class="sign">
    <div>Picked by (name &amp; signature)</div>
    <div>Packed &amp; checked by</div>
    <div>Received by customer (name, signature, date)</div>
  </section>
</div>
</body>
</html>`;
}

// Printable packing slip for one order. The database function checks the dispatch permission.
export async function GET(_request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) return text(404, "Order not found.");
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return text(401, "Please sign in.");
  const { data, error } = await supabase.rpc("ops_packing_slip", { p_order_id: orderId });
  if (error) {
    if (error.code === "42501" || /permission/i.test(error.message)) return text(403, "You do not have permission to see packing slips.");
    return text(404, "Order not found.");
  }
  if (!data) return text(404, "Order not found.");
  return new Response(page(data as PackingSlip), {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store", "X-Robots-Tag": "noindex" },
  });
}
