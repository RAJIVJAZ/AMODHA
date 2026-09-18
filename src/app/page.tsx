import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { TrustBar } from "@/components/ui/trust-bar";
import { ProductCard } from "@/components/ui/product-card";
import { TestimonialCard } from "@/components/ui/testimonial-card";
import { CtaSection } from "@/components/ui/cta-section";
import { Logo } from "@/components/ui/logo";
import { dairyProducts } from "@/data/dairy-products";
import { sweets } from "@/data/sweets";
import { testimonials } from "@/data/testimonials";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Premium Dairy & Traditional Sweets Manufacturer in Prayagraj",
  description: siteConfig.description,
  alternates: { canonical: "/" },
};

const processSteps = [
  { title: "Milk Collection", description: "Fresh milk collected daily from 1,000+ partner farmers near Prayagraj." },
  { title: "Quality Testing", description: "Every batch tested for fat, SNF and purity before it enters our facility." },
  { title: "Bilona & Production", description: "Traditional hand-churned methods for ghee, alongside modern hygienic processing." },
  { title: "Sweet Making", description: "Our halwais craft milk cake, kalakand, peda and more fresh in-house daily." },
  { title: "Packaging & Dispatch", description: "Hygienic packing and same-day dispatch to retail, wholesale and gifting orders." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative isolate overflow-hidden bg-blush">
        <div aria-hidden="true" className="pointer-events-none absolute -left-24 -top-24 h-80 w-80 rounded-full bg-primary-light/60 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-16 top-10 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute bottom-0 left-1/3 h-64 w-64 rounded-full bg-primary/25 blur-3xl" />

        <div className="container-site relative flex flex-col items-center gap-8 py-20 text-center sm:py-28">
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            Made fresh in Prayagraj, Uttar Pradesh
          </span>
          <h1 className="text-balance max-w-4xl text-5xl font-bold leading-[1.05] text-ink sm:text-6xl md:text-7xl">
            Pure Dairy.
            <br />
            <span className="text-primary-dark">Traditional Sweets.</span>
          </h1>
          <p className="text-balance max-w-xl text-lg text-ink/70 sm:text-xl">
            Bilona-churned ghee and handcrafted mithai, made the slow way — one product, one bold flavour
            at a time.
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
            <ButtonLink href="/dairy-products" variant="primary">
              Shop Dairy
            </ButtonLink>
            <ButtonLink href="/sweet-corner" variant="secondary">
              Explore Sweet Corner
            </ButtonLink>
          </div>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3 pr-16 sm:gap-4 sm:pr-0">
            {dairyProducts.map((product) => (
              <Link
                key={product.slug}
                href={`/dairy-products/${product.slug}`}
                className="sticker-shadow-sm flex h-16 w-16 items-center justify-center rounded-full border-2 border-ink text-2xl transition-transform hover:-translate-y-1 sm:h-20 sm:w-20 sm:text-3xl"
                style={{ backgroundColor: product.color }}
                aria-label={product.name}
              >
                <span aria-hidden="true">{product.motif}</span>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <TrustBar />

      <section className="py-20 sm:py-28">
        <div className="container-site grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="order-2 flex flex-col gap-5 lg:order-1">
            <SectionHeading
              align="left"
              eyebrow="Our Story"
              title="A Legacy Built on Milk, Trust and Tradition"
            />
            <p className="text-dark/75">
              Amodha began with a simple belief: that dairy products and mithai taste best when made the
              way they always have been — patiently, honestly, and from milk you can trust. Since{" "}
              {siteConfig.founded}, we&rsquo;ve built a network of over 1,000 partner farmers around Prayagraj,
              collecting fresh milk daily and processing it in our own facility rather than buying from
              anonymous suppliers.
            </p>
            <p className="text-dark/75">
              That same milk feeds two crafts under one roof — our dairy range, led by hand-churned bilona
              ghee, and Mithaiwallah Sweet Corner, where our halwais turn fresh khoya into milk cake,
              kalakand, peda and the Prayagraj specialty, Kunda, every single day.
            </p>
            <div>
              <ButtonLink href="/about" variant="ghost">
                Read Our Full Story
              </ButtonLink>
            </div>
          </div>
          <div className="order-1 lg:order-2">
            <div className="sticker-shadow relative aspect-[4/5] w-full overflow-hidden rounded-3xl border-[2.5px] border-ink bg-gradient-to-br from-primary-light/50 via-blush to-accent/20">
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="rotate-[-6deg] opacity-40">
                  <Logo size="lg" tagline={`Since ${siteConfig.founded}`} />
                </div>
              </div>
              <div className="sticker-shadow-sm absolute bottom-5 left-5 right-5 rounded-2xl border-2 border-ink bg-white p-4">
                <p className="font-subheading text-lg italic text-ink">
                  &ldquo;Same milk. Same family. Since {siteConfig.founded}.&rdquo;
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="bg-blush py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Shop Dairy"
            title="Farm-Fresh Dairy, Made the Traditional Way"
            description="From hand-churned bilona ghee to fresh paneer cut daily — every product starts with milk from our own farmer network."
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
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
          <div className="text-center">
            <ButtonLink href="/dairy-products" variant="ghost">
              View All Dairy Products
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Mithaiwallah Sweet Corner"
            title="Handcrafted Mithai, Made Fresh Daily"
            description="Traditional recipes, premium ingredients, and the same khoya we make for our own dairy range."
          />
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            {sweets.map((sweet) => (
              <Link
                key={sweet.slug}
                href={`/sweet-corner/${sweet.slug}`}
                className="sticker-shadow-sm group flex flex-col items-center gap-3 rounded-2xl border-2 border-ink p-5 text-center transition-all hover:-translate-y-1"
                style={{ backgroundColor: sweet.color }}
              >
                <div className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-ink bg-white text-2xl">
                  🍬
                </div>
                <span className="font-heading text-sm font-bold text-ink">{sweet.name}</span>
              </Link>
            ))}
          </div>
          <div className="text-center">
            <ButtonLink href="/sweet-corner" variant="primary">
              Explore Sweet Corner
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-ink py-20 text-white sm:py-28">
        <div className="container-site grid grid-cols-1 gap-8 lg:grid-cols-2">
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-white/20 bg-white/5 p-8">
            <div>
              <span className="font-subheading text-lg italic text-primary-light">For Businesses</span>
              <h3 className="mt-2 text-3xl font-bold">Corporate Gifting</h3>
              <p className="mt-3 text-blush/85">
                Luxury gift boxes with custom branding, bulk order capacity and Pan-India delivery — for
                client gifting, employee rewards and festive corporate hampers.
              </p>
            </div>
            <ButtonLink href="/corporate-gifting" variant="secondary" className="self-start">
              Get Custom Quote
            </ButtonLink>
          </div>
          <div className="sticker-shadow flex flex-col justify-between gap-6 rounded-3xl border-[2.5px] border-white/20 bg-white/5 p-8">
            <div>
              <span className="font-subheading text-lg italic text-primary-light">For Celebrations</span>
              <h3 className="mt-2 text-3xl font-bold">Wedding Gifting</h3>
              <p className="mt-3 text-blush/85">
                Premium wedding hampers with bride & groom name customisation, theme-matched packaging
                and return-gift solutions your guests will remember.
              </p>
            </div>
            <ButtonLink href="/wedding-gifting" variant="secondary" className="self-start">
              Design Your Wedding Box
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Our Process"
            title="From Farm to Factory to Your Table"
            description="Complete transparency across every stage of production — the way it should be."
          />
          <ol className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {processSteps.map((step, index) => (
              <li key={step.title} className="sticker-shadow-sm flex flex-col gap-3 rounded-2xl border-2 border-ink bg-blush p-6">
                <span className="font-heading text-3xl font-bold text-primary-dark">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <span className="font-heading font-bold text-ink">{step.title}</span>
                <span className="text-sm text-dark/65">{step.description}</span>
              </li>
            ))}
          </ol>
          <div className="text-center">
            <ButtonLink href="/our-process" variant="ghost">
              Take the Full Factory Tour
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="bg-blush py-20 sm:py-28">
        <div className="container-site flex flex-col gap-10 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-lg">
            <span className="font-subheading text-lg italic text-primary-dark">Wholesale & Distribution</span>
            <h2 className="mt-2 text-3xl font-bold text-ink sm:text-4xl">
              Supplying Sweet Shops, Hotels & Distributors Across UP
            </h2>
            <p className="mt-4 text-dark/70">
              We supply consistent, high-quality dairy and mithai in bulk to sweet shop owners,
              distributors, dealers, hotels and restaurants — with dedicated wholesale pricing and
              reliable dispatch.
            </p>
          </div>
          <ButtonLink href="/wholesale" variant="primary">
            Become a Distributor
          </ButtonLink>
        </div>
      </section>

      <section className="py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Testimonials"
            title="What Our Customers & Partners Say"
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {testimonials.map((testimonial) => (
              <TestimonialCard key={testimonial.name} {...testimonial} />
            ))}
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Visit Us"
        title="Taste the Difference Traditional Craft Makes"
        description="Order online, visit our retail partners, or connect with our team for wholesale and gifting enquiries."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Explore Sweet Corner", href: "/sweet-corner" }}
      />
    </>
  );
}
