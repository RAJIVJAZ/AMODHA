import crypto from "crypto";
import { NextResponse } from "next/server";
import { markOrderPaid } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

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

  // The source of truth that a payment succeeded, even if the customer closed the tab before /verify ran.
  if (event.event === "payment.captured" || event.event === "order.paid") {
    const payment = event.payload?.payment?.entity;
    const admin = createAdminClient();
    if (admin && payment?.order_id && payment?.id) {
      await markOrderPaid(admin, payment.order_id, payment.id);
    }
  }

  return NextResponse.json({ received: true });
}
