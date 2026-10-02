import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { parseCustomer, priceLines, quoteOrder, saveOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { items, customer: customerInput, receipt } = await req.json();

  const priced = priceLines(items);
  if ("error" in priced) return NextResponse.json({ error: priced.error }, { status: 400 });

  const customer = parseCustomer(customerInput);
  if ("error" in customer) return NextResponse.json({ error: customer.error }, { status: 400 });

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay create-order: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars are not set");
    return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
  }

  const admin = createAdminClient();
  const quote = await quoteOrder(admin, priced.subtotal, customer.phone);

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const order = await razorpay.orders.create({
      amount: quote.total * 100, // INR to paise
      currency: "INR",
      receipt: typeof receipt === "string" ? receipt.slice(0, 40) : undefined,
    });

    const orderNumber = admin
      ? await saveOrder(admin, {
          customer,
          userId: quote.customer?.id ?? null,
          lines: priced.lines,
          subtotal: priced.subtotal,
          deliveryFee: quote.deliveryFee,
          discount: quote.discount,
          total: quote.total,
        milkSubscriber: quote.milkSubscriber,
          paymentMethod: "online",
          razorpayOrderId: order.id,
        })
      : null;

    // The Key ID is publishable; returning it at runtime avoids depending on a build-time NEXT_PUBLIC_ var.
    return NextResponse.json({
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      discount: quote.discount,
      total: quote.total,
      orderNumber,
    });
  } catch (err) {
    console.error("Razorpay create-order failed:", err);
    const razorpayError = err as { statusCode?: number; error?: { description?: string } };
    const description = razorpayError.error?.description;
    return NextResponse.json(
      { error: description ? `Razorpay: ${description}` : "Could not create Razorpay order" },
      { status: razorpayError.statusCode === 401 ? 401 : 500 }
    );
  }
}
