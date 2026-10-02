import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { OrderStatusSelect } from "@/components/admin/order-status-select";
import { SupportReply } from "@/components/admin/support-reply";
import { milkSubscription } from "@/data/milk-subscription";
import { getStaffClient } from "@/lib/admin-auth";
import { formatInr } from "@/lib/currency";
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
          </div>
        </div>
      </section>
    );
  }

  const [ordersRes, supportRes, milkRes, milkCountRes] = await Promise.all([
    staff
      .from("orders")
      .select("id, order_number, created_at, customer_name, phone, address, city, pincode, notes, payment_method, payment_status, status, total, discount, order_items(product_name, pack_label, quantity)")
      .order("created_at", { ascending: false })
      .limit(50),
    staff.from("support_requests").select("id, subject, message, order_number, created_at").eq("status", "open").order("created_at"),
    staff.from("milk_interest").select("id, name, phone, area, daily_litres, timing, wants_a2, created_at").order("created_at", { ascending: false }).limit(50),
    staff.from("milk_interest").select("phone", { count: "exact", head: true }),
  ]);

  const orders = (ordersRes.data ?? []) as AdminOrder[];
  const milkCount = milkCountRes.count ?? 0;

  return (
    <section className="bg-blush py-10 sm:py-14">
      <div className="container-site flex flex-col gap-6">
        <h1 className="text-3xl font-bold text-ink">Orders &amp; Requests</h1>

        <div className="sticker-shadow overflow-hidden rounded-2xl border-2 border-ink bg-white">
          <h2 className="font-heading border-b-2 border-ink/10 px-5 py-4 text-lg font-bold text-ink">Latest orders</h2>
          {orders.length === 0 ? <p className="px-5 py-4 text-sm text-dark/60">No orders yet.</p> : null}
          <ul className="divide-y-2 divide-ink/10">
            {orders.map((order) => (
              <li key={order.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:justify-between">
                <div className="text-sm">
                  <p className="font-semibold text-ink">
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
                    {order.discount > 0 ? ` (incl. ${formatInr(order.discount)} first-order discount)` : ""} ·{" "}
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
            {(supportRes.data ?? []).length === 0 ? <p className="mt-2 text-sm text-dark/60">None open.</p> : null}
            <ul className="mt-3 flex flex-col gap-4">
              {(supportRes.data ?? []).map((request) => (
                <li key={request.id} className="text-sm">
                  <p className="font-semibold text-ink">
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
              Milk registrations: {milkCount} (launch at {milkSubscription.launchThreshold} households)
            </h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {(milkRes.data ?? []).map((entry) => (
                <li key={entry.id} className="text-dark/75">
                  <span className="font-semibold text-ink">{entry.name}</span> · {entry.phone} · {entry.area}
                  {entry.daily_litres ? ` · ${entry.daily_litres} L` : ""}
                  {entry.timing ? ` · ${entry.timing}` : ""}
                  {entry.wants_a2 ? " · A2" : ""}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
