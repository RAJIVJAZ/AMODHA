import { NextResponse } from "next/server";
import { getSignedInCustomer, isFirstOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Tells the checkout whether to preview the first-order discount. The discount
// itself is always recalculated on the server when the order is created.
export async function GET() {
  const customer = await getSignedInCustomer();
  const admin = createAdminClient();
  if (!customer || !admin) return NextResponse.json({ signedIn: Boolean(customer), eligible: false });
  return NextResponse.json({ signedIn: true, eligible: await isFirstOrder(admin, customer) });
}
