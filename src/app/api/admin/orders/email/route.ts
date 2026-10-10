import { NextResponse } from "next/server";
import { getStaffClient } from "@/lib/admin-auth";
import { sendOrderEmails } from "@/lib/order-emails";

// Retries the invoice + order alert emails for an order whose invoice didn't go out.
export async function POST(req: Request) {
  const staff = await getStaffClient();
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { orderId } = await req.json();
  if (typeof orderId !== "string") return NextResponse.json({ error: "Invalid order" }, { status: 400 });

  const emailError = await sendOrderEmails(staff, orderId);
  if (emailError) return NextResponse.json({ error: emailError }, { status: 502 });
  return NextResponse.json({ ok: true });
}
