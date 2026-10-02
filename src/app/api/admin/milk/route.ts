import { NextResponse } from "next/server";
import { getStaffClient } from "@/lib/admin-auth";

const allowed = ["interested", "active", "paused", "cancelled"];

// Staff move a registration between interested, active (a live subscriber with benefits), paused and cancelled.
export async function POST(req: Request) {
  const staff = await getStaffClient();
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id, status } = await req.json();
  if (typeof id !== "string" || !allowed.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const update: Record<string, unknown> = { status };
  if (status === "active") update.activated_at = new Date().toISOString();

  const { error } = await staff.from("milk_interest").update(update).eq("id", id);
  if (error) {
    console.error("Updating milk status failed:", error);
    return NextResponse.json({ error: "Could not update" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
