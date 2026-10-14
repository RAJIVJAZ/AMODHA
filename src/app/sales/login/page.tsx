import { redirect } from "next/navigation";
import { OtpLogin } from "@/components/account/otp-login";
import { createClient } from "@/lib/supabase/server";
import { siteConfig } from "@/lib/site";

export const metadata = { title: "Salesperson sign in" };

const endedText: Record<string, string> = {
  idle_timeout: "Your session has expired because no activity was detected for 5 minutes. Your saved work is secure. Please log in again to continue.",
  expired: "Your session ended because no activity was detected. Please log in again to continue.",
  revoked: "Your session was ended by an administrator. Please log in again, or contact your sales manager.",
  deactivated: "This salesperson account has been switched off. Please contact your sales manager.",
  absolute_timeout: "Your session reached its maximum length. Please log in again to continue.",
  security: "Your session was ended for security reasons. Please log in again.",
};

// Sign-in for the field sales team. Each salesperson signs in with their own email (the one the sales
// manager registered under Sales team) and a one-time code — no shared accounts, no passwords.
export default async function SalesLogin({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const ended = Array.isArray(sp.ended) ? sp.ended[0] : sp.ended;
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect("/sales");

  return (
    <div className="mx-auto mt-6 max-w-md">
      <div className="rounded-3xl bg-ink px-6 py-8 text-center text-white">
        <p className="text-4xl" aria-hidden="true">🧑‍💼</p>
        <h1 className="mt-2 font-heading text-2xl font-bold">
          Mithai Wallah <span className="text-primary-light">Sales</span>
        </h1>
        <p className="mt-1 text-sm text-white/70">For the Mithai Wallah field sales team</p>
      </div>
      <div className="-mt-4 rounded-3xl bg-white p-6 shadow-sm">
        {ended ? (
          <p role="alert" className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {endedText[ended] ?? endedText.expired}
            {sp.save === "failed" ? " Some unfinished work could not be saved to the server; it is kept on this phone and will be offered again." : ""}
          </p>
        ) : null}
        <p className="mb-4 text-sm text-dark/70">
          Sign in with the {siteConfig.loginMethod === "email" ? "email address" : "mobile number"} your sales manager registered for you. We send a one-time code — there is
          no password. Please don&rsquo;t share your account: every order and visit is recorded under your name.
        </p>
        <OtpLogin next="/sales" method={siteConfig.loginMethod} />
        <p className="mt-5 text-sm">
          New to the sales team?{" "}
          <a href="/sales/register" className="font-semibold text-primary-dark">
            Register here
          </a>
        </p>
        <p className="mt-2 text-xs text-dark/55">
          You will be signed out after 5 minutes without activity; unfinished orders and visit notes are saved as drafts.
        </p>
      </div>
    </div>
  );
}
