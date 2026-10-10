import { NextResponse } from "next/server";
import { getStaffClient } from "@/lib/admin-auth";
import type { OrderStatus } from "@/lib/order-status";

const allowed: OrderStatus[] = ["received", "preparing", "out_for_delivery", "delivered", "cancelled"];

export async function POST(req: Request) {
  const staff = await getStaffClient();
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { orderId, status } = await req.json();
  if (typeof orderId !== "string" || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const { error } = await staff.from("orders").update({ status }).eq("id", orderId);
  if (error) {
    console.error("Updating order status failed:", error);
    return NextResponse.json({ error: "Could not update the order" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
