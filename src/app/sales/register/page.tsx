import Link from "next/link";
import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/account/otp-login";
import { SalesRegisterForm } from "@/components/b2b/sales-register-form";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";

export const metadata = { title: "Join the sales team" };

type Application = { status: "none" | "pending" | "approved" | "rejected" | "withdrawn" | "salesperson"; created_at?: string; decision_note?: string | null };

// Salesperson registration: sign in with your own email (one-time code), then apply. A sales manager
// approves; only then does the Sales app open. One person, one account.
export default async function SalesRegister() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const shell = (children: React.ReactNode) => (
    <div className="mx-auto mt-6 max-w-md">
      <div className="rounded-3xl bg-ink px-6 py-8 text-center text-white">
        <p className="text-4xl" aria-hidden="true">🤝</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          Join Mithai Wallah <span className="text-primary-light">Sales</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">Register as a field salesperson</p>
      </div>
      <div className="-mt-4 rounded-3xl bg-white p-6 shadow-sm">{children}</div>
      <p className="mt-4 text-center text-sm">
        Already approved?{" "}
        <Link href="/sales/login" className="font-semibold text-primary-dark">
          Sign in
        </Link>
      </p>
    </div>
  );

  if (!user) {
    return shell(
      <>
        <p className="mb-4 text-sm text-dark/70">
          Step 1 of 2: verify your {siteConfig.loginMethod === "email" ? "email address" : "mobile number"} with a one-time code. Use your own — it becomes your personal
          Sales app login and cannot be shared.
        </p>
        <OtpLogin next="/sales/register" method={siteConfig.loginMethod} />
      </>
    );
  }

  const { data } = await supabase.rpc("fs_my_application");
  const app = (data ?? { status: "none" }) as Application;
  if (app.status === "salesperson") redirect("/sales");

  if (app.status === "pending") {
    return shell(
      <div className="text-center">
        <p className="text-4xl" aria-hidden="true">⏳</p>
        <h2 className="mt-2 font-heading text-xl font-bold text-ink">Application received</h2>
        <p className="mt-2 text-sm text-dark/70">
          Your sales manager will review it. Once approved, sign in at <strong>/sales/login</strong> with the same {siteConfig.loginMethod === "email" ? "email" : "number"} and the Sales
          app opens.
        </p>
      </div>
    );
  }

  return shell(
    <>
      {app.status === "rejected" ? (
        <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-900">
          Your earlier application was not approved{app.decision_note ? `: ${app.decision_note}` : ""}. You can apply again.
        </p>
      ) : null}
      <p className="mb-3 text-sm font-semibold text-ink">Step 2 of 2: your details</p>
      <SalesRegisterForm email={user.email ?? user.phone ?? ""} defaultName={(user.user_metadata?.full_name as string | undefined) ?? ""} />
    </>
  );
}
