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
import { WithdrawMilkInterest } from "@/components/account/withdraw-milk-interest";
import { milkSubscriberBenefits, milkSubscription } from "@/data/milk-subscription";
import { formatInr } from "@/lib/currency";
import { orderStatusLabels, type OrderStatus } from "@/lib/order-status";
import {
  FIRST_ORDER_DISCOUNT,
  FIRST_ORDER_MINIMUM,
  SUBSCRIBER_DISCOUNT_PERCENT,
  SUBSCRIBER_FREE_DELIVERY_MINIMUM,
} from "@/lib/order-rules";
import { customerFilter, getSignedInCustomer, isFirstOrder } from "@/lib/orders";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "My Account",
  robots: { index: false, follow: false },
};

type OrderRow = {
  id: string;
  order_number: number;
  invoice_number: string | null;
  created_at: string;
  status: OrderStatus;
  payment_method: "online" | "cod";
  payment_status: string;
  total: number;
  discount: number;
  order_items: { product_name: string; pack_label: string; quantity: number }[];
};

const milkStatusLabels: Record<string, string> = {
  interested: "Interest registered",
  active: "Active subscriber",
  paused: "Paused",
};

const sections = [
  { id: "orders", label: "Orders" },
  { id: "addresses", label: "Addresses" },
  { id: "wishlist", label: "Wishlist" },
  { id: "milk", label: "Milk subscription" },
  { id: "benefits", label: "Subscriber benefits" },
  { id: "rewards", label: "Rewards & offers" },
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
  const admin = createAdminClient();
  const byContact = admin ?? supabase;

  const [profileRes, ordersRes, addressesRes, wishlistRes, supportRes, pointsRes, milkRes] = await Promise.all([
    supabase.from("profiles").select("full_name, is_admin").eq("id", user.id).maybeSingle(),
    byContact
      .from("orders")
      .select("id, order_number, invoice_number, created_at, status, payment_method, payment_status, total, discount, order_items(product_name, pack_label, quantity)")
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
    supabase.from("reward_ledger").select("points"),
    byContact
      .from("milk_interest")
      .select("created_at, status, area, daily_litres, monthly_litres, timing, preferred_time")
      .or(customerFilter(customer))
      .neq("status", "cancelled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const orders = (ordersRes.data ?? []) as OrderRow[];
  const activeOrder = orders.find((order) => !["delivered", "cancelled"].includes(order.status));
  const points = (pointsRes.data ?? []).reduce((sum, row) => sum + (row.points as number), 0);
  const milk = milkRes.data;
  const milkSubscriber = milk?.status === "active";
  const welcomeOffer = admin ? await isFirstOrder(admin, customer) : false;

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
            {milkSubscriber ? (
              <span className="rounded-full border-2 border-ink bg-primary-light/40 px-3 py-1 text-xs font-semibold text-ink">
                🥛 Milk Subscriber
              </span>
            ) : null}
            <span className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold text-ink">Points: {points}</span>
            {profileRes.data?.is_admin ? (
              <Link
                href="/admin"
                className="font-heading rounded-full border-2 border-ink bg-ink px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-white hover:bg-ink-light"
              >
                Open Admin
              </Link>
            ) : null}
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
            {welcomeOffer && !milkSubscriber ? (
              <section className="sticker-shadow flex flex-col gap-3 rounded-2xl border-[2.5px] border-ink bg-[#fbeec4] p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
                <div>
                  <h2 className="font-heading text-lg font-bold text-ink">
                    🎉 Your welcome gift: {formatInr(FIRST_ORDER_DISCOUNT)} off your first order
                  </h2>
                  <p className="mt-1 text-sm text-dark/70">
                    Applied automatically at checkout on orders of {formatInr(FIRST_ORDER_MINIMUM)} or more. No code needed.
                  </p>
                </div>
                <Link
                  href="/#catalog"
                  className="font-heading sticker-shadow shrink-0 self-start rounded-full border-[2.5px] border-ink bg-accent px-5 py-2.5 text-xs font-semibold uppercase tracking-wide text-white sm:self-center"
                >
                  Shop Sweets
                </Link>
              </section>
            ) : null}

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
                        {order.status !== "cancelled" || order.invoice_number ? (
                          <a
                            href={`/invoice/${order.id}`}
                            target="_blank"
                            rel="noopener"
                            className="text-xs font-semibold text-primary-dark hover:underline"
                          >
                            Tax invoice
                          </a>
                        ) : null}
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

            <Card
              id="milk"
              title="Milk subscription"
              action={
                milk ? (
                  <span className="rounded-full border-2 border-ink px-3 py-1 text-xs font-semibold text-ink">
                    {milkStatusLabels[milk.status as string] ?? "Registered"}
                  </span>
                ) : null
              }
            >
              {milk ? (
                <div className="flex flex-col gap-3 text-sm text-dark/75">
                  <dl className="grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
                    <div>
                      <dt className="inline text-dark/55">Registered: </dt>
                      <dd className="inline font-semibold text-ink">{formatDate(milk.created_at)}</dd>
                    </div>
                    <div>
                      <dt className="inline text-dark/55">Locality: </dt>
                      <dd className="inline font-semibold text-ink">{milk.area}</dd>
                    </div>
                    {milk.daily_litres ? (
                      <div>
                        <dt className="inline text-dark/55">Daily: </dt>
                        <dd className="inline font-semibold text-ink">{milk.daily_litres} L</dd>
                      </div>
                    ) : null}
                    {milk.monthly_litres ? (
                      <div>
                        <dt className="inline text-dark/55">Monthly: </dt>
                        <dd className="inline font-semibold text-ink">{milk.monthly_litres} L</dd>
                      </div>
                    ) : null}
                    {milk.timing ? (
                      <div>
                        <dt className="inline text-dark/55">Preference: </dt>
                        <dd className="inline font-semibold text-ink">{milk.timing}</dd>
                      </div>
                    ) : null}
                    {milk.preferred_time ? (
                      <div>
                        <dt className="inline text-dark/55">Delivery time: </dt>
                        <dd className="inline font-semibold text-ink">{milk.preferred_time}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {milk.status === "interested" ? <p>{milkSubscription.launchNotice}</p> : null}
                  <div className="flex flex-wrap items-center gap-4">
                    <Link href="/milk-subscription#register" className="font-semibold text-primary-dark hover:underline">
                      Update details
                    </Link>
                    {milk.status === "interested" ? <WithdrawMilkInterest /> : null}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-dark/70">
                  Fresh farm milk at {formatInr(milkSubscription.pricePerLitre)}/litre (proposed) is coming soon.{" "}
                  <Link href="/milk-subscription#register" className="font-semibold text-primary-dark hover:underline">
                    Register your interest
                  </Link>{" "}
                  to unlock Milk Subscriber Benefits when it launches.
                </p>
              )}
            </Card>

            <Card
              id="benefits"
              title="Milk Subscriber Benefits"
              action={
                <span className="text-xs font-semibold text-dark/60">{milkSubscriber ? "Active" : "Unlocks with your milk subscription"}</span>
              }
            >
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {milkSubscriberBenefits.map((benefit) => (
                  <li key={benefit} className={`flex items-start gap-2 text-sm ${milkSubscriber ? "text-ink" : "text-dark/55"}`}>
                    <span aria-hidden="true" className={milkSubscriber ? "text-green-700" : "text-dark/35"}>
                      ✓
                    </span>
                    {benefit}
                  </li>
                ))}
              </ul>
              <p className="mt-3 text-xs text-dark/55">No extra fee. These benefits come with your milk subscription.</p>
            </Card>

            <Card id="rewards" title="Rewards & offers">
              <ul className="flex flex-col gap-3 text-sm">
                {welcomeOffer && !milkSubscriber ? (
                  <li className="rounded-xl bg-[#fbeec4] px-4 py-3 font-semibold text-ink">
                    🎉 {formatInr(FIRST_ORDER_DISCOUNT)} off your first order of {formatInr(FIRST_ORDER_MINIMUM)}+ (applied at checkout)
                  </li>
                ) : null}
                {milkSubscriber ? (
                  <li className="rounded-xl bg-primary-light/25 px-4 py-3 font-semibold text-ink">
                    🥛 {SUBSCRIBER_DISCOUNT_PERCENT}% off all Mithai Wallah products and free delivery on orders of{" "}
                    {formatInr(SUBSCRIBER_FREE_DELIVERY_MINIMUM)}+ (applied at checkout)
                  </li>
                ) : null}
                <li className="flex items-baseline justify-between gap-3 rounded-xl border-2 border-ink/10 px-4 py-3">
                  <span className="text-dark/70">Reward points</span>
                  <span className="font-heading text-xl font-bold text-ink">{points}</span>
                </li>
              </ul>
              <p className="mt-3 text-xs text-dark/55">
                {milkSubscriber
                  ? "Subscriber-only and festive offers will appear here."
                  : "Festive and subscriber-only offers will appear here."}
              </p>
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
