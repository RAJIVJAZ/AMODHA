import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REASONS = new Set(["manual", "idle_timeout", "expired", "revoked", "deactivated", "security", "absolute_timeout", "invalid", "not_started"]);

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/ops/today";
}

// Clears this browser's sign-in after a staff session has ended (sign-out, inactivity, revocation) and
// sends the person to the sign-in page with the reason. The server has already ended the session.
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const reason = REASONS.has(url.searchParams.get("reason") ?? "") ? (url.searchParams.get("reason") as string) : "expired";
  const save = url.searchParams.get("save");
  const supabase = await createClient();
  await supabase.auth.signOut({ scope: "local" }).catch(() => null);
  const next = safeNext(url.searchParams.get("next"));
  const sales = next === "/sales" || next.startsWith("/sales/");
  const dest = new URL(sales ? "/sales/login" : "/login", url.origin);
  if (!sales) dest.searchParams.set("next", next);
  if (reason !== "manual") dest.searchParams.set("ended", reason);
  if (save === "failed") dest.searchParams.set("save", "failed");
  const res = NextResponse.redirect(dest);
  // Make sure no sign-in cookie survives, even if the auth server could not be reached.
  for (const c of request.cookies.getAll()) if (c.name.startsWith("sb-")) res.cookies.delete(c.name);
  return res;
}
