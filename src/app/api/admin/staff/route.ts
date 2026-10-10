import { NextResponse } from "next/server";
import { getStaffClient } from "@/lib/admin-auth";
import { createClient } from "@/lib/supabase/server";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Adds or removes a staff email. Access follows the email, so it also applies to an
// account created later with that address.
export async function POST(req: Request) {
  const staff = await getStaffClient();
  if (!staff) return NextResponse.json({ error: "Not allowed" }, { status: 403 });

  const { email: rawEmail, action } = await req.json();
  const email = typeof rawEmail === "string" ? rawEmail.trim().toLowerCase() : "";
  if (!EMAIL_PATTERN.test(email) || (action !== "add" && action !== "remove")) {
    return NextResponse.json({ error: "Enter a valid email address" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const me = user?.email?.toLowerCase() ?? null;

  if (action === "add") {
    const { error } = await staff.from("staff_emails").upsert({ email, added_by: me });
    if (error) {
      console.error("Adding staff failed:", error);
      return NextResponse.json({ error: "Could not add that email" }, { status: 500 });
    }
    await staff.from("profiles").update({ is_admin: true }).eq("email", email);
    return NextResponse.json({ ok: true });
  }

  if (email === me) {
    return NextResponse.json({ error: "You can't remove your own access" }, { status: 400 });
  }
  const { count } = await staff.from("staff_emails").select("email", { count: "exact", head: true });
  if ((count ?? 0) <= 1) {
    return NextResponse.json({ error: "Keep at least one admin" }, { status: 400 });
  }

  const { error } = await staff.from("staff_emails").delete().eq("email", email);
  if (error) {
    console.error("Removing staff failed:", error);
    return NextResponse.json({ error: "Could not remove that email" }, { status: 500 });
  }
  await staff.from("profiles").update({ is_admin: false }).eq("email", email);
  return NextResponse.json({ ok: true });
}
