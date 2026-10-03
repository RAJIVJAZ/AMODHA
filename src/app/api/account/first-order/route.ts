import { NextResponse } from "next/server";
import { getSignedInCustomer, isActiveMilkSubscriber, isFirstOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";

// Tells the cart and checkout which offers to preview: the first-order discount and milk
// subscriber free delivery. Both are always recalculated on the server when the order is created.
export async function GET() {
  const customer = await getSignedInCustomer();
  const admin = createAdminClient();
  if (!customer || !admin) {
    return NextResponse.json({ signedIn: Boolean(customer), eligible: false, milkSubscriber: false });
  }
  const [eligible, milkSubscriber] = await Promise.all([isFirstOrder(admin, customer), isActiveMilkSubscriber(admin, customer)]);
  return NextResponse.json({ signedIn: true, eligible, milkSubscriber });
}
