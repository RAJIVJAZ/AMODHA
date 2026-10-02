import { ButtonLink } from "@/components/ui/button-link";
import { formatInr } from "@/lib/currency";
import { discountLabels } from "@/lib/order-rules";
import type { OrderSummary } from "@/lib/orders";
import { siteConfig } from "@/lib/site";

export type PlacedOrder = { summary: OrderSummary; payment: string };

/** The on-screen confirmation shown after an order is placed. */
export function OrderConfirmation({ placed, signedIn }: { placed: PlacedOrder; signedIn: boolean }) {
  const { summary, payment } = placed;
  const rows: [string, string][] = [
    ["Subtotal", formatInr(summary.subtotal)],
    ["Delivery", summary.deliveryFee === 0 ? "Free" : formatInr(summary.deliveryFee)],
  ];
  if (summary.discount > 0) {
    rows.push([summary.discountReason ? discountLabels[summary.discountReason] : "Discount", `−${formatInr(summary.discount)}`]);
  }

  return (
    <section className="container-site py-14 sm:py-20">
      <div className="mx-auto flex max-w-2xl flex-col gap-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <span aria-hidden="true" className="text-5xl">
            ✅
          </span>
          <h1 className="text-3xl font-bold text-ink sm:text-4xl">Thank you! Your order is placed.</h1>
          {summary.orderNumber ? <p className="font-heading text-xl font-bold text-ink">Order #{summary.orderNumber}</p> : null}
          <p className="max-w-md text-dark/70">
            We&rsquo;re preparing your sweets fresh in pure desi ghee.
            {summary.emailedTo ? (
              <>
                {" "}
                Your invoice is on its way to <span className="font-semibold text-ink">{summary.emailedTo}</span>.
              </>
            ) : null}
          </p>
        </div>

        <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-5 sm:p-6">
          <h2 className="font-heading text-lg font-bold text-ink">Order details</h2>
          <ul className="mt-4 flex flex-col gap-2 text-sm">
            {summary.lines.map((line) => (
              <li key={`${line.slug}-${line.packLabel}`} className="flex justify-between gap-4">
                <span className="text-dark/75">
                  {line.productName} ({line.packLabel}) × {line.quantity}
                </span>
                <span className="font-semibold text-ink">{formatInr(line.unitPrice * line.quantity)}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 flex flex-col gap-1.5 border-t-2 border-dashed border-ink/20 pt-4 text-sm">
            {rows.map(([label, value]) => (
              <div key={label} className="flex justify-between text-dark/70">
                <span>{label}</span>
                <span className={`font-semibold ${value.startsWith("−") ? "text-green-700" : "text-ink"}`}>{value}</span>
              </div>
            ))}
            <div className="mt-1 flex justify-between border-t-2 border-dashed border-ink/20 pt-2">
              <span className="font-heading font-bold text-ink">Total</span>
              <span className="font-heading font-bold text-ink">{formatInr(summary.total)}</span>
            </div>
          </div>
          <dl className="mt-5 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="font-semibold text-ink">Payment</dt>
              <dd className="text-dark/70">{payment}</dd>
            </div>
            <div>
              <dt className="font-semibold text-ink">Delivering to</dt>
              <dd className="text-dark/70">
                {summary.deliverTo.name}, {summary.deliverTo.address}, {summary.deliverTo.city} – {summary.deliverTo.pincode}
                <br />
                +91 {summary.deliverTo.phone}
              </dd>
            </div>
          </dl>
        </div>

        <p className="text-center text-sm text-dark/65">
          Our team will call you if anything needs confirming. Questions? Call{" "}
          <a href={`tel:${siteConfig.contact.phoneHref}`} className="font-semibold text-primary-dark hover:underline">
            {siteConfig.contact.phone}
          </a>
          .
        </p>

        <div className="flex flex-wrap justify-center gap-3">
          {signedIn ? (
            <ButtonLink href="/account" variant="primary">
              Track Your Order
            </ButtonLink>
          ) : null}
          <ButtonLink href="/#catalog" variant="ghost">
            Continue Shopping
          </ButtonLink>
        </div>
      </div>
    </section>
  );
}
