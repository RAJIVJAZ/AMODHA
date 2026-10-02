import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";
import { AddressBook, type Address } from "@/components/account/address-book";
import { OrderTracker } from "@/components/account/order-tracker";
import { ProfileName } from "@/components/account/profile-name";
import { SignOutButton } from "@/components/account/sign-out-button";
import { SupportRequests, type SupportRequest } from "@/components/account/support-requests";
import { WishlistList } from "@/components/account/wishlist-list";
import { membership as membershipOffer } from "@/data/membership";
import { milkSubscription } from "@/data/milk-subscription";
import { formatInr } from "@/lib/currency";
import { orderStatusLabels, type OrderStatus } from "@/lib/order-status";
import { customerFilter, getSignedInCustomer } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false, follow: false },
};

type OrderRow = {
  id: string;
  order_number: number;
  created_at: string;
  status: OrderStatus;
  payment_method: "online" | "cod";
  payment_status: string;
  total: number;
  discount: number;
  order_items: { product_name: string; pack_label: string; quantity: number }[];
};

const sections = [
  { id: "orders", label: "Orders" },
  { id: "addresses", label: "Addresses" },
  { id: "wishlist", label: "Wishlist" },
  { id: "rewards", label: "Reward points" },
  { id: "membership", label: "Membership" },
  { id: "milk", label: "Milk subscription" },
  { id: "support", label: "Support" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "Asia/Kolkata" });
}

function Card({ id, title, children, action }: { id?: string; title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <section id={id} className="sticker-shadow scroll-mt-28 rounded-2xl border-2 border-ink bg-white p-5 sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="font-heading text-lg font-bold text-ink">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default async function AccountPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/account");

  // Orders and milk registrations placed before signing in are matched by verified phone or email.
  const customer = await getSignedInCustomer();
  if (!customer) redirect("/login?next=/account");
  const byContact = createAdminClient() ?? supabase;

  const [profileRes, ordersRes, addressesRes, wishlistRes, supportRes, membershipRes, pointsRes, milkRes] = await Promise.all([
    supabase.from("profiles").select("full_name").eq("id", user.id).maybeSingle(),
    byContact
      .from("orders")
      .select("id, order_number, created_at, status, payment_method, payment_status, total, discount, order_items(product_name, pack_label, quantity)")
      .or(customerFilter(customer))
      .neq("status", "pending_payment")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("addresses").select("id, label, address, city, pincode").order("created_at"),
    supabase.from("wishlist").select("slug").order("created_at", { ascending: false }),
    supabase
      .from("support_requests")
      .select("id, subject, message, status, reply, order_number, created_at")
      .order("created_at", { ascending: false }),
    supabase
      .from("memberships")
      .select("status, expires_at")
      .eq("status", "active")
      .gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("reward_ledger").select("points"),
    byContact
      .from("milk_interest")
      .select("created_at, area, daily_litres, timing, wants_a2")
      .or(customerFilter(customer, { email: false }))
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status));
  const points = (pointsRes.data ?? []).reduce((sum, row) => sum + (row.points as number), 0);
  const activeMembership = membershipRes.data;
  const milk = milkRes.data;

  return (
    <section className="bg-blush py-10 sm:py-14">
      <div className="container-site flex flex-col gap-6">
        <div className="sticker-shadow flex flex-col gap-4 rounded-2xl border-2 border-ink bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div className="flex flex-col gap-1">
            <ProfileName userId={user.id} initialName={profileRes.data?.full_name ?? null} />
            <p className="text-sm text-dark/60">
              Signed in as {customer.email ?? (customer.phone ? `+91 ${customer.phone}` : "your account")}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold text-ink">
              {activeMembership ? `Member · renews ${formatDate(activeMembership.expires_at)}` : "Regular customer"}
            </span>
            <span className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold text-ink">Points: {points}</span>
            <SignOutButton />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[200px_1fr] lg:items-start">
          <nav aria-label="Account sections" className="sticker-shadow hidden rounded-2xl border-2 border-ink bg-white p-3 lg:sticky lg:top-28 lg:block">
            <ul className="flex flex-col gap-1">
              {sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="block rounded-lg px-3 py-2 text-sm font-semibold text-ink hover:bg-blush">
                    {section.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          <div className="flex flex-col gap-6">
            {activeOrder ? (
              <section className="sticker-shadow rounded-2xl border-[2.5px] border-accent bg-accent/10 p-5 sm:p-6">
                <div className="mb-5 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="font-heading text-lg font-bold text-ink">Track Order #{activeOrder.order_number}</h2>
                  <span className="text-sm text-dark/60">Placed {formatDate(activeOrder.created_at)}</span>
                </div>
                <OrderTracker status={activeOrder.status} />
              </section>
            ) : null}

            <Card id="orders" title="Order history">
              {orders.length === 0 ? (
                <p className="text-sm text-dark/60">
                  No orders yet.{" "}
                  <Link href="/#catalog" className="font-semibold text-primary-dark hover:underline">
                    Browse our sweets
                  </Link>
                </p>
              ) : (
                <ul className="flex flex-col divide-y-2 divide-ink/10">
                  {orders.map((order) => (
                    <li key={order.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-ink">
                          Order #{order.order_number}
                          <span className="font-normal text-dark/60"> · {formatDate(order.created_at)}</span>
                        </p>
                        <p className="text-sm text-dark/70">
                          {order.order_items.map((item) => `${item.product_name} (${item.pack_label}) ×${item.quantity}`).join(", ")}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end sm:gap-1">
                        <span className="font-heading font-bold text-ink">{formatInr(order.total)}</span>
                        <span className="text-xs font-semibold text-dark/60">
                          {orderStatusLabels[order.status]} · {order.payment_method === "online" ? "Paid online" : "Pay on delivery"}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card id="addresses" title="Saved addresses">
              <AddressBook addresses={(addressesRes.data ?? []) as Address[]} />
            </Card>

            <Card id="wishlist" title="Wishlist">
              <WishlistList slugs={(wishlistRes.data ?? []).map((row) => row.slug as string)} />
            </Card>

            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <Card id="rewards" title="Reward points">
                <p className="font-heading text-3xl font-bold text-ink">{points}</p>
                <p className="mt-1 text-sm text-dark/60">Points earned on orders will show here once rewards start.</p>
              </Card>

              <Card id="membership" title="Membership">
                {activeMembership ? (
                  <p className="text-sm text-dark/70">
                    Active until <span className="font-semibold text-ink">{formatDate(activeMembership.expires_at)}</span>.{" "}
                    {membershipOffer.discountPercent}% off sweets and food, free delivery above ₹{membershipOffer.freeDeliveryThreshold}.
                  </p>
                ) : (
                  <p className="text-sm text-dark/70">
                    Not a member yet. ₹{membershipOffer.fee}/year for {membershipOffer.discountPercent}% off sweets and food.{" "}
                    <Link href="/membership" className="font-semibold text-primary-dark hover:underline">
                      Join the waitlist
                    </Link>
                  </p>
                )}
              </Card>
            </div>

            <Card id="milk" title="Milk subscription">
              {milk ? (
                <p className="text-sm text-dark/70">
                  Interest registered on <span className="font-semibold text-ink">{formatDate(milk.created_at)}</span>
                  {milk.daily_litres ? ` for ${milk.daily_litres} L a day` : ""}
                  {milk.timing ? ` (${String(milk.timing).toLowerCase()})` : ""} in {milk.area}. {milkSubscription.launchNotice}
                </p>
              ) : (
                <p className="text-sm text-dark/70">
                  Fresh farm milk at ₹{milkSubscription.pricePerLitre}/litre is coming soon.{" "}
                  <Link href="/milk-subscription#register" className="font-semibold text-primary-dark hover:underline">
                    Register your interest
                  </Link>
                </p>
              )}
            </Card>

            <Card id="support" title="Support requests">
              <SupportRequests
                requests={(supportRes.data ?? []) as SupportRequest[]}
                orderNumbers={orders.map((order) => order.order_number)}
              />
            </Card>
          </div>
        </div>
      </div>
    </section>
  );
}
