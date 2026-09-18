import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";
import { sweets, hamperCategories } from "@/data/sweets";
import { siteConfig } from "@/lib/site";
import { BrandBadge } from "@/components/ui/brand-badge";

export const metadata: Metadata = {
  title: `${siteConfig.sweetBrand} | Premium Sweet Gifting Destination`,
  description:
    "Mithaiwallah Sweet Corner by Amodha — India's premium sweet gifting destination for retail, wholesale, corporate and wedding gifting. Milk cake, kalakand, barfi, peda, kunda and custom hampers.",
  alternates: { canonical: "/sweet-corner" },
};

export default function SweetCornerPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-brown py-24 text-white sm:py-32">
        <div
          aria-hidden="true"
          className="absolute inset-0 bg-[radial-gradient(circle_at_15%_25%,rgba(212,160,23,0.35),transparent_45%),radial-gradient(circle_at_85%_80%,rgba(198,40,40,0.3),transparent_45%)]"
        />
        <div aria-hidden="true" className="bg-diamond-pattern absolute inset-0 opacity-[0.08]" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <BrandBadge title="Mithaiwallah" subtitle="Sweet Corner" tone="cream" width={240} height={100} />
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            India&rsquo;s Premium Sweet Gifting Destination
          </h1>
          <p className="text-balance max-w-2xl text-lg text-cream/90 sm:text-xl">
            Wholesale, retail, corporate and wedding gifting solutions — handcrafted sweets made fresh in
            Prayagraj.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="#catalog" variant="secondary">
              Browse Catalog
            </ButtonLink>
            <ButtonLink href="/corporate-gifting" variant="outline">
              Corporate Gifting
            </ButtonLink>
            <ButtonLink href="/wedding-gifting" variant="outline">
              Wedding Gifting
            </ButtonLink>
          </div>
        </div>
      </section>

      <section id="catalog" className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Our Sweets"
          title="Handcrafted Mithai, Made Fresh Daily"
          description="Each sweet is made in-house from fresh khoya, paneer and cream — the same quality we've supplied to sweet shops and families for years."
        />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {sweets.map((sweet) => (
            <Link
              key={sweet.slug}
              href={`/sweet-corner/${sweet.slug}`}
              className="group flex flex-col justify-between rounded-2xl border border-gold/25 bg-white p-6 shadow-sm transition-all hover:-translate-y-1 hover:border-gold hover:shadow-lg hover:shadow-gold/10"
            >
              <div>
                <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream text-2xl ring-1 ring-gold/30">
                  🍬
                </div>
                <h3 className="text-xl font-bold text-brown">{sweet.name}</h3>
                <p className="mt-2 text-sm text-dark/70">{sweet.shortDescription}</p>
              </div>
              <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-accent-red">
                View Details
                <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
                  →
                </span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="bg-cream py-14 sm:py-20">
        <div className="container-site">
          <SectionHeading eyebrow="Gift Boxes" title="Hampers & Custom Boxes" align="center" />
          <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {hamperCategories.map((category) => (
              <div key={category.slug} className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gold/15">
                <h3 className="text-lg font-bold text-brown">{category.name}</h3>
                <p className="mt-2 text-sm text-dark/65">{category.description}</p>
              </div>
            ))}
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <ButtonLink href="/corporate-gifting" variant="primary">
              Corporate Hampers
            </ButtonLink>
            <ButtonLink href="/wedding-gifting" variant="ghost">
              Wedding Hampers
            </ButtonLink>
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Wholesale to Sweet Shops"
        title="Supplying Mithai to Shops & Distributors Across UP"
        description="Bikaneri Cake, Milk Cake and Kunda travel exceptionally well — a favourite for our wholesale partners."
        primaryCta={{ label: "Become a Distributor", href: "/wholesale" }}
        secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      />
    </>
  );
}
