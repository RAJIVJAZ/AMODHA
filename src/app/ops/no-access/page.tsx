import Link from "next/link";
import { getOps } from "@/lib/ops/context";

export const metadata = { title: "No access" };

export default async function NoAccessPage() {
  const ops = await getOps();
  return (
    <div className="mx-auto mt-16 max-w-md rounded-2xl border border-ink/10 bg-white p-6 text-center shadow-sm">
      <h1 className="font-heading text-2xl font-bold text-ink">No business-app access yet</h1>
      <p className="mt-2 text-sm text-dark/70">
        {ops
          ? `You're signed in as ${ops.profile?.email ?? "this account"}, which doesn't have a staff role. Ask the administrator to add you under Users & roles.`
          : "Sign in with the email address your administrator added as staff."}
      </p>
      <div className="mt-5 flex justify-center gap-3">
        {ops ? null : (
          <Link href="/login?next=/ops" className="rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-white">
            Sign in
          </Link>
        )}
        <Link href="/" className="rounded-lg border-2 border-ink/20 px-4 py-2 text-sm font-semibold text-ink">
          Back to the website
        </Link>
      </div>
    </div>
  );
}
