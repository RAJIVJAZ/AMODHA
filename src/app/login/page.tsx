import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/account/otp-login";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Sign In",
  description: `Sign in to your ${siteConfig.name} account with your mobile number.`,
  robots: { index: false, follow: false },
};

function safeNext(value: string | string[] | undefined) {
  const next = Array.isArray(value) ? value[0] : value;
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const next = safeNext((await searchParams).next);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect(next);

  return (
    <section className="bg-blush py-16 sm:py-24">
      <div className="container-site flex justify-center">
        <div className="sticker-shadow w-full max-w-md rounded-3xl border-[2.5px] border-ink bg-white p-6 sm:p-8">
          <h1 className="text-3xl font-bold text-ink">Sign in with OTP</h1>
          <p className="mt-2 text-sm text-dark/70">
            Track orders, save addresses and keep a wishlist. We&rsquo;ll text a one-time code to your mobile.
          </p>
          <div className="mt-6">
            <OtpLogin next={next} />
          </div>
        </div>
      </div>
    </section>
  );
}
