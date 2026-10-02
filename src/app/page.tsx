import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { TrustBar } from "@/components/ui/trust-bar";
import { CtaSection } from "@/components/ui/cta-section";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { GheeSeal } from "@/components/ui/ghee-seal";
import { generalFaqs } from "@/data/faqs";
import { membership } from "@/data/membership";
import { processSteps } from "@/data/process";
import { reviews } from "@/data/reviews";
import { sweets, hamperCategories } from "@/data/sweets";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: { absolute: "Pure Desi Ghee Sweets in Prayagraj | Mithai Wallah" },
  description:
    "Pure desi ghee sweets made fresh in Prayagraj: milk cake, kalakand, barfi, peda and kunda from local farmers' milk. Traceable batches. Free delivery ₹999+.",
  alternates: { canonical: "/" },
};

const reasons = [
  {
    icon: "🧈",
    title: "Pure Desi Ghee Sweets",
    description: "Every sweet is cooked in 100% pure desi ghee. No vanaspati, no blended fats.",
  },
  {
    icon: "🧼",
    title: "Hygienic Manufacturing",
    description: "Made and packed in a clean, hygienic kitchen by a gloved, masked team.",
  },
  {
    icon: "🔎",
    title: "Traceable Batches",
    description: "Every production batch is recorded, so each box can be traced back to where it came from.",
  },
  {
    icon: "🧑‍🌾",
    title: "Local Farmer Sourcing",
    description: "Fresh milk bought directly from around 100 local farmers in villages near Prayagraj.",
  },
  {
    icon: "📜",
    title: "Traditional Recipes",
    description: "Slow-reduced khoya and time-honoured recipes for milk cake, peda, kunda and more.",
  },
  {
    icon: "🌅",
    title: "Fresh Production",
    description: "Made in small batches and delivered fresh across Prayagraj — never sitting in a warehouse.",
  },
];

const hygienePoints = [
  "Gloved, masked team in production",
  "Clean steel kadhais and food-safe surfaces",
  "Sealed, food-safe packaging",
  "FSSAI-registered manufacturing facility",
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-blush py-20 sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary-light/50 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <div className="sticker-shadow rounded-2xl border-[2.5px] border-ink bg-white p-3">
              <Image
                src="/logos/mithaiwallah.png"
                alt={siteConfig.name}
                width={900}
                height={507}
                priority
                className="h-24 w-auto sm:h-28"
              />
            </div>
            <p className="font-subheading text-xl italic text-ink sm:text-2xl">{siteConfig.tagline}</p>
          </div>
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            Made fresh in Prayagraj since {siteConfig.founded}
          </span>
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            Pure Desi Ghee Sweets, Made Fresh in Prayagraj
          </h1>
          <p className="text-balance max-w-2xl text-lg text-ink/70 sm:text-xl">
            Fresh milk from around 100 local farmers, cooked in 100% pure desi ghee in a hygienic
            kitchen — every batch recorded and traceable. Delivered across Prayagraj, free on orders ₹999+.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="#catalog" variant="primary">
              Order Sweets
            </ButtonLink>
            <ButtonLink href="/corporate-gifting" variant="outline">
              Corporate Gifting
            </ButtonLink>
            <ButtonLink href="/wedding-gifting" variant="outline">
              Wedding Gifting
            </ButtonLink>
          </div>
          <div className="relative mt-6 w-full max-w-xl">
            <div className="sticker-shadow overflow-hidden rounded-3xl border-[2.5px] border-ink">
              <Image
                src="/images/sweet-corner/assorted-gift-box.webp"
                alt="Mithai Wallah sweet box with Milk Cake, Kalakand, Chocolate Barfi, Doda Barfi and Peda made in pure desi ghee"
                width={1370}
                height={1148}
                priority
                className="h-auto w-full object-cover"
              />
            </div>
            <GheeSeal
              idPrefix="hero-seal"
              className="absolute -right-3 -top-10 h-24 w-24 rotate-[-10deg] drop-shadow-md sm:-right-12 sm:-top-12 sm:h-36 sm:w-36"
            />
          </div>
        </div>
      </section>

      <TrustBar />

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Why Choose Us"
            title="Looking for the Best Sweets in Prayagraj?"
            description="Here's what goes into every box of Mithai Wallah — and what never does."
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {reasons.map((reason) => (
              <div key={reason.title} className="sticker-shadow-sm flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-6">
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-primary-light/40 text-2xl">
                  {reason.icon}
                </span>
                <h3 className="font-heading text-lg font-bold text-ink">{reason.title}</h3>
                <p className="text-sm text-dark/70">{reason.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section id="catalog" className="bg-blush py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Our Sweets"
            title="Traditional Indian Sweets, Made Fresh"
            description="Desi ghee mithai made in-house from fresh khoya, paneer and cream — order online for delivery across Prayagraj."
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {sweets.map((sweet) => (
              <Link
                key={sweet.slug}
                href={`/sweet-corner/${sweet.slug}`}
                className="sticker-shadow group flex flex-col justify-between overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white transition-all duration-150 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-ink)]"
              >
                {sweet.image ? (
                  <div className="relative aspect-[4/3] w-full border-b-2 border-ink">
                    <Image
                      src={sweet.image}
                      alt={sweet.imageAlt ?? sweet.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                    {sweet.pureDesiGhee ? (
                      <span className="font-heading absolute left-3 top-3 rounded-full border-2 border-ink bg-[#f3d27a] px-3 py-1 text-xs font-bold uppercase tracking-wide text-ink">
                        100% Pure Desi Ghee
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="p-6 pb-0">
                    <div
                      className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl border-2 border-ink text-2xl"
                      style={{ backgroundColor: sweet.color }}
                    >
                      🍬
                    </div>
                  </div>
                )}
                <div className="flex flex-1 flex-col justify-between p-6">
                  <div>
                    <h3 className="font-heading text-xl font-bold text-ink">{sweet.name}</h3>
                    <p className="mt-2 text-sm text-dark/70">{sweet.shortDescription}</p>
                  </div>
                  <span className="font-heading mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-accent">
                    View Details
                    <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                      →
                    </span>
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Our Process"
            title="How We Make Our Sweets"
            description="Six steps from fresh farm milk to a sealed box at your door."
          />
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {processSteps.map((step, index) => (
              <li key={step.title} className="sticker-shadow-sm flex flex-col gap-3 rounded-2xl border-2 border-ink bg-blush p-6">
                <span className="font-heading text-3xl font-bold text-primary-dark">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-heading font-bold text-ink">{step.title}</span>
                <span className="text-sm text-dark/65">{step.summary}</span>
              </li>
            ))}
          </ol>
          <div className="text-center">
            <ButtonLink href="/our-process" variant="ghost">
              See Every Step in Detail
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-primary-light/20 py-20 sm:py-28">
        <div className="container-site grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="flex flex-col gap-5">
            <SectionHeading
              align="left"
              eyebrow={`Farmer Sourced · Est. ${siteConfig.founded}`}
              title="Our Milk Comes From Farmers We Know"
            />
            <p className="text-dark/75">
              We started {siteConfig.name} in Prayagraj in {siteConfig.founded} with a simple belief:
              mithai tastes best when it&rsquo;s made honestly. So instead of buying milk from the open
              market, we collect it fresh, directly from around 100 local farmers in villages near
              Prayagraj.
            </p>
            <p className="text-dark/75">
              Buying straight from farmers means we know where every litre comes from, every lot is
              checked before it is used, and the farming families around Prayagraj get a fair, steady
              buyer for their milk. That fresh milk becomes the khoya behind our milk cake, kalakand,
              peda and the Prayagraj specialty, Kunda.
            </p>
            <div>
              <ButtonLink href="/about" variant="ghost">
                Read Our Full Story
              </ButtonLink>
            </div>
          </div>
          <div className="sticker-shadow relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-6 overflow-hidden rounded-3xl border-[2.5px] border-ink bg-gradient-to-br from-primary-light/50 via-blush to-accent/20 p-8 text-center">
            <GheeSeal idPrefix="story-seal" className="h-40 w-40 sm:h-48 sm:w-48" />
            <div className="grid w-full grid-cols-2 gap-4">
              <div className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-4">
                <p className="font-heading text-3xl font-bold text-ink">{siteConfig.stats.farmers}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-dark/60">Local farmers</p>
              </div>
              <div className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-4">
                <p className="font-heading text-3xl font-bold text-ink">{siteConfig.founded}</p>
                <p className="text-xs font-medium uppercase tracking-wide text-dark/60">Est. in Prayagraj</p>
              </div>
            </div>
            <p className="font-subheading text-lg italic text-ink">
              &ldquo;Fresh milk, pure desi ghee — and every batch traceable.&rdquo;
            </p>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Hygiene & Traceability"
            title="Clean Kitchen. Recorded Batches."
            description="How we keep every box safe — and how we can tell you exactly which batch it came from."
          />
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
            <div className="sticker-shadow flex flex-col overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white">
              <div className="relative aspect-[16/10] w-full border-b-2 border-ink">
                <Image
                  src="/images/sweet-corner/production-facility.webp"
                  alt="Mithai Wallah production kitchen in Prayagraj with masked, gloved staff preparing sweets in large steel kadhais"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col gap-4 p-6 sm:p-8">
                <h3 className="font-heading text-2xl font-bold text-ink">Hygienic Production</h3>
                <p className="text-dark/70">
                  Our sweets are made and packed in our own manufacturing kitchen on Rewa Road,
                  Prayagraj, with hygiene built into every step.
                </p>
                <ul className="flex flex-col gap-2 text-sm text-dark/75">
                  {hygienePoints.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <span aria-hidden="true" className="text-accent">✓</span>
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="sticker-shadow flex flex-col overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white">
              <div className="relative aspect-[16/10] w-full border-b-2 border-ink">
                <Image
                  src="/images/sweet-corner/packaging-ivory-gold.webp"
                  alt="Sealed ivory and gold Mithai Wallah sweet boxes ready for delivery"
                  fill
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="object-cover"
                />
              </div>
              <div className="flex flex-col gap-4 p-6 sm:p-8">
                <h3 className="font-heading text-2xl font-bold text-ink">Batch Traceability</h3>
                <p className="text-dark/70">
                  Every production batch is recorded, so each box we pack can be traced back to the
                  exact batch it came from — and the milk that went into it.
                </p>
                <p className="text-dark/70">
                  Have a question about your order? Message us with the batch details on your box and
                  we&rsquo;ll look it up for you.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blush py-20 sm:py-28">
        <div className="container-site">
          <SectionHeading eyebrow="Gift Boxes" title="Hampers & Custom Boxes" align="center" />
          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div className="sticker-shadow relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-3xl border-2 border-ink">
              <Image
                src="/images/sweet-corner/packaging-maroon-hamper.webp"
                alt="Maroon and gold Mithai Wallah festive hamper open with sweets, jars and a gift tag"
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
            </div>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {hamperCategories.map((category) => (
                <div key={category.slug} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-6">
                  <h3 className="font-heading text-lg font-bold text-ink">{category.name}</h3>
                  <p className="mt-2 text-sm text-dark/65">{category.description}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="bg-ink py-20 text-white sm:py-28">
        <div className="container-site grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-white/20 bg-white/5 p-8">
            <div>
              <span className="font-subheading text-lg italic text-primary-light">For Businesses</span>
              <h3 className="mt-2 text-3xl font-bold">Corporate Gifting</h3>
              <p className="mt-3 text-blush/85">
                Gift boxes with custom branding in any quantity — for client gifting, employee rewards
                and festive corporate hampers.
              </p>
            </div>
            <ButtonLink href="/corporate-gifting" variant="secondary" className="self-start">
              Get Custom Quote
            </ButtonLink>
          </div>
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-white/20 bg-white/5 p-8">
            <div>
              <span className="font-subheading text-lg italic text-primary-light">For Celebrations</span>
              <h3 className="mt-2 text-3xl font-bold">Wedding Gifting</h3>
              <p className="mt-3 text-blush/85">
                Wedding hampers with bride &amp; groom name customisation, theme-matched packaging and
                return-gift boxes your guests will remember.
              </p>
            </div>
            <ButtonLink href="/wedding-gifting" variant="secondary" className="self-start">
              Design Your Wedding Box
            </ButtonLink>
          </div>
        </div>
      </section>

      {reviews.length > 0 ? (
        <section className="py-20 sm:py-28">
          <div className="container-site flex flex-col gap-12">
            <SectionHeading eyebrow="Reviews" title="What Our Customers Say" />
            <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
              {reviews.map((review) => (
                <figure key={review.name + review.quote} className="sticker-shadow-sm flex flex-col gap-4 rounded-2xl border-2 border-ink bg-white p-6">
                  <blockquote className="text-dark/80">&ldquo;{review.quote}&rdquo;</blockquote>
                  <figcaption className="font-heading text-sm font-bold text-ink">
                    {review.name}
                    <span className="font-normal text-dark/60"> · {review.area}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <section className="py-20 sm:py-28">
        <div className="container-site grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-ink bg-primary-light/30 p-8">
            <div>
              <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
                Coming soon · Register interest
              </span>
              <h2 className="mt-4 text-3xl font-bold text-ink">Farm Fresh Milk, Delivered</h2>
              <p className="mt-3 text-dark/75">
                Pure milk from local farmers in reusable glass bottles, delivered about 2 hours after
                collection — ₹100 per litre. No preservatives, no milk powder, no adulteration.
              </p>
              <p className="mt-3 text-sm font-semibold text-ink">
                Launching once 50 households in Prayagraj sign up.
              </p>
            </div>
            <ButtonLink href="/milk-subscription" variant="primary" className="self-start">
              Register Your Interest
            </ButtonLink>
          </div>
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-ink bg-[#fbeec4] p-8">
            <div>
              <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink">
                Launching soon · Join the waitlist
              </span>
              <h2 className="mt-4 text-3xl font-bold text-ink">{membership.name}</h2>
              <p className="mt-3 text-dark/75">
                ₹{membership.fee} a year for {membership.discountPercent}% off sweets and food, free delivery
                above ₹{membership.freeDeliveryThreshold}, priority support and early access to festive boxes.
              </p>
              <p className="mt-3 text-sm text-dark/60">{membership.exclusionNote}</p>
            </div>
            <ButtonLink href="/membership" variant="primary" className="self-start">
              See Member Benefits
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-blush py-20 sm:py-28">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="FAQs" title="Questions We Get Asked" />
          <div className="mx-auto w-full max-w-3xl">
            <FaqAccordion items={generalFaqs.slice(0, 4)} />
          </div>
          <div className="text-center">
            <ButtonLink href="/faq" variant="ghost">
              See All FAQs
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-lg">
            <span className="font-subheading text-lg italic text-primary-dark">Wholesale & Distribution</span>
            <h2 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
              Supplying Sweet Shops, Hotels &amp; Caterers
            </h2>
            <p className="mt-4 text-dark/70">
              Consistent, pure desi ghee mithai in bulk for sweet shops, distributors, hotels,
              restaurants and caterers — with dedicated wholesale pricing.
            </p>
          </div>
          <ButtonLink href="/wholesale" variant="primary">
            Wholesale Enquiry
          </ButtonLink>
        </div>
      </section>

      <CtaSection
        eyebrow={siteConfig.tagline}
        title="Taste the Difference Pure Desi Ghee Makes"
        description="Order online for delivery across Prayagraj, or talk to our team about gifting and wholesale."
        primaryCta={{ label: "Order Sweets", href: "#catalog" }}
        secondaryCta={{ label: "Fresh Milk Subscription", href: "/milk-subscription" }}
      />
    </>
  );
}
