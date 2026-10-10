import type { Metadata } from "next";
import Link from "next/link";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import {
  milkFaqs,
  milkFaqsWhenOpen,
  milkInterestFields,
  milkProductPoints,
  milkSteps,
  milkSubscriberBenefits,
  milkSubscription,
} from "@/data/milk-subscription";
import { siteConfig } from "@/lib/site";
import { milkSubscriptionStatus } from "@/lib/subscriptions";

// Picks up the milk price and whether subscriptions are open within a minute of a change in /ops.
export const revalidate = 60;

export async function generateMetadata(): Promise<Metadata> {
  const status = await milkSubscriptionStatus();
  const price = status.fromPrice ?? milkSubscription.pricePerLitre;
  return {
    title: "Farm Fresh Milk Subscription in Prayagraj",
    description: status.open
      ? `Fresh milk from local farmers near Prayagraj, delivered within hours of collection in reusable glass bottles. ₹${price}/litre. Subscribe, skip or pause any time.`
      : `Fresh milk from local farmers near Prayagraj, delivered within hours of collection in reusable glass bottles. ₹${price}/litre proposed. Join the early interest list.`,
    keywords: ["Fresh Milk Delivery Prayagraj", "Pure Milk Prayagraj", "Milk Subscription Prayagraj", "Farm fresh milk Prayagraj"],
    alternates: { canonical: "/milk-subscription" },
  };
}

function googleFormEmbedUrl(url: string) {
  if (!url.includes("docs.google.com/forms")) return null;
  return url.includes("embedded=true") ? url : `${url}${url.includes("?") ? "&" : "?"}embedded=true`;
}

export default async function MilkSubscriptionPage() {
  const formUrl = siteConfig.dairyInterestFormUrl;
  const embedUrl = formUrl ? googleFormEmbedUrl(formUrl) : null;
  const status = await milkSubscriptionStatus();
  const open = status.open;
  const price = status.fromPrice ?? milkSubscription.pricePerLitre;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: milkSubscription.name }]} />

      <section className="relative overflow-hidden bg-blush py-16 sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary-light/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            {milkSubscription.name} · {open ? "Now delivering" : "Early interest list"}
          </span>
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            {milkSubscription.headline}
          </h1>
          <p className="text-balance max-w-2xl text-lg text-ink/70 sm:text-xl">
            {open
              ? "Fresh milk sourced directly from local farmers and delivered within hours of collection. Skip, top up or pause any time."
              : milkSubscription.subheadline}
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[open ? `₹${price} / litre` : `₹${price} / litre (proposed)`, "Delivered within hours of collection", "Reusable glass bottles"].map(
              (chip) => (
                <span key={chip} className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-primary-light/40 px-4 py-2 text-sm font-bold text-ink">
                  {chip}
                </span>
              )
            )}
          </div>
          {open ? (
            <>
              <div role="note" className="sticker-shadow mt-2 w-full max-w-2xl rounded-2xl border-[2.5px] border-ink bg-[#fbeec4] p-5 text-left sm:p-6">
                <p className="font-heading text-xs font-bold uppercase tracking-wide text-accent-dark">Subscriptions are open</p>
                <p className="font-heading mt-1 text-lg font-bold text-ink">Choose your bottles, days and delivery time, and we start from the next open day.</p>
                <p className="mt-2 text-sm text-dark/75">Nothing is charged upfront: pay for what is delivered, on delivery or by monthly bill.</p>
              </div>
              <div className="flex flex-wrap justify-center gap-3">
                <ButtonLink href="/account/milk" variant="primary">
                  Start My Subscription
                </ButtonLink>
                <ButtonLink href="/dairy-products/milk" variant="outline">
                  Order a Single Bottle
                </ButtonLink>
              </div>
            </>
          ) : (
            <>
              <div role="note" className="sticker-shadow mt-2 w-full max-w-2xl rounded-2xl border-[2.5px] border-ink bg-[#fbeec4] p-5 text-left sm:p-6">
                <p className="font-heading text-xs font-bold uppercase tracking-wide text-accent-dark">Important notice</p>
                <p className="font-heading mt-1 text-lg font-bold text-ink">{milkSubscription.launchNotice}</p>
                <p className="mt-2 text-sm text-dark/75">
                  This service is currently in the customer interest collection phase. Registering is free and takes no
                  payment.
                </p>
              </div>
              <ButtonLink href="#register" variant="primary">
                Join the Interest List
              </ButtonLink>
            </>
          )}
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading
            eyebrow="The Product"
            title="Just Fresh Milk, the Way It Should Be"
            description={open ? "What we bring to your doorstep every day:" : "What we're planning to bring to your doorstep every day:"}
          />
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {milkProductPoints.map((point) => (
              <li key={point.title} className="sticker-shadow-sm flex flex-col gap-2 rounded-2xl border-2 border-ink bg-white p-5">
                <span aria-hidden="true" className="flex h-8 w-8 items-center justify-center rounded-full border-2 border-ink bg-primary-light/50 text-sm font-bold text-ink">
                  ✓
                </span>
                <span className="font-heading font-bold text-ink">{point.title}</span>
                <span className="text-sm text-dark/65">{point.description}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-primary-light/20 py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow={open ? "How It Works" : "How It Will Work"} title="From the Farm to Your Door Within Hours" />
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {milkSteps.map((step, index) => (
              <li key={step.title} className="sticker-shadow-sm flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-6">
                <span className="font-heading text-3xl font-bold text-primary-dark">{String(index + 1).padStart(2, "0")}</span>
                <span className="font-heading font-bold text-ink">{step.title}</span>
                <span className="text-sm text-dark/65">{step.description}</span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div className="flex flex-col gap-5">
            <SectionHeading align="left" eyebrow="Milk Subscriber Benefits" title="Subscribe to Milk, Get More From Mithai Wallah" />
            <p className="text-dark/75">
              Every milk subscriber automatically gets these benefits on Mithai Wallah sweets and products. There is no
              extra fee.
            </p>
            <p className="font-subheading text-lg italic text-ink">{milkSubscription.community}</p>
          </div>
          <ul className="sticker-shadow flex flex-col gap-3 rounded-3xl border-[2.5px] border-ink bg-[#fbeec4] p-6 sm:p-8">
            {milkSubscriberBenefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-3 font-semibold text-ink">
                <span aria-hidden="true" className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent text-xs text-white">
                  ✓
                </span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      {open ? (
        <section id="register" className="scroll-mt-24 bg-blush py-16 sm:py-24">
          <div className="container-site flex flex-col items-center gap-8">
            <SectionHeading eyebrow="Subscribe" title="Start Your Milk Subscription" description="It takes about a minute." />
            <ol className="grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-3">
              {[
                ["Sign in", "With your email, so you can manage deliveries and see your bills."],
                ["Choose", "Bottles per delivery, which days, and morning or evening."],
                ["Relax", "Skip, add extra or pause any time until the evening before."],
              ].map(([title, text], index) => (
                <li key={title} className="sticker-shadow-sm flex flex-col gap-2 rounded-2xl border-2 border-ink bg-white p-5">
                  <span className="font-heading text-2xl font-bold text-primary-dark">{String(index + 1).padStart(2, "0")}</span>
                  <span className="font-heading font-bold text-ink">{title}</span>
                  <span className="text-sm text-dark/65">{text}</span>
                </li>
              ))}
            </ol>
            <ButtonLink href="/account/milk" variant="primary">
              Start My Subscription
            </ButtonLink>
          </div>
        </section>
      ) : (
        <section id="register" className="scroll-mt-24 bg-blush py-16 sm:py-24">
          <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
            <div className="flex flex-col gap-5">
              <SectionHeading
                align="left"
                eyebrow="Customer Interest Form"
                title="Join the Early Interest List"
                description={`We start deliveries once at least ${milkSubscription.launchThreshold} regular subscription customers confirm. Tell us what you need and we'll contact you before launch.`}
              />
              <ul className="flex flex-col gap-2 text-sm text-dark/75">
                <li>✓ No payment now</li>
                <li>✓ No commitment: you decide at launch</li>
                <li>✓ We only use your details to plan deliveries and contact you</li>
              </ul>
              {siteConfig.accountsLive ? (
                <p className="rounded-xl border-2 border-ink/15 bg-white px-4 py-3 text-sm text-dark/75">
                  <Link href="/login?next=/milk-subscription%23register" className="font-semibold text-primary-dark hover:underline">
                    Sign in first
                  </Link>{" "}
                  to see, update or withdraw your registration from your account later.
                </p>
              ) : null}
            </div>
            {embedUrl ? (
              <div className="sticker-shadow overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white">
                <iframe src={embedUrl} title="Farm Fresh Milk Subscription interest form" className="h-[1400px] w-full" loading="lazy" />
              </div>
            ) : formUrl ? (
              <div className="sticker-shadow flex flex-col items-start gap-4 rounded-3xl border-[2.5px] border-ink bg-white p-8">
                <p className="text-dark/75">The form takes about a minute and opens in a new tab.</p>
                <a
                  href={formUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-heading sticker-shadow inline-flex items-center justify-center rounded-full border-[2.5px] border-ink bg-accent px-6 py-3 text-sm font-semibold uppercase tracking-wide text-white hover:bg-accent-dark"
                >
                  Open the Interest Form
                </a>
              </div>
            ) : (
              <EnquiryForm
                title="Farm Fresh Milk Interest Form"
                description="Fill this in and send it to us. It's saved for our team and opens WhatsApp so you can send a copy."
                fields={milkInterestFields}
                whatsappIntro="Hi Mithai Wallah, I'm interested in the Farm Fresh Milk Subscription."
                saveEndpoint="/api/milk-interest"
              />
            )}
          </div>
        </section>
      )}

      <section className="py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="FAQs" title="Fresh Milk Questions" />
          <div className="mx-auto w-full max-w-3xl">
            <FaqAccordion items={open ? milkFaqsWhenOpen(price) : milkFaqs} />
          </div>
        </div>
      </section>
    </>
  );
}
