import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { CtaSection } from "@/components/ui/cta-section";
import { ProductCard } from "@/components/ui/product-card";
import { dairyProducts, getDairyProduct } from "@/data/dairy-products";
import { siteConfig } from "@/lib/site";

export function generateStaticParams() {
  return dairyProducts.map((product) => ({ slug: product.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getDairyProduct(slug);
  if (!product) return {};
  return {
    title: `${product.name} — Coming Soon | ${product.keyword}`,
    description: `${product.shortDescription} ${siteConfig.comingSoonQuote}`,
    alternates: { canonical: `/dairy-products/${product.slug}` },
  };
}

export default async function DairyProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getDairyProduct(slug);
  if (!product) notFound();

  const related = dairyProducts.filter((p) => p.slug !== product.slug).slice(0, 3);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    brand: { "@type": "Brand", name: siteConfig.name },
    manufacturer: { "@type": "Organization", name: siteConfig.name },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      availability: "https://schema.org/PreOrder",
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
          { label: "Dairy Products", href: "/dairy-products" },
          { label: product.name },
        ]}
      />

      <section className="container-site py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="flex items-center gap-3">
              <div
                className="sticker-shadow flex h-24 w-24 items-center justify-center rounded-2xl border-2 border-ink text-5xl"
                style={{ backgroundColor: product.color }}
              >
                <span aria-hidden="true">{product.motif}</span>
              </div>
              <span className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-accent px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-white">
                Coming Soon
              </span>
            </div>
            <h1 className="mt-6 text-4xl font-bold text-ink sm:text-5xl">{product.name}</h1>
            <p className="mt-4 text-lg text-dark/70">{product.shortDescription}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/contact" variant="ghost">
                Ask a Question
              </ButtonLink>
              <ButtonLink href="/wholesale" variant="outline">
                Wholesale Pricing
              </ButtonLink>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="sticker-shadow rounded-2xl border-2 border-ink bg-blush p-6 text-center">
              <Image
                src="/logos/amodha.png"
                alt="Amodha"
                width={900}
                height={374}
                className="mx-auto h-10 w-auto"
              />
              <h2 className="font-heading mt-4 text-lg font-bold text-ink">{product.name} Is On Its Way</h2>
              <p className="font-subheading mt-3 text-lg italic text-primary-dark">
                &ldquo;{siteConfig.comingSoonQuote}&rdquo;
              </p>
              <ButtonLink href="/contact" variant="primary" className="mt-5">
                Get Notified at Launch
              </ButtonLink>
            </div>
            <div className="sticker-shadow rounded-2xl border-2 border-ink bg-white p-6">
              <h2 className="font-heading text-lg font-bold text-ink">Why Choose Our {product.name}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {product.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2 text-sm text-dark/70">
                    <span className="mt-0.5 text-primary-dark" aria-hidden="true">
                      ✓
                    </span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div
          className="sticker-shadow relative mt-14 flex min-h-[280px] flex-col items-center justify-center gap-4 overflow-hidden rounded-3xl border-[2.5px] border-ink px-6 py-16 text-center sm:min-h-[340px]"
          style={{ backgroundColor: product.color }}
        >
          <span aria-hidden="true" className="text-7xl sm:text-8xl">
            {product.motif}
          </span>
          <p className="font-heading text-2xl font-bold text-ink sm:text-3xl">{product.sceneCaption}</p>
        </div>

        <div className="mt-14 flex flex-col gap-4 text-dark/75">
          {product.description.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site">
          <h2 className="font-heading text-2xl font-bold text-ink sm:text-3xl">Explore More Dairy Products</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {related.map((item) => (
              <ProductCard
                key={item.slug}
                href={`/dairy-products/${item.slug}`}
                name={item.name}
                description={item.shortDescription}
                icon={item.motif}
                color={item.color}
                badge="Coming Soon"
              />
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={`Want ${product.name} for Your Business?`}
        description="Talk to our team now about wholesale and institutional supply timelines, or wait for the retail launch."
        primaryCta={{ label: "Contact Sales", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
