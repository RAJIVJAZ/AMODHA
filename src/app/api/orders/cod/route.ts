import { NextResponse, after } from "next/server";
import { sendOrderEmails } from "@/lib/order-emails";
import { orderSummary, parseCustomer, priceLines, quoteOrder, saveOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Places a Cash on Delivery / UPI on delivery order, then emails the invoice to the
// customer and a new-order alert to the team.
export async function POST(req: Request) {
  const { items, customer: customerInput } = await req.json();

  const priced = priceLines(items);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });

  const customer = parseCustomer(customerInput);
  if ("error" in customer) return NextResponse.json({ error: customer.error }, { status: 400 });

  const admin = createAdminClient();
  if (!admin) {
    console.error("COD order: SUPABASE_SECRET_KEY is not set, so the order can't be saved");
    return NextResponse.json({ error: "We couldn't place your order right now. Please try again shortly." }, { status: 503 });
  }

  const quote = await quoteOrder(admin, priced, customer.phone);
  const saved = await saveOrder(admin, {
    customer,
    userId: quote.customer?.id ?? null,
    lines: priced.lines,
    subtotal: priced.subtotal,
    deliveryFee: quote.deliveryFee,
    discount: quote.discount,
    discountReason: quote.discountReason,
    total: quote.total,
    milkSubscriber: quote.milkSubscriber,
    paymentMethod: "cod",
  });
  if (!saved) {
    return NextResponse.json({ error: "We couldn't place your order right now. Please try again shortly." }, { status: 500 });
  }

  after(() => sendOrderEmails(admin, saved.id));

  return NextResponse.json(orderSummary(saved.orderNumber, customer, priced, quote, "cod"));
}
