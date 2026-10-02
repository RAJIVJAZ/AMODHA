import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";
import { TrustBar } from "@/components/ui/trust-bar";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Us — Fresh Mithai Since 2023",
  description:
    "Mithaiwallah by Amodha started in Prayagraj in 2023. Milk from 100+ local farmers, 100% pure desi ghee, and every batch recorded live in our hygienic kitchen.",
  alternates: { canonical: "/about" },
};

const values = [
  {
    title: "Milk From 100+ Local Farmers",
    description:
      "We collect fresh milk directly from around 100 farmers in villages near Prayagraj — not anonymous bulk milk — so we know exactly where every batch begins.",
  },
  {
    title: "100% Pure Desi Ghee",
    description:
      "Our sweets are made with 100% pure desi ghee. No vanaspati, no blended fats, no shortcuts that cheapen the taste.",
  },
  {
    title: "Every Batch Recorded Live",
    description:
      "Each batch is cooked on camera, recorded live in our kitchen from start to finish. Nothing about how your mithai is made is hidden.",
  },
  {
    title: "Hygienic, Safe Packing",
    description:
      "Sweets are made in a clean, hygienic kitchen and packed in food-safe, sealed boxes so they reach you fresh and untouched.",
  },
];

export default function AboutPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          align="left"
          eyebrow={`Our Story · Est. ${siteConfig.founded}`}
          title="Honest Mithai, Made Fresh in Prayagraj"
          description={`Mithaiwallah by Amodha began in Prayagraj in ${siteConfig.founded} with one goal: traditional sweets made from milk and ghee you can actually trust.`}
        />
        <div className="mt-10 grid grid-cols-1 gap-6 text-dark/75 lg:grid-cols-2 lg:gap-10">
          <p>
            It started with a simple frustration: mithai from most shops had stopped tasting like the
            sweets we grew up with. Cheaper fats, bulk milk of unknown origin and rushed batches had
            made sweets more available — but the flavour that comes from fresh milk and real ghee had
            been lost along the way.
          </p>
          <p>
            So we started in {siteConfig.founded} by doing it the honest way. We collect fresh milk from
            around 100 local farmers near Prayagraj, cook every sweet in 100% pure desi ghee, and record
            every batch live in our hygienic kitchen. Then we pack it safely and deliver it fresh across
            Prayagraj. It takes more care — and that&rsquo;s the point.
          </p>
        </div>
      </section>

      <TrustBar />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="What We Stand For" title="Our Values" align="center" />
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <div key={value.title} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-blush p-6">
              <h3 className="text-xl font-bold text-ink">{value.title}</h3>
              <p className="mt-2 text-sm text-dark/70">{value.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site">
          <SectionHeading eyebrow="Why It Matters" title="What You Get in Every Box" align="center" />
          <div className="mx-auto mt-10 grid max-w-4xl grid-cols-1 gap-6 text-dark/75 lg:grid-cols-2">
            <p>
              Milk is the single biggest factor in how mithai tastes. Buying directly from local farmers
              means our milk reaches the kitchen fresh, the same day, and we know who produced it. That
              freshness carries straight through into the khoya, and from the khoya into every sweet.
            </p>
            <p>
              Ghee is the second. Plenty of sweets are cooked in vanaspati or blended fats because
              they&rsquo;re cheaper. We use only 100% pure desi ghee — and because every batch is
              recorded live, you don&rsquo;t have to take our word for it.
            </p>
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Come See For Yourself"
        title="Visit Our Facility or Talk to Our Team"
        description="We welcome wholesale partners, corporate clients and curious customers to see how our products are made."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Our Process", href: "/our-process" }}
      />
    </>
  );
}
