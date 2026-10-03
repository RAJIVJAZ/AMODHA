import { NextResponse } from "next/server";
import { customerFilter, getSignedInCustomer } from "@/lib/orders";
import { normalizePhone } from "@/lib/phone";
import { createAdminClient } from "@/lib/supabase/admin";

function text(value: unknown, max: number) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function yesNo(value: unknown) {
  return value === "Yes" ? true : value === "No" ? false : null;
}

function number(value: unknown) {
  const parsed = typeof value === "string" ? Number(value) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 10000 ? parsed : null;
}

// Saves a Farm Fresh Milk interest registration. A signed-in customer keeps one registration:
// sending the form again updates it instead of adding another.
export async function POST(req: Request) {
  const values = (await req.json()) as Record<string, unknown>;
  const name = text(values.name, 120);
  const phone = normalizePhone(typeof values.mobile === "string" ? values.mobile : "");
  const address = text(values.address, 500);
  const area = text(values.area, 120);
  if (!name || !phone || !address || !area) {
    return NextResponse.json({ error: "Name, mobile number, address and locality are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ saved: false });

  const customer = await getSignedInCustomer();
  const familyMembers = number(values.familyMembers);
  const details = {
    name,
    phone,
    address,
    area,
    email: customer?.email ?? null,
    daily_litres: number(values.dailyLitres),
    monthly_litres: number(values.monthlyLitres),
    timing: text(values.timing, 20),
    preferred_time: text(values.preferredTime, 40),
    family_members: familyMembers === null ? null : Math.round(familyMembers),
    wants_subscription: yesNo(values.subscription),
    notes: text(values.notes, 1000),
  };

  if (customer) {
    const { data: existing } = await admin
      .from("milk_interest")
      .select("id, status")
      .eq("user_id", customer.id)
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      const { error } = await admin.from("milk_interest").update(details).eq("id", existing.id);
      if (error) {
        console.error("Updating milk interest failed:", error);
        return NextResponse.json({ saved: false }, { status: 500 });
      }
      return NextResponse.json({ saved: true, updated: true });
    }
  }

  const { error } = await admin.from("milk_interest").insert({ ...details, user_id: customer?.id ?? null });
  if (error) {
    console.error("Saving milk interest failed:", error);
    return NextResponse.json({ saved: false }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}

// Withdraws the signed-in customer's interest. Active subscriptions are changed by the team instead.
export async function DELETE() {
  const customer = await getSignedInCustomer();
  const admin = createAdminClient();
  if (!customer || !admin) return NextResponse.json({ error: "Please sign in first" }, { status: 401 });

  const { error } = await admin
    .from("milk_interest")
    .update({ status: "cancelled" })
    .or(customerFilter(customer))
    .eq("status", "interested");
  if (error) {
    console.error("Withdrawing milk interest failed:", error);
    return NextResponse.json({ error: "Could not withdraw right now" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
