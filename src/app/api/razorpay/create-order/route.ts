import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function POST(req: Request) {
  const { amount, receipt } = await req.json();

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 500000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
    console.error("Razorpay create-order: RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET env vars are not set");
    return NextResponse.json({ error: "Payment gateway is not configured" }, { status: 500 });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  });

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100), // INR to paise
      currency: "INR",
      receipt: typeof receipt === "string" ? receipt : undefined,
    });
    return NextResponse.json(order);
  } catch (err) {
    console.error("Razorpay create-order failed:", err);
    const razorpayError = err as { statusCode?: number; error?: { description?: string } };
    const description = razorpayError.error?.description;
    return NextResponse.json(
      { error: description ? `Razorpay: ${description}` : "Could not create Razorpay order" },
      { status: 500 }
    );
  }
}
