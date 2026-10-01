import crypto from "crypto";
import { NextResponse } from "next/server";

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
  const signatureBuf = Buffer.from(signature);
  const verified =
    expectedBuf.length === signatureBuf.length && crypto.timingSafeEqual(expectedBuf, signatureBuf);

  return NextResponse.json({ verified });
}
