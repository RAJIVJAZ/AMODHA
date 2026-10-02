import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { milkFaqs, milkInterestFields, milkPurityPoints, milkSteps, milkSubscription } from "@/data/milk-subscription";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Fresh Milk Delivery in Prayagraj — Pure Milk Subscription",
  description:
    "Pure milk in Prayagraj from local farmers — no preservatives, milk powder or adulteration. ₹100/litre in glass bottles, delivered ~2 hours after collection.",
  keywords: ["Fresh Milk Delivery Prayagraj", "Pure Milk Prayagraj", "Milk Subscription Prayagraj", "A2 milk Prayagraj"],
  alternates: { canonical: "/milk-subscription" },
};

function googleFormEmbedUrl(url: string) {
  if (!url.includes("docs.google.com/forms")) return null;
  return url.includes("embedded=true") ? url : `${url}${url.includes("?") ? "&" : "?"}embedded=true`;
}

export default function MilkSubscriptionPage() {
  const formUrl = siteConfig.dairyInterestFormUrl;
  const embedUrl = formUrl ? googleFormEmbedUrl(formUrl) : null;

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Fresh Milk Subscription" }]} />

      <section className="relative overflow-hidden bg-blush py-16 sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary-light/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            {milkSubscription.name} · Coming soon
          </span>
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            Would You Like Truly Pure Milk Delivered to Your Doorstep?
          </h1>
          <p className="text-balance max-w-2xl text-lg text-ink/70 sm:text-xl">
            Fresh milk from local farmers near Prayagraj, in reusable glass bottles, at your door{" "}
            {milkSubscription.deliveryWindow} after it is collected.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            {[`₹${milkSubscription.pricePerLitre} / litre`, `Delivered ~2 hrs after collection`, "Reusable glass bottles"].map((chip) => (
              <span key={chip} className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-primary-light/40 px-4 py-2 text-sm font-bold text-ink">
                {chip}
              </span>
            ))}
          </div>
          <div role="note" className="sticker-shadow mt-2 w-full max-w-2xl rounded-2xl border-[2.5px] border-ink bg-[#fbeec4] p-5 text-left sm:p-6">
            <p className="font-heading text-lg font-bold text-ink">{milkSubscription.launchNotice}</p>
            <p className="mt-2 text-sm text-dark/75">
              Milk subscription is not available to buy yet. Registering your interest is free, takes no
              payment, and helps us decide which areas of Prayagraj to start with.
            </p>
          </div>
          <ButtonLink href="#register" variant="primary">
            Register Your Interest
          </ButtonLink>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading
            eyebrow="Pure Milk Prayagraj"
            title="Just Milk. Nothing Else."
            description="What you will never find in a Mithai Wallah milk bottle:"
          />
          <ul className="mx-auto grid w-full max-w-4xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
            {milkPurityPoints.map((point) => (
              <li key={point} className="sticker-shadow-sm flex items-center gap-3 rounded-2xl border-2 border-ink bg-white p-4 lg:flex-col lg:text-center">
                <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2 border-ink bg-accent font-bold text-white">
                  ✕
                </span>
                <span className="font-heading font-bold text-ink">{point}</span>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-primary-light/20 py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="How It Will Work" title="From Farm to Your Door in About 2 Hours" />
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

      <section id="register" className="scroll-mt-24 py-16 sm:py-24">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <div className="flex flex-col gap-5">
            <SectionHeading
              align="left"
              eyebrow="Milk Subscription Prayagraj"
              title="Register Your Interest"
              description={`We start deliveries once ${milkSubscription.launchThreshold} households sign up. Tell us what you need and we'll contact you before launch.`}
            />
            <ul className="flex flex-col gap-2 text-sm text-dark/75">
              <li>✓ No payment now</li>
              <li>✓ No commitment — you decide at launch</li>
              <li>✓ We only use your details to plan deliveries and contact you</li>
            </ul>
          </div>
          {embedUrl ? (
            <div className="sticker-shadow overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white">
              <iframe src={embedUrl} title="Fresh milk subscription interest form" className="h-[1400px] w-full" loading="lazy" />
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
              title="Fresh Milk Interest Form"
              description="Fill this in and send it to us on WhatsApp."
              fields={milkInterestFields}
              whatsappIntro="Hi Mithai Wallah, I'm interested in the Farm Fresh Dairy Subscription."
              saveEndpoint="/api/milk-interest"
            />
          )}
        </div>
      </section>

      <section className="bg-blush py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="FAQs" title="Fresh Milk Questions" />
          <div className="mx-auto w-full max-w-3xl">
            <FaqAccordion items={milkFaqs} />
          </div>
        </div>
      </section>
    </>
  );
}
