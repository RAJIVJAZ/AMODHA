import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { MilkStatusSelect } from "@/components/admin/milk-status-select";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { StaffManager } from "@/components/admin/staff-manager";
import { SupportReply } from "@/components/admin/support-reply";
import { milkSubscription } from "@/data/milk-subscription";
import { getStaffClient } from "@/lib/admin-auth";
import { formatInr } from "@/lib/currency";
import { discountLabels, type DiscountReason } from "@/lib/order-rules";
import type { OrderStatus } from "@/lib/order-status";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

type AdminOrder = {
  id: string;
  order_number: number;
  created_at: string;
  customer_name: string;
  phone: string;
  address: string;
  city: string;
  pincode: string;
  notes: string | null;
  payment_method: "online" | "cod";
  payment_status: string;
  status: OrderStatus;
  total: number;
  discount: number;
  milk_subscriber: boolean;
  discount_reason: DiscountReason | null;
  order_items: { product_name: string; pack_label: string; quantity: number }[];
};

function formatTime(value: string) {
  return new Date(value).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone: "Asia/Kolkata" });
}

export default async function AdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/admin");

  const staff = await getStaffClient();
  if (!staff) {
    // Customers can read their own profile, so this tells staff apart without the secret key.
    const { data: profile } = await supabase.from("profiles").select("is_admin").eq("id", user.id).maybeSingle();
    if (!profile?.is_admin) notFound();
    return (
      <section className="bg-blush py-16">
        <div className="container-site">
          <div className="sticker-shadow mx-auto max-w-xl rounded-2xl border-2 border-ink bg-white p-6">
            <h1 className="text-2xl font-bold text-ink">Admin is not connected yet</h1>
            <p className="mt-3 text-sm text-dark/75">
              The live site can&rsquo;t find the <code>SUPABASE_SECRET_KEY</code> environment variable, so it can&rsquo;t
              load orders. In Vercel → Project → Settings → Environment Variables, add it for the Production
              environment, then redeploy.
            </p>
            <p className="mt-4 text-sm font-semibold text-ink">Related settings this deployment can see (names only):</p>
            <p className="mt-1 break-all font-mono text-xs text-dark/70">
              {Object.keys(process.env)
                .filter((name) => /SUPABASE|SECRET|SERVICE_ROLE/i.test(name))
                .sort()
                .join(", ") || "none"}
            </p>
            <p className="mt-2 text-xs text-dark/55">Deployment: {process.env.VERCEL_ENV ?? "unknown"} · {process.env.VERCEL_GIT_COMMIT_REF ?? "unknown branch"}</p>
          </div>
        </div>
      </section>
    );
  }

  const [ordersRes, supportRes, milkRes, staffRes, staffProfilesRes] = await Promise.all([
    staff
      .from("orders")
      .select("id, order_number, created_at, customer_name, phone, address, city, pincode, notes, payment_method, payment_status, status, total, discount, milk_subscriber, discount_reason, order_items(product_name, pack_label, quantity)")
      .order("created_at", { ascending: false })
      .limit(50),
    staff.from("support_requests").select("id, user_id, subject, message, order_number, created_at").eq("status", "open").order("created_at"),
    staff
      .from("milk_interest")
      .select("id, user_id, name, phone, area, daily_litres, monthly_litres, timing, preferred_time, wants_subscription, status, created_at")
      .order("created_at", { ascending: false })
      .limit(200),
    staff.from("staff_emails").select("email").order("created_at"),
    staff.from("profiles").select("email").eq("is_admin", true),
  ]);
  const signedUpStaff = new Set((staffProfilesRes.data ?? []).map((row) => row.email as string));
  const staffMembers = (staffRes.data ?? []).map((row) => ({
    email: row.email as string,
    signedUp: signedUpStaff.has(row.email as string),
  }));

  const orders = (ordersRes.data ?? []) as AdminOrder[];
  const milkEntries = milkRes.data ?? [];
  // The launch target counts households (distinct phone numbers) that still want milk.
  const interestedHouseholds = new Set(milkEntries.filter((entry) => entry.status !== "cancelled").map((entry) => entry.phone)).size;
  const activeSubscribers = milkEntries.filter((entry) => entry.status === "active").length;
  const subscriberUserIds = new Set(
    milkEntries.filter((entry) => entry.status === "active" && entry.user_id).map((entry) => entry.user_id as string)
  );
  // Priority support: milk subscribers' requests first, then oldest first.
  const supportRequests = [...(supportRes.data ?? [])].sort(
    (a, b) => Number(subscriberUserIds.has(b.user_id)) - Number(subscriberUserIds.has(a.user_id))
  );

  return (
    <section className="bg-blush py-10 sm:py-14">
      <div className="container-site flex flex-col gap-6">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <h1 className="text-3xl font-bold text-ink">Orders &amp; Requests</h1>
          <a href="/account" className="text-sm font-semibold text-primary-dark hover:underline">
            ← My account
          </a>
        </div>

        <div className="sticker-shadow overflow-hidden rounded-2xl border-2 border-ink bg-white">
          <h2 className="font-heading border-b-2 border-ink/10 px-5 py-4 text-lg font-bold text-ink">Latest orders</h2>
          {orders.length === 0 ? <p className="px-5 py-4 text-sm text-dark/60">No orders yet.</p> : null}
          <ul className="divide-y-2 divide-ink/10">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:justify-between">
                <div className="text-sm">
                  <p className="font-semibold text-ink">
                    {order.milk_subscriber ? (
                      <span className="mr-2 rounded-full bg-primary-light/50 px-2 py-0.5 text-xs font-bold text-ink">⭐ Milk subscriber · priority</span>
                    ) : null}
                    #{order.order_number} · {order.customer_name} ·{" "}
                    <a href={`tel:+91${order.phone}`} className="text-primary-dark hover:underline">
                      {order.phone}
                    </a>
                    <span className="font-normal text-dark/60"> · {formatTime(order.created_at)}</span>
                  </p>
                  <p className="text-dark/75">
                    {order.order_items.map((item) => `${item.product_name} (${item.pack_label}) ×${item.quantity}`).join(", ")}
                  </p>
                  <p className="text-dark/60">
                    {order.address}, {order.city} – {order.pincode}
                    {order.notes ? ` · Note: ${order.notes}` : ""}
                  </p>
                  <p className="font-semibold text-ink">
                    {formatInr(order.total)}
                    {order.discount > 0
                      ? ` (after ${formatInr(order.discount)} ${(order.discount_reason ? discountLabels[order.discount_reason] : "discount").toLowerCase()})`
                      : ""} ·{" "}
                    {order.payment_method === "online" ? (order.payment_status === "paid" ? "Paid online" : "Online, not paid") : "Pay on delivery"}
                  </p>
                </div>
                <OrderStatusSelect orderId={order.id} status={order.status} />
              </li>
            ))}
          </ul>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-5">
            <h2 className="font-heading text-lg font-bold text-ink">Open support requests</h2>
            {supportRequests.length === 0 ? <p className="mt-2 text-sm text-dark/60">None open.</p> : null}
            <ul className="mt-3 flex flex-col gap-4">
              {supportRequests.map((request) => (
                <li key={request.id} className="text-sm">
                  <p className="font-semibold text-ink">
                    {subscriberUserIds.has(request.user_id) ? (
                      <span className="mr-2 rounded-full bg-primary-light/50 px-2 py-0.5 text-xs font-bold text-ink">⭐ Priority</span>
                    ) : null}
                    {request.subject}
                    {request.order_number ? ` · Order #${request.order_number}` : ""}
                  </p>
                  <p className="text-dark/70">{request.message}</p>
                  <SupportReply id={request.id} />
                </li>
              ))}
            </ul>
          </div>

          <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-5">
            <h2 className="font-heading text-lg font-bold text-ink">
              Milk interest: {interestedHouseholds} of {milkSubscription.launchThreshold} households
            </h2>
            <p className="mt-1 text-xs text-dark/60">
              {activeSubscribers} active subscriber{activeSubscribers === 1 ? "" : "s"}. Set a registration to &ldquo;Active subscriber&rdquo;
              when their deliveries start: their Milk Subscriber Benefits switch on automatically.
            </p>
            <ul className="mt-3 flex flex-col divide-y divide-ink/10 text-sm">
              {milkEntries.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-2 py-2 sm:flex-row sm:items-start sm:justify-between">
                  <span className={entry.status === "cancelled" ? "text-dark/40 line-through" : "text-dark/75"}>
                    <span className="font-semibold text-ink">{entry.name}</span> · {entry.phone} · {entry.area}
                    {entry.daily_litres ? ` · ${entry.daily_litres} L/day` : ""}
                    {entry.monthly_litres ? ` · ${entry.monthly_litres} L/month` : ""}
                    {entry.timing ? ` · ${entry.timing}` : ""}
                    {entry.preferred_time ? ` · ${entry.preferred_time}` : ""}
                    {entry.wants_subscription === false ? " · not sure about subscribing" : ""}
                    {entry.user_id ? "" : " · no account"}
                  </span>
                  <MilkStatusSelect id={entry.id} status={entry.status} />
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-5 lg:max-w-xl">
          <h2 className="font-heading text-lg font-bold text-ink">Admins</h2>
          <div className="mt-3">
            <StaffManager staff={staffMembers} currentEmail={user.email?.toLowerCase() ?? null} />
          </div>
        </div>
      </div>
    </section>
  );
}
