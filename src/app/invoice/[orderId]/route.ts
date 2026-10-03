import { getStaffClient } from "@/lib/admin-auth";
import { isValidInvoiceToken } from "@/lib/invoice-link";
import { invoiceOrderColumns } from "@/lib/order-emails";
import { customerFilter, getSignedInCustomer } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { invoicePageHtml, type InvoiceOrder } from "@/lib/tax-invoice";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function notFound() {
  return new Response("Invoice not found.", { status: 404, headers: { "X-Robots-Tag": "noindex" } });
}

// A printable GST tax invoice. Open to the emailed link (signed token), the signed-in
// customer who placed the order, and staff.
export async function GET(request: Request, { params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = await params;
  if (!UUID.test(orderId)) return notFound();

  const admin = createAdminClient();
  if (!admin) return notFound();

  const token = new URL(request.url).searchParams.get("t");
  let query = admin.from("orders").select(`status, ${invoiceOrderColumns}`).eq("id", orderId);
  if (!isValidInvoiceToken(orderId, token) && !(await getStaffClient())) {
    const customer = await getSignedInCustomer();
    if (!customer) return notFound();
    query = query.or(customerFilter(customer));
  }

  const { data } = await query.maybeSingle();
  if (!data || data.status === "pending_payment") return notFound();
  let order = data as unknown as InvoiceOrder & { status: string };

  // Orders confirmed before invoicing (or whose email hasn't gone out yet) get their number now.
  if (!order.invoice_number && order.status !== "cancelled") {
    await admin.rpc("assign_invoice_number", { p_order_id: orderId });
    const { data: numbered } = await admin.from("orders").select("invoice_number, invoice_date").eq("id", orderId).maybeSingle();
    if (numbered) order = { ...order, ...numbered };
  }
  if (!order.invoice_number) return notFound();

  return new Response(invoicePageHtml(order), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "private, no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}
