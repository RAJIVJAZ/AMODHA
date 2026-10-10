import { NextResponse } from "next/server";
import { getSignedInCustomer } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Tells the header whether to show the "My milk" shortcut: the signed-in customer has a milk subscription.
export async function GET() {
  const customer = await getSignedInCustomer();
  const admin = createAdminClient();
  if (!customer || !admin) return NextResponse.json({ subscriber: false }, { headers: { "Cache-Control": "private, no-store" } });
  const { count } = await admin.from("subscriptions").select("id", { count: "exact", head: true }).eq("user_id", customer.id).neq("status", "cancelled");
  return NextResponse.json({ subscriber: (count ?? 0) > 0 }, { headers: { "Cache-Control": "private, no-store" } });
}
