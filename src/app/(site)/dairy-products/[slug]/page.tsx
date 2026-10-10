import type { Metadata } from "next";
import Image from "next/image";
import { notFound } from "next/navigation";
import Link from "next/link";
import { AddToCart } from "@/components/ui/add-to-cart";
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
    title: product.inShop ? `${product.name} — Order Online | ${product.keyword}` : `${product.name} — Coming Soon | ${product.keyword}`,
    description: product.inShop
      ? `${product.shortDescription} Order online for delivery in Prayagraj, or subscribe for daily delivery.`
      : `${product.shortDescription} ${siteConfig.comingSoonQuote}`,
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
  const shopPacks = product.inShop ? product.packSizes.filter((size) => size.purchasable) : [];
  const bulkPacks = product.packSizes.filter((size) => !size.purchasable);

  const productJsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.shortDescription,
    brand: { "@type": "Brand", name: siteConfig.name },
    manufacturer: { "@type": "Organization", name: siteConfig.legalName },
    offers: {
      "@type": "Offer",
      priceCurrency: "INR",
      ...(shopPacks.length ? { price: shopPacks[0].price } : {}),
      availability: shopPacks.length ? "https://schema.org/InStock" : "https://schema.org/PreOrder",
      seller: { "@type": "Organization", name: siteConfig.legalName },
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
              <span
                className={`font-heading sticker-shadow-sm rounded-full border-2 border-ink px-3 py-1.5 text-xs font-bold uppercase tracking-wide ${shopPacks.length ? "bg-primary-light text-ink" : "bg-accent text-white"}`}
              >
                {shopPacks.length ? "Order now" : "Coming Soon"}
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
            {shopPacks.length ? (
              <>
                <AddToCart
                  slug={product.slug}
                  productName={product.name}
                  packSizes={shopPacks}
                  icon={product.motif}
                  extraNote={
                    <>
                      🗓️ Want it every day?{" "}
                      <Link href="/milk-subscription" className="font-semibold text-primary-dark underline">
                        Subscribe for daily delivery
                      </Link>
                    </>
                  }
                />
                <div className="sticker-shadow rounded-2xl border-2 border-ink bg-blush p-6">
                  <h2 className="font-heading text-lg font-bold text-ink">Daily delivery, your way</h2>
                  <p className="mt-2 text-sm text-dark/70">
                    Subscribe and we bring fresh milk every morning or evening. Skip a day, add extra or pause while you travel — and get Milk
                    Subscriber Benefits on our sweets.
                  </p>
                  <ButtonLink href="/milk-subscription" variant="primary" className="mt-4">
                    Milk Subscription
                  </ButtonLink>
                  {bulkPacks.length ? (
                    <p className="mt-4 text-xs text-dark/60">
                      Need {bulkPacks.map((size) => size.label).join(" or ")}?{" "}
                      <Link href="/wholesale" className="font-semibold text-primary-dark underline">
                        Ask for bulk supply
                      </Link>
                    </p>
                  ) : null}
                </div>
              </>
            ) : (
              <div className="sticker-shadow rounded-2xl border-2 border-ink bg-blush p-6 text-center">
                <Image
                  src="/logos/mithaiwallah.png"
                  alt="Mithai Wallah"
                  width={900}
                  height={507}
                  className="mx-auto h-12 w-auto"
                />
                <h2 className="font-heading mt-4 text-lg font-bold text-ink">{product.name} Is On Its Way</h2>
                <p className="font-subheading mt-3 text-lg italic text-primary-dark">
                  &ldquo;{siteConfig.comingSoonQuote}&rdquo;
                </p>
                <ButtonLink href="/milk-subscription" variant="primary" className="mt-5">
                  Register Interest
                </ButtonLink>
              </div>
            )}
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
                badge={item.inShop ? "Order now" : "Coming Soon"}
              />
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        title={`Want ${product.name} for Your Business?`}
        description={
          product.inShop
            ? "Talk to our team about wholesale and institutional supply for hotels, sweet shops and kitchens."
            : "Talk to our team now about wholesale and institutional supply timelines, or wait for the retail launch."
        }
        primaryCta={{ label: "Contact Sales", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
