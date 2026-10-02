import { NextResponse } from "next/server";
import { parseCustomer, priceLines, quoteOrder, saveOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Records a Cash on Delivery / UPI on delivery order. The customer still sends the
// WhatsApp message afterwards; this just makes sure the order is never lost.
export async function POST(req: Request) {
  const { items, customer: customerInput } = await req.json();

  const priced = priceLines(items);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });

  const customer = parseCustomer(customerInput);
  if ("error" in customer) return NextResponse.json({ error: customer.error }, { status: 400 });

  const admin = createAdminClient();
  const quote = await quoteOrder(admin, priced.subtotal, customer.phone);

  const orderNumber = admin
    ? await saveOrder(admin, {
        customer,
        userId: quote.customer?.id ?? null,
        lines: priced.lines,
        subtotal: priced.subtotal,
        deliveryFee: quote.deliveryFee,
        discount: quote.discount,
        total: quote.total,
        paymentMethod: "cod",
      })
    : null;

  return NextResponse.json({ orderNumber, discount: quote.discount, total: quote.total });
}
