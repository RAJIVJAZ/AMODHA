import Link from "next/link";
import { redirect } from "next/navigation";
import { getSales } from "@/lib/b2b/sales";

export const metadata = { title: "Not set up" };

export default async function NotSetUp() {
  const s = await getSales();
  if (!s) redirect("/login?next=/sales");
  if (s.salesperson) redirect("/sales");
  return (
    <div className="mx-auto mt-10 max-w-md rounded-2xl bg-white p-6 text-center">
      <p className="text-4xl" aria-hidden="true">🧑‍💼</p>
      <h1 className="mt-2 font-heading text-2xl font-bold text-ink">Mithai Wallah Sales</h1>
      <p className="mt-2 text-sm text-dark/70">
        You are signed in as <strong>{s.user.email ?? s.user.phone}</strong>, but this account is not set up as an active salesperson. Ask your
        sales manager to add you under Sales team in the business app, using this email address.
      </p>
      <Link href="/ops/today" className="mt-4 inline-block font-semibold text-primary-dark">
        Go to the business app
      </Link>
    </div>
  );
}
