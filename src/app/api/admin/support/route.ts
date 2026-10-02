import { NextResponse } from "next/server";
import { getStaffClient } from "@/lib/admin-auth";

export async function POST(req: Request) {
  const staff = await getStaffClient();
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { id, reply } = await req.json();
  if (typeof id !== "string" || typeof reply !== "string" || !reply.trim()) {
    return NextResponse.json({ error: "Write a reply first" }, { status: 400 });
  }

  const { error } = await staff
    .from("support_requests")
    .update({ reply: reply.trim().slice(0, 2000), status: "resolved" })
    .eq("id", id);
  if (error) {
    console.error("Replying to support request failed:", error);
    return NextResponse.json({ error: "Could not save the reply" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
