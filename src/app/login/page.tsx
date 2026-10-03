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
