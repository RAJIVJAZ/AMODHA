import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductCard } from "@/components/ui/product-card";
import { CtaSection } from "@/components/ui/cta-section";
import { dairyProducts } from "@/data/dairy-products";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Mithai Wallah Dairy — Coming Soon",
  description: `Mithai Wallah's farm-fresh dairy range is coming soon, starting with a pure milk subscription in Prayagraj. ${siteConfig.comingSoonQuote}`,
  alternates: { canonical: "/dairy-products" },
};

export default function DairyProductsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Dairy Products" }]} />

      <section className="relative overflow-hidden bg-blush py-14 sm:py-20">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary-light/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-site relative">
          <div className="mb-8 flex justify-center">
            <div className="sticker-shadow rounded-2xl border-[2.5px] border-ink bg-white p-3">
              <Image
                src="/logos/mithaiwallah.png"
                alt="Mithai Wallah"
                width={900}
                height={507}
                priority
                className="h-16 w-auto sm:h-20"
              />
            </div>
          </div>
          <SectionHeading
            eyebrow="Mithai Wallah Dairy — Coming Soon"
            title="Farm-Fresh Dairy, On Its Way to You"
            description="Every product below will start with milk collected fresh from around 100 local farmers near Prayagraj — the same milk behind our sweets. We're putting the finishing touches on bringing it to you directly."
          />
          <div className="sticker-shadow mx-auto mt-10 max-w-2xl rounded-2xl border-2 border-ink bg-white px-6 py-8 text-center sm:px-10">
            <p className="font-subheading text-xl italic text-primary-dark sm:text-2xl">
              &ldquo;{siteConfig.comingSoonQuote}&rdquo;
            </p>
          </div>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <div className="mt-2 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {dairyProducts.map((product) => (
            <ProductCard
              key={product.slug}
              href={`/dairy-products/${product.slug}`}
              name={product.name}
              description={product.shortDescription}
              icon={product.motif}
              color={product.color}
              badge="Coming Soon"
            />
          ))}
        </div>
      </section>

      <CtaSection
        eyebrow="Starting With Milk"
        title="Want Pure Milk Delivered to Your Door?"
        description="Our farm-fresh milk subscription launches once 50 households sign up. Register your interest — it takes a minute."
        primaryCta={{ label: "Register Interest", href: "/milk-subscription" }}
        secondaryCta={{ label: "Browse Our Sweets", href: "/#catalog" }}
      />
    </>
  );
}
