import crypto from "crypto";
import { NextResponse } from "next/server";
import { markOrderPaid } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

export async function POST(req: Request) {
  const { orderId, paymentId, signature } = await req.json();

  if (!orderId || !paymentId || !signature) {
    return NextResponse.json({ error: "Missing fields" }, { status: 400 });
  }

  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(`${orderId}|${paymentId}`)
    .digest("hex");

  const expectedBuf = Buffer.from(expected);
  const signatureBuf = Buffer.from(String(signature));
  const verified =
    expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

  if (!verified) return NextResponse.json({ verified: false });

  const admin = createAdminClient();
  const orderNumber = admin ? await markOrderPaid(admin, String(orderId), String(paymentId)) : null;
  return NextResponse.json({ verified: true, orderNumber });
}
