import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { ProductCard } from "@/components/ui/product-card";
import { CtaSection } from "@/components/ui/cta-section";
import { dairyProducts } from "@/data/dairy-products";

export const metadata: Metadata = {
  title: "Dairy Products Manufacturer in Prayagraj",
  description:
    "Explore Amodha's full range of farm-fresh dairy products — bilona ghee, paneer, butter, milk, cream, curd and khoya — manufactured in Prayagraj, Uttar Pradesh.",
  alternates: { canonical: "/dairy-products" },
};

export default function DairyProductsPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Dairy Products" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Dairy Range"
          title="Farm-Fresh Dairy Products, Made the Traditional Way"
          description="Every product below starts with milk collected fresh from our own network of 1,000+ partner farmers near Prayagraj, processed in our FSSAI-certified facility."
        />
        <div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {dairyProducts.map((product) => (
            <ProductCard
              key={product.slug}
              href={`/dairy-products/${product.slug}`}
              name={product.name}
              description={product.shortDescription}
              icon={product.motif}
              color={product.color}
            />
          ))}
        </div>
      </section>

      <CtaSection
        eyebrow="Bulk & Institutional Supply"
        title="Need Dairy Products in Bulk?"
        description="We supply hotels, restaurants, sweet shops and institutional kitchens with consistent, high-quality dairy at wholesale pricing."
        primaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
        secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      />
    </>
  );
}
