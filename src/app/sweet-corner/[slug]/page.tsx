import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { CtaSection } from "@/components/ui/cta-section";
import { sweets, getSweet } from "@/data/sweets";
import { siteConfig } from "@/lib/site";

export function generateStaticParams() {
  return sweets.map((sweet) => ({ slug: sweet.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const sweet = getSweet(slug);
  if (!sweet) return {};
  return {
    title: `${sweet.name} | ${sweet.keyword}`,
    description: sweet.shortDescription,
    alternates: { canonical: `/sweet-corner/${sweet.slug}` },
  };
}

export default async function SweetDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const sweet = getSweet(slug);
  if (!sweet) notFound();

  const related = sweets.filter((s) => s.slug !== sweet.slug).slice(0, 3);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: sweet.name,
    description: sweet.shortDescription,
    ...(sweet.image ? { image: `${siteConfig.url}${sweet.image}` } : {}),
    brand: { "@type": "Brand", name: siteConfig.sweetBrand },
    manufacturer: { "@type": "Organization", name: siteConfig.name },
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "INR",
      availability: "https://schema.org/InStock",
      seller: { "@type": "Organization", name: siteConfig.name },
    },
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(productJsonLd) }}
      />
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Sweet Corner", href: "/sweet-corner" },
          { label: sweet.name },
        ]}
      />

      <section className="container-site py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            {sweet.image ? (
              <div className="sticker-shadow relative aspect-square w-full max-w-md overflow-hidden rounded-3xl border-2 border-ink">
                <Image src={sweet.image} alt={sweet.name} fill sizes="(max-width: 1024px) 100vw, 50vw" className="object-cover" />
              </div>
            ) : (
              <div
                className="sticker-shadow flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-ink text-5xl"
                style={{ backgroundColor: sweet.color }}
              >
                🍬
              </div>
            )}
            <h1 className="mt-6 text-4xl font-bold text-ink sm:text-5xl">{sweet.name}</h1>
            <p className="mt-4 text-lg text-dark/70">{sweet.shortDescription}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/corporate-gifting" variant="primary">
                Order for Gifting
              </ButtonLink>
              <ButtonLink href="/wholesale" variant="ghost">
                Wholesale Enquiry
              </ButtonLink>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-6">
              <h2 className="font-heading text-lg font-bold text-ink">Available Pack Sizes</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {sweet.packSizes.map((size) => (
                  <li key={size} className="rounded-full border-2 border-ink/15 bg-blush px-3 py-1.5 text-sm font-medium text-ink">
                    {size}
                  </li>
                ))}
              </ul>
            </div>
            <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-6">
              <h2 className="font-heading text-lg font-bold text-ink">Best For</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {sweet.occasions.map((occasion) => (
                  <li key={occasion} className="flex items-start gap-2 text-sm text-dark/70">
                    <span className="mt-0.5 text-primary-dark" aria-hidden="true">
                      ✓
                    </span>
                    {occasion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 text-dark/75">
          {sweet.description.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site">
          <h2 className="font-heading text-2xl font-bold text-ink sm:text-3xl">More From Sweet Corner</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {related.map((item) => (
              <Link
                key={item.slug}
                href={`/sweet-corner/${item.slug}`}
                className="sticker-shadow-sm group flex flex-col rounded-2xl border-2 border-ink bg-white p-6 transition-all hover:-translate-y-1"
              >
                <h3 className="font-heading text-lg font-bold text-ink">{item.name}</h3>
                <p className="mt-2 text-sm text-dark/65">{item.shortDescription}</p>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={`Order ${sweet.name} in Bulk or as a Gift Box`}
        description="Custom packaging, branding and quantities available for corporate, wedding and wholesale orders."
        primaryCta={{ label: "Corporate Gifting", href: "/corporate-gifting" }}
        secondaryCta={{ label: "Wedding Gifting", href: "/wedding-gifting" }}
      />
    </>
  );
}
