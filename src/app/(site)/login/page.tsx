import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/account/otp-login";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign In",
  description: `Sign in to your ${siteConfig.name} account with a one-time code.`,
  robots: { index: false, follow: false },
};

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const next = safeNext(params.next);
  const linkExpired = params.link === "expired";
  const ended = Array.isArray(params.ended) ? params.ended[0] : params.ended;
  const saveFailed = params.save === "failed";
  const endedText: Record<string, string> = {
    idle_timeout: "Your session has expired because no activity was detected for 5 minutes. Your saved work is secure. Please log in again to continue.",
    expired: "Your session ended because no activity was detected. Please log in again to continue.",
    revoked: "Your session was ended by an administrator. Please log in again, or contact your manager.",
    deactivated: "This staff account has been switched off. Please contact your manager.",
    absolute_timeout: "Your session reached its maximum length. Please log in again to continue.",
    security: "Your session was ended for security reasons. Please log in again.",
    invalid: "Your session is no longer valid. Please log in again.",
  };
  const isEmail = siteConfig.loginMethod === "email";

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <section className="bg-blush py-16 sm:py-24">
      <div className="container-site flex justify-center">
        <div className="sticker-shadow w-full max-w-md rounded-3xl border-[2.5px] border-ink bg-white p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-ink">Sign in or sign up</h1>
          <p className="mt-2 text-sm text-dark/70">
            Track orders, save addresses and keep a wishlist. We&rsquo;ll {isEmail ? "email" : "text"} you a one-time
            code{isEmail ? "" : " on your mobile"}.
          </p>
          {ended ? (
            <p role="alert" className="mt-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
              {endedText[ended] ?? endedText.expired}
              {saveFailed ? " Some unfinished work could not be saved to the server; it is kept on that device and will be offered again when you sign in there." : ""}
            </p>
          ) : null}
          {linkExpired ? (
            <p role="alert" className="mt-4 rounded-xl bg-blush px-3 py-2 text-sm text-accent-dark">
              That sign-in link didn&rsquo;t work here. Links only open in the same browser you requested them
              from, and only once. Enter the 6-digit code from the email instead, or request a new one below.
            </p>
          ) : null}
          <div className="mt-6">
            <OtpLogin next={next} method={siteConfig.loginMethod} />
          </div>
        </div>
      </div>
    </section>
  );
}
