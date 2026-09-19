import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";
import { sweets, hamperCategories } from "@/data/sweets";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `${siteConfig.sweetBrand} | Premium Sweet Gifting Destination`,
  description:
    "Mithaiwallah Sweet Corner by Amodha — India's premium sweet gifting destination for retail, wholesale, corporate and wedding gifting. Milk cake, kalakand, barfi, peda, kunda and custom hampers.",
  alternates: { canonical: "/sweet-corner" },
};

export default function SweetCornerPage() {
  return (
    <>
      <section className="relative overflow-hidden bg-blush py-24 sm:py-32">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary-light/50 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <div className="sticker-shadow rounded-2xl border-[2.5px] border-ink bg-white p-3">
            <Image
              src="/logos/mithaiwallah.png"
              alt="Mithaiwallah Sweet Corner"
              width={582}
              height={318}
              priority
              className="h-24 w-auto sm:h-28"
            />
          </div>
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            India&rsquo;s Premium Sweet Gifting Destination
          </h1>
          <p className="text-balance max-w-2xl text-lg text-ink/70 sm:text-xl">
            Wholesale, retail, corporate and wedding gifting solutions — handcrafted sweets made fresh in
            Prayagraj.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="#catalog" variant="primary">
              Browse Catalog
            </ButtonLink>
            <ButtonLink href="/corporate-gifting" variant="outline">
              Corporate Gifting
            </ButtonLink>
            <ButtonLink href="/wedding-gifting" variant="outline">
              Wedding Gifting
            </ButtonLink>
          </div>
          <div className="sticker-shadow mt-4 w-full max-w-xl overflow-hidden rounded-3xl border-[2.5px] border-ink">
            <Image
              src="/images/sweet-corner/assorted-gift-box.webp"
              alt="Mithaiwallah premium sweet box assortment with Milk Cake, Kalakand, Chocolate Barfi, Doda Barfi and Peda"
              width={1370}
              height={1148}
              priority
              className="h-auto w-full object-cover"
            />
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
              className="sticker-shadow group flex flex-col justify-between overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white transition-all duration-150 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-ink)]"
            >
              {sweet.image ? (
                <div className="relative aspect-[4/3] w-full border-b-2 border-ink">
                  <Image
                    src={sweet.image}
                    alt={sweet.name}
                    fill
                    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                    className="object-cover"
                  />
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
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site">
          <SectionHeading eyebrow="Gift Boxes" title="Hampers & Custom Boxes" align="center" />
          <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-center">
            <div className="sticker-shadow relative mx-auto aspect-[4/5] w-full max-w-sm overflow-hidden rounded-3xl border-2 border-ink">
              <Image
                src="/images/sweet-corner/packaging-maroon-hamper.webp"
                alt="Maroon and gold Mithaiwallah festive hamper open with sweets, jars and a gift tag"
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
