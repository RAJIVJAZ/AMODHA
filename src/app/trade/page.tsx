import type { Metadata } from "next";
import Link from "next/link";
import { CustomerForm } from "@/components/b2b/customer-form";
import { Card, ErrorBox, Notice, StatusPill, SupportLinks, waLink } from "@/components/b2b/trade-ui";
import { MarkNotificationsRead } from "@/components/b2b/trade-widgets";
import { paymentTerms, productImage } from "@/lib/b2b/labels";
import type { CatalogueItem, OrderListRow } from "@/lib/b2b/types";
import { date, dateTime, inr } from "@/lib/ops/format";
import { siteConfig } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { getMe, isOpenOrder, rpc, type CustomerMe } from "./_lib/data";

export const metadata: Metadata = { title: "Home" };

const bigButton = "flex min-h-14 items-center justify-center gap-2 rounded-2xl px-5 py-3 text-center font-heading text-base font-bold";

type Notification = { id: number; title: string; body: string | null; status: string; created_at: string; order_id: string | null };

export default async function TradeHome() {
  const me = await getMe();

  if (me.state === "error") return <ErrorBox message={me.message} />;
  if (me.state === "signed_out") return <Landing />;

  if (me.state === "not_registered") {
    return (
      <div className="mx-auto max-w-3xl">
        <h1 className="font-heading text-2xl font-bold text-ink">Register your shop for wholesale</h1>
        <p className="mt-1 text-sm text-dark/70">
          You are signed in with a verified one-time code, so this login will be linked to your shop. Tell us about your business — our sales team verifies every
          shop before wholesale prices are shown.
        </p>
        <div className="mt-4">
          <CustomerForm mode="register" required={["business_address", "locality", "city", "customer_type", "expected_monthly_value"]} doneBase="/trade" />
        </div>
      </div>
    );
  }

  if (me.state === "pending_approval") {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Card>
          <p className="text-4xl" aria-hidden="true">⏳</p>
          <h1 className="mt-2 font-heading text-2xl font-bold text-ink">{me.link_request ? "Linking your login to your shop" : "Your shop is waiting for approval"}</h1>
          <p className="mt-2 text-sm text-dark/70">
            {me.link_request
              ? "This mobile number or GSTIN already belongs to a wholesale account. Our team is checking and will link your login to it — usually within one working day."
              : "Thank you for registering. Our sales team will call to verify your shop, then approve your account and set your wholesale prices. You will be able to order here as soon as that is done."}
          </p>
          <p className="mt-4 text-sm font-semibold text-ink">Need it sooner?</p>
          <div className="mt-2">
            <SupportLinks support={{ phone: siteConfig.contact.phone, whatsapp: siteConfig.contact.whatsapp, email: siteConfig.contact.email }} />
          </div>
        </Card>
      </div>
    );
  }

  if (me.state === "closed") {
    return (
      <div className="mx-auto max-w-xl py-6">
        <Card>
          <h1 className="font-heading text-2xl font-bold text-ink">This wholesale account is not active</h1>
          <p className="mt-2 text-sm text-dark/70">Your wholesale account is closed or was not approved. Please contact us if you would like to discuss it.</p>
          <div className="mt-4">
            <SupportLinks support={{ phone: siteConfig.contact.phone, whatsapp: siteConfig.contact.whatsapp, email: siteConfig.contact.email }} />
          </div>
        </Card>
      </div>
    );
  }

  if (me.state !== "active" && me.state !== "suspended") return null;
  return <Dashboard me={me} />;
}

function Landing() {
  const points = [
    { icon: "🏷️", title: "Your trade prices", text: "See the prices agreed for your shop, quantity breaks and current offers." },
    { icon: "⚡", title: "Order in a minute", text: "Quick order by code, reorder last week's order, or upload a CSV." },
    { icon: "🚚", title: "Track every order", text: "From confirmation to packing, dispatch and delivery." },
    { icon: "📒", title: "Invoices & statement", text: "GST invoices, outstanding balance and payment history in one place." },
  ];
  return (
    <div className="mx-auto max-w-3xl py-4">
      <section className="rounded-3xl bg-ink px-5 py-8 text-white sm:px-8">
        <p className="text-xs font-bold uppercase tracking-widest text-primary-light">For sweet shops & trade buyers</p>
        <h1 className="mt-2 font-heading text-3xl font-bold leading-tight sm:text-4xl">Wholesale mithai, ordered the easy way</h1>
        <p className="mt-3 text-white/80">
          Buy pure desi ghee sweets, milk cake, peda and more straight from {siteConfig.legalName}&apos;s plant in Prayagraj — at your approved trade prices, on
          credit or pay on delivery.
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Link href="/trade/login" className={`${bigButton} bg-accent text-white`}>
            Sign in with one-time code
          </Link>
          <Link href="/trade/login?register=1" className={`${bigButton} border-2 border-white/40 text-white`}>
            Register your shop
          </Link>
        </div>
        <p className="mt-3 text-xs text-white/60">New shops: sign in with your {siteConfig.loginMethod === "phone" ? "mobile number" : "email"} first, then fill in your shop details.</p>
      </section>
      <div className="mt-5 grid gap-3 sm:grid-cols-2">
        {points.map((p) => (
          <div key={p.title} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-ink/5">
            <p className="text-2xl" aria-hidden="true">
              {p.icon}
            </p>
            <p className="mt-1 font-heading font-bold text-ink">{p.title}</p>
            <p className="text-sm text-dark/65">{p.text}</p>
          </div>
        ))}
      </div>
      <p className="mt-5 text-center text-sm text-dark/60">
        Buying for home? Visit the{" "}
        <Link href="/" className="font-semibold text-primary-dark underline">
          Mithai Wallah shop
        </Link>{" "}
        instead.
      </p>
    </div>
  );
}

async function Dashboard({ me }: { me: CustomerMe }) {
  const supabase = await createClient();
  const [orders, catalogue, notes] = await Promise.all([
    rpc<OrderListRow[]>("b2b_orders", { p_customer_id: me.customer.id, p_limit: 60 }),
    rpc<CatalogueItem[]>("b2b_catalogue"),
    supabase.from("b2b_notifications").select("id, title, body, status, created_at, order_id").eq("channel", "in_app").order("created_at", { ascending: false }).limit(20),
  ]);
  const orderRows = orders.data ?? [];
  const items = catalogue.data ?? [];
  const notifications = (notes.data ?? []) as Notification[];
  const suspended = me.state === "suspended";
  const lastOrder = orderRows.find((o) => o.stage !== "cancelled");
  const open = orderRows.filter((o) => isOpenOrder(o.stage));
  const needConfirm = orderRows.filter((o) => o.confirmation === "pending" && o.stage !== "cancelled");

  // Frequently purchased: how many of the shop's orders each item appears in.
  const freq = new Map<string, { name: string; times: number; qty: number }>();
  for (const o of orderRows) {
    if (o.stage === "cancelled") continue;
    for (const it of o.items) {
      const cur = freq.get(it.name) ?? { name: it.name, times: 0, qty: 0 };
      cur.times += 1;
      cur.qty += Number(it.qty);
      freq.set(it.name, cur);
    }
  }
  const byName = new Map<string, CatalogueItem>();
  for (const c of items) {
    byName.set(c.name, c);
    if (!byName.has(c.product_name)) byName.set(c.product_name, c);
  }
  const favourites = [...freq.values()].sort((a, b) => b.times - a.times || b.qty - a.qty).slice(0, 6);
  const offers = items.filter((c) => (c.offers?.length ?? 0) > 0 || (c.price !== null && c.list_price !== null && c.price < c.list_price)).slice(0, 6);
  const credit = me.credit;
  const onCredit = me.customer.payment_terms === "credit";
  const sp = me.salesperson;
  const spWa = waLink(sp?.phone);

  return (
    <div className="flex flex-col gap-4">
      {suspended ? (
        <Notice tone="warn">
          <p className="font-semibold">Ordering is paused on your account.</p>
          <p className="mt-0.5">You can still see your orders, invoices and statement. Please contact your salesperson or our accounts team to resume ordering.</p>
        </Notice>
      ) : null}

      <section className="rounded-3xl bg-ink p-5 text-white">
        <p className="text-sm text-white/70">Namaste, {me.customer.owner_name}</p>
        <h1 className="font-heading text-2xl font-bold leading-tight">{me.customer.shop_name}</h1>
        <p className="mt-0.5 text-xs text-white/60">
          Customer code {me.customer.customer_code} · {paymentTerms[me.customer.payment_terms] ?? me.customer.payment_terms}
        </p>
        {!suspended ? (
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            <Link href="/trade/quick-order" className={`${bigButton} bg-accent text-white`}>
              Quick order
            </Link>
            {lastOrder ? (
              <Link href={`/trade/quick-order?reorder=${lastOrder.id}`} className={`${bigButton} bg-white text-ink`}>
                Reorder last order
                <span className="text-xs font-normal text-dark/60">({lastOrder.order_no})</span>
              </Link>
            ) : (
              <Link href="/trade/catalogue" className={`${bigButton} bg-white text-ink`}>
                Browse catalogue
              </Link>
            )}
          </div>
        ) : null}
      </section>

      {needConfirm.length ? (
        <Notice tone="warn">
          <p className="font-semibold">
            {needConfirm.length === 1 ? "An order needs your confirmation" : `${needConfirm.length} orders need your confirmation`}
          </p>
          <ul className="mt-1">
            {needConfirm.map((o) => (
              <li key={o.id}>
                <Link href={`/trade/orders/${o.id}`} className="inline-flex min-h-11 items-center font-semibold underline">
                  {o.order_no} · {inr(o.total, 0)} — review and confirm
                </Link>
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <Card title="Orders in progress" action={<Link href="/trade/orders" className="text-sm font-semibold text-primary-dark">All orders →</Link>}>
            {orders.error ? <p className="text-sm text-red-700">{orders.error}</p> : null}
            {open.length === 0 ? (
              <p className="text-sm text-dark/60">No orders in progress.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {open.slice(0, 6).map((o) => (
                  <li key={o.id}>
                    <Link href={`/trade/orders/${o.id}`} className="flex min-h-14 items-center justify-between gap-3 py-2">
                      <span className="min-w-0">
                        <span className="block font-semibold text-ink">{o.order_no}</span>
                        <span className="block truncate text-xs text-dark/55">
                          {date(o.created_at)} · {o.items.length} item{o.items.length === 1 ? "" : "s"} · {inr(o.total, 0)}
                        </span>
                      </span>
                      <StatusPill label={o.status} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {favourites.length ? (
            <Card title="Your regular items">
              <ul className="grid gap-2 sm:grid-cols-2">
                {favourites.map((f) => {
                  const item = byName.get(f.name);
                  return (
                    <li key={f.name} className="flex items-center justify-between gap-2 rounded-xl bg-[#f6f4f1] px-3 py-2">
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-ink">{f.name}</span>
                        <span className="block text-xs text-dark/55">
                          In {f.times} order{f.times === 1 ? "" : "s"}
                          {item?.price != null ? ` · ${inr(item.price)}/${item.unit}` : ""}
                        </span>
                      </span>
                      {item && !suspended ? (
                        <Link href={`/trade/quick-order?add=${item.item_id}`} className="flex min-h-11 shrink-0 items-center rounded-lg bg-ink px-3 text-xs font-bold text-white">
                          Add
                        </Link>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {offers.length ? (
            <Card title="Current offers" action={<Link href="/trade/catalogue" className="text-sm font-semibold text-primary-dark">Catalogue →</Link>}>
              <ul className="grid gap-3 sm:grid-cols-2">
                {offers.map((c) => {
                  const img = productImage(c);
                  const offer = c.offers?.[0];
                  return (
                    <li key={c.item_id} className="flex gap-3 rounded-xl border-2 border-accent/20 bg-blush p-3">
                      {img ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={img} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                      ) : null}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-ink">{c.name}</p>
                        <p className="text-sm">
                          <span className="font-bold text-accent-dark">{inr(offer?.price ?? c.price)}</span>
                          {c.list_price !== null && (offer?.price ?? c.price ?? 0) < c.list_price ? <span className="ml-2 text-xs text-dark/50 line-through">{inr(c.list_price)}</span> : null}
                          <span className="text-xs text-dark/55"> /{c.unit}</span>
                        </p>
                        {offer ? (
                          <p className="text-xs text-dark/60">
                            {offer.min_qty > 1 ? `Min ${offer.min_qty} · ` : ""}
                            {offer.note ?? "Offer"}
                            {offer.valid_to ? ` · till ${date(offer.valid_to)}` : ""}
                          </p>
                        ) : null}
                        {!suspended ? (
                          <Link href={`/trade/quick-order?add=${c.item_id}`} className="mt-1 inline-flex min-h-11 items-center text-sm font-bold text-primary-dark">
                            Order →
                          </Link>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          <Card title="Updates" id="notifications">
            <MarkNotificationsRead unread={me.unread} />
            {notifications.length === 0 ? (
              <p className="text-sm text-dark/60">No updates yet. We will post order and delivery updates here.</p>
            ) : (
              <ul className="divide-y divide-ink/5">
                {notifications.slice(0, 8).map((n) => (
                  <li key={n.id} className="flex gap-2 py-2.5">
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.status === "unread" ? "bg-accent" : "bg-transparent"}`} aria-hidden="true" />
                    <div className="min-w-0">
                      <p className={`text-sm ${n.status === "unread" ? "font-bold" : "font-semibold"} text-ink`}>
                        {n.order_id ? (
                          <Link href={`/trade/orders/${n.order_id}`} className="underline-offset-2 hover:underline">
                            {n.title}
                          </Link>
                        ) : (
                          n.title
                        )}
                      </p>
                      {n.body ? <p className="text-sm text-dark/65">{n.body}</p> : null}
                      <p className="text-xs text-dark/45">{dateTime(n.created_at)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card title="Account balance" action={<Link href="/trade/account" className="text-sm font-semibold text-primary-dark">Statement →</Link>}>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-dark/55">Outstanding</dt>
                <dd className="font-heading text-xl font-bold text-ink">{inr(credit.balance ?? 0, 0)}</dd>
              </div>
              <div>
                <dt className="text-dark/55">Overdue</dt>
                <dd className={`font-heading text-xl font-bold ${(credit.overdue ?? 0) > 0 ? "text-red-700" : "text-ink"}`}>{inr(credit.overdue ?? 0, 0)}</dd>
              </div>
              {onCredit ? (
                <>
                  <div>
                    <dt className="text-dark/55">Credit limit</dt>
                    <dd className="font-semibold text-ink">{inr(credit.credit_limit ?? 0, 0)}</dd>
                  </div>
                  <div>
                    <dt className="text-dark/55">Available</dt>
                    <dd className="font-semibold text-emerald-700">{inr(credit.available ?? 0, 0)}</dd>
                  </div>
                </>
              ) : null}
            </dl>
            {(credit.not_invoiced ?? 0) > 0 ? <p className="mt-2 text-xs text-dark/55">Plus {inr(credit.not_invoiced, 0)} in orders not invoiced yet.</p> : null}
            {(credit.overdue ?? 0) > 0 ? <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-semibold text-red-800">Please clear overdue invoices to keep ordering on credit.</p> : null}
          </Card>

          <Card title="Your salesperson">
            {sp ? (
              <>
                <p className="font-semibold text-ink">{sp.name}</p>
                {sp.phone ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    <a href={`tel:${sp.phone.replace(/[^\d+]/g, "")}`} className="flex min-h-11 items-center rounded-xl bg-ink px-4 text-sm font-semibold text-white">
                      Call {sp.phone}
                    </a>
                    {spWa ? (
                      <a href={spWa} target="_blank" rel="noopener noreferrer" className="flex min-h-11 items-center rounded-xl bg-emerald-600 px-4 text-sm font-semibold text-white">
                        WhatsApp
                      </a>
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-dark/60">A salesperson will be assigned to your shop soon.</p>
            )}
          </Card>

          <Card title="Customer support">
            <SupportLinks support={me.support} />
          </Card>

          <Card>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-dark/55">Orders placed</dt>
                <dd className="font-heading text-xl font-bold text-ink">{me.stats.orders ?? 0}</dd>
              </div>
              <div>
                <dt className="text-dark/55">Last order</dt>
                <dd className="font-semibold text-ink">{date(me.stats.last_order_at)}</dd>
              </div>
            </dl>
          </Card>
        </div>
      </div>
    </div>
  );
}
