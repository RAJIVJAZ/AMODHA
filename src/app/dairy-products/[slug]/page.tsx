import type { Metadata } from "next";
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
    title: `${product.name} Manufacturer | ${product.keyword}`,
    description: product.shortDescription,
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
          { label: "Dairy Products", href: "/dairy-products" },
          { label: product.name },
        ]}
      />

      <section className="container-site py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-12 lg:grid-cols-2 lg:items-start">
          <div>
            <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-cream text-5xl ring-1 ring-gold/30">
              <span aria-hidden="true">{product.motif}</span>
            </div>
            <h1 className="mt-6 text-4xl font-bold text-brown sm:text-5xl">{product.name}</h1>
            <p className="mt-4 text-lg text-dark/70">{product.shortDescription}</p>
            <div className="mt-8 flex flex-wrap gap-3">
              <ButtonLink href="/contact" variant="primary">
                Enquire Now
              </ButtonLink>
              <ButtonLink href="/wholesale" variant="ghost">
                Wholesale Pricing
              </ButtonLink>
            </div>
          </div>

          <div className="flex flex-col gap-6">
            <div className="rounded-2xl border border-gold/20 bg-white p-6">
              <h2 className="text-lg font-bold text-brown">Available Pack Sizes</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {product.packSizes.map((size) => (
                  <li
                    key={size}
                    className="rounded-full bg-cream px-3 py-1.5 text-sm font-medium text-brown"
                  >
                    {size}
                  </li>
                ))}
              </ul>
            </div>
            <div className="rounded-2xl border border-gold/20 bg-white p-6">
              <h2 className="text-lg font-bold text-brown">Why Choose Our {product.name}</h2>
              <ul className="mt-3 flex flex-col gap-2">
                {product.highlights.map((highlight) => (
                  <li key={highlight} className="flex items-start gap-2 text-sm text-dark/70">
                    <span className="mt-0.5 text-gold-dark" aria-hidden="true">
                      ✓
                    </span>
                    {highlight}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-4 text-dark/75">
          {product.description.map((paragraph, index) => (
            <p key={index}>{paragraph}</p>
          ))}
        </div>
      </section>

      <section className="bg-cream py-14 sm:py-20">
        <div className="container-site">
          <h2 className="text-2xl font-bold text-brown sm:text-3xl">Explore More Dairy Products</h2>
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3">
            {related.map((item) => (
              <ProductCard
                key={item.slug}
                href={`/dairy-products/${item.slug}`}
                name={item.name}
                description={item.shortDescription}
                icon={item.motif}
              />
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={`Order ${product.name} for Your Business`}
        description="Retail, wholesale and institutional supply available with consistent quality and reliable dispatch."
        primaryCta={{ label: "Contact Sales", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
