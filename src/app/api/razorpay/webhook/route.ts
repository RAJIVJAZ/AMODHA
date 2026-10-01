import crypto from "crypto";
import { NextResponse } from "next/server";

// Razorpay Dashboard -> Settings -> Webhooks: point this route's URL here and
// set the same secret as RAZORPAY_WEBHOOK_SECRET. This is a separate secret
// from RAZORPAY_KEY_SECRET.
export async function POST(req: Request) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-razorpay-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing signature" }, { status: 400 });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET!)
    .update(rawBody)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(signature);
  const isValid =
    expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!isValid) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  const event = JSON.parse(rawBody);

  if (event.event === "payment.captured") {
    // This is the source of truth that a payment succeeded. There's no
    // order database in this project yet — once one exists, mark the
    // matching order as paid here using event.payload.payment.entity.order_id.
  }

  return NextResponse.json({ received: true });
}
