import { NextResponse } from "next/server";
import { getSignedInCustomer } from "@/lib/orders";
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
  return Number.isFinite(parsed) && parsed >= 0 && parsed < 1000 ? parsed : null;
}

// Saves a Fresh Milk interest registration so the team can count progress towards 50 households.
export async function POST(req: Request) {
  const values = (await req.json()) as Record<string, unknown>;
  const name = text(values.name, 120);
  const phone = normalizePhone(typeof values.mobile === "string" ? values.mobile : "");
  const address = text(values.address, 500);
  const area = text(values.area, 120);
  if (!name || !phone || !address || !area) {
    return NextResponse.json({ error: "Name, mobile number, address and area are required" }, { status: 400 });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ saved: false });

  const customer = await getSignedInCustomer();
  const familyMembers = number(values.familyMembers);
  const { error } = await admin.from("milk_interest").insert({
    user_id: customer?.id ?? null,
    name,
    phone,
    address,
    area,
    daily_litres: number(values.dailyLitres),
    timing: text(values.timing, 20),
    family_members: familyMembers === null ? null : Math.round(familyMembers),
    wants_subscription: yesNo(values.subscription),
    wants_a2: yesNo(values.a2),
    preferred_quantity: text(values.quantity, 40),
    notes: text(values.notes, 1000),
  });
  if (error) {
    console.error("Saving milk interest failed:", error);
    return NextResponse.json({ saved: false }, { status: 500 });
  }
  return NextResponse.json({ saved: true });
}
