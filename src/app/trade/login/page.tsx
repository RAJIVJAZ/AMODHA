import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/account/otp-login";
import { siteConfig } from "@/lib/site";
import { getMe } from "../_lib/data";

export const metadata: Metadata = { title: "Sign in" };

export default async function TradeLogin({ searchParams }: { searchParams: Promise<{ register?: string | string[] }> }) {
  const me = await getMe();
  if (me.state !== "signed_out" && me.state !== "error") redirect("/trade");
  const register = Boolean((await searchParams).register);
  const via = siteConfig.loginMethod === "phone" ? "mobile number" : "email address";

  return (
    <div className="mx-auto max-w-md py-4">
      <h1 className="font-heading text-2xl font-bold text-ink">{register ? "Register your shop" : "Sign in to Wholesale"}</h1>
      <p className="mt-1 text-sm text-dark/70">
        {register
          ? `Step 1 of 2: verify your ${via} with a one-time code. Next you will fill in your shop details for approval.`
          : `Enter your ${via} and we will send a one-time code. No password needed.`}
      </p>
      <div className="mt-5 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-ink/5">
        <OtpLogin next="/trade" method={siteConfig.loginMethod} />
      </div>
      <ul className="mt-5 space-y-1 text-sm text-dark/60">
        <li>• Use the {via} your salesperson registered for your shop, so we can link you to your account.</li>
        <li>• Wholesale is for sweet shops and trade buyers in and around Prayagraj.</li>
      </ul>
      <a href="/downloads/mw-wholesale.apk" download className="mt-5 flex min-h-11 items-center justify-center rounded-xl bg-white px-4 text-sm font-semibold text-ink ring-1 ring-ink/10">
        📲 Download the Android app (MW Wholesale)
      </a>
      <p className="mt-5 text-sm text-dark/60">
        <Link href="/trade" className="inline-flex min-h-11 items-center font-semibold text-primary-dark">
          ← Back
        </Link>
      </p>
    </div>
  );
}
