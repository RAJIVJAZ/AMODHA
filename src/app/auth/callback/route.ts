import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

function safeNext(value: string | null) {
  return value && value.startsWith("/") && !value.startsWith("//") ? value : "/account";
}

// Where the sign-in link in the email lands. Handles both the PKCE `code` link (default
// template) and a `token_hash` link, then sends the customer on to where they were going.
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const next = safeNext(searchParams.get("next"));
  const supabase = await createClient();

  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { error: new Error("Missing sign-in token") };

  if (error) {
    console.error("Sign-in link failed:", error);
    return NextResponse.redirect(new URL(`/login?next=${encodeURIComponent(next)}&link=expired`, origin));
  }
  return NextResponse.redirect(new URL(next, origin));
}
