import { NextResponse } from "next/server";
import Razorpay from "razorpay";
import { getPack } from "@/data/sweets";
import { deliveryFeeFor } from "@/lib/order-rules";

type OrderLine = { slug: string; packLabel: string; quantity: number };

function isOrderLine(value: unknown): value is OrderLine {
  const line = value as OrderLine;
  return (
    typeof line?.slug === "string" &&
    typeof line?.packLabel === "string" &&
    Number.isInteger(line?.quantity) &&
    line.quantity > 0
  );
}

export async function POST(req: Request) {
  const { items, receipt } = await req.json();

  if (!Array.isArray(items) || items.length === 0 || !items.every(isOrderLine)) {
    return NextResponse.json({ error: "Your cart is empty or invalid" }, { status: 400 });
  }

  let subtotal = 0;
  for (const line of items) {
    const pack = getPack(line.slug, line.packLabel);
    if (!pack) {
      return NextResponse.json({ error: `${line.slug} (${line.packLabel}) is not available online` }, { status: 400 });
    }
    subtotal += pack.price * line.quantity;
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay create-order: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars are not set");
    return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  const total = subtotal + deliveryFeeFor(subtotal);

  try {
    const order = await razorpay.orders.create({
      amount: total * 100, // INR to paise
      currency: "INR",
      receipt: typeof receipt === "string" ? receipt.slice(0, 40) : undefined,
    });
    // The Key ID is publishable; returning it at runtime avoids depending on a build-time NEXT_PUBLIC_ var.
    return NextResponse.json({ id: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID });
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
