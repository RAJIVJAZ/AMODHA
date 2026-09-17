import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";
import { TrustBar } from "@/components/ui/trust-bar";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "About Us",
  description:
    "Learn the story of Amodha Dairy Products and Mithaiwallah Sweet Corner — a family dairy and sweets manufacturer in Prayagraj built on farmer partnerships, bilona heritage and quality.",
  alternates: { canonical: "/about" },
};

const values = [
  {
    title: "Traditional Methods",
    description:
      "From hand-churned bilona ghee to hand-shaped peda, we still use the slow, traditional techniques that shortcuts skip — because they produce better taste and texture.",
  },
  {
    title: "Farmer Partnerships",
    description:
      "Over 1,000 farmers across villages near Prayagraj supply our fresh milk daily, giving us traceability from source to shelf and giving them a fair, reliable buyer.",
  },
  {
    title: "Uncompromising Quality",
    description:
      "Every batch of milk is tested for fat, SNF and purity before it enters production. Our facility follows FSSAI-certified hygiene and quality-control standards.",
  },
  {
    title: "Two Crafts, One Roof",
    description:
      "Our dairy division and Mithaiwallah Sweet Corner share the same milk, the same khoya kitchen, and the same standards — so every product carries the same trust.",
  },
];

const milestones = [
  { year: siteConfig.founded, event: "Amodha begins milk collection and dairy processing in Prayagraj." },
  { year: "2006", event: "Launch of Mithaiwallah Sweet Corner, bringing traditional mithai-making in-house." },
  { year: "2014", event: "Farmer network crosses 500 partners; facility upgraded for higher daily capacity." },
  { year: "2020", event: "FSSAI-certified modern facility expansion, adding cold-chain retail distribution." },
  { year: "Today", event: "1,000+ farmer partners, 100+ retail partners, and Pan-India gifting & wholesale dispatch." },
];

export default function AboutPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "About" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          align="left"
          eyebrow="Our Story"
          title="Built on Milk, Trust and Tradition"
          description={`Amodha Dairy Products and Mithaiwallah Sweet Corner operate from a single facility in Prayagraj, Uttar Pradesh, manufacturing dairy products and traditional sweets using methods that have barely changed in generations.`}
        />
        <div className="mt-10 grid grid-cols-1 gap-6 text-dark/75 lg:grid-cols-2 lg:gap-10">
          <p>
            It started with a simple frustration: dairy sold in most shops had stopped tasting like the
            milk, ghee and paneer our founders grew up with. Mass processing had made products cheaper
            and more available, but something had been lost along the way — the depth of flavour that
            comes from patient, traditional methods and honestly sourced milk.
          </p>
          <p>
            Since {siteConfig.founded}, we&rsquo;ve built our business the slower way. We work directly
            with farmers in villages around Prayagraj rather than buying anonymous bulk milk, we
            hand-churn our ghee using the bilona method instead of separating cream directly, and our
            halwais still shape peda and knead khoya by hand. It takes longer and costs more — but
            it&rsquo;s why customers who&rsquo;ve tried both keep coming back to Amodha.
          </p>
        </div>
      </section>

      <TrustBar />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="What We Stand For" title="Our Values" align="center" />
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2">
          {values.map((value) => (
            <div key={value.title} className="rounded-2xl border border-gold/20 bg-cream p-6">
              <h3 className="text-xl font-bold text-brown">{value.title}</h3>
              <p className="mt-2 text-sm text-dark/70">{value.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-cream py-14 sm:py-20">
        <div className="container-site">
          <SectionHeading eyebrow="Our Journey" title="Milestones" align="center" />
          <ol className="mx-auto mt-10 flex max-w-3xl flex-col gap-6 border-l-2 border-gold/40 pl-6">
            {milestones.map((milestone) => (
              <li key={milestone.year} className="relative">
                <span className="absolute -left-[1.95rem] top-1 h-3 w-3 rounded-full bg-gold" aria-hidden="true" />
                <span className="font-heading text-lg font-bold text-gold-dark">{milestone.year}</span>
                <p className="mt-1 text-dark/75">{milestone.event}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Bilona Heritage" title="Why We Still Do It the Slow Way" align="left" />
        <div className="mt-8 grid grid-cols-1 gap-6 text-dark/75 lg:grid-cols-2">
          <p>
            The bilona method — culturing milk into curd, hand-churning it into butter, then slow-cooking
            that butter into ghee — takes far longer than modern cream-separation methods, and yields
            less ghee per litre of milk. Most manufacturers moved away from it decades ago for exactly
            those reasons.
          </p>
          <p>
            We kept it because the results are worth it: a grainier texture, a deeper aroma, and a
            flavour that store-bought ghee simply doesn&rsquo;t have. It&rsquo;s the same philosophy behind everything
            we make, from our khoya-based sweets to our fresh paneer — modern hygiene and food safety
            standards, applied to genuinely traditional recipes and processes.
          </p>
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
