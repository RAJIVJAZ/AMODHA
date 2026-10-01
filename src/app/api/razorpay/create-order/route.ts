import { NextResponse } from "next/server";
import Razorpay from "razorpay";

export async function POST(req: Request) {
  const { amount, receipt } = await req.json();

  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0 || amount > 500000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID!,
    key_secret: process.env.RAZORPAY_KEY_SECRET!,
  });

  const order = await razorpay.orders.create({
    amount: Math.round(amount * 100), // INR to paise
    currency: "INR",
    receipt: typeof receipt === "string" ? receipt : undefined,
  });

  return NextResponse.json(order);
}
