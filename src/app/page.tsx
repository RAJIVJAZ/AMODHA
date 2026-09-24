import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { TrustBar } from "@/components/ui/trust-bar";
import { TestimonialCard } from "@/components/ui/testimonial-card";
import { CtaSection } from "@/components/ui/cta-section";
import { dairyProducts } from "@/data/dairy-products";
import { sweets, hamperCategories } from "@/data/sweets";
import { testimonials } from "@/data/testimonials";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: `${siteConfig.sweetBrand} | Premium Sweet Gifting Destination`,
  description:
    "Mithaiwallah Sweet Corner by Amodha — India's premium sweet gifting destination for retail, wholesale, corporate and wedding gifting. Milk cake, kalakand, barfi, peda, kunda and custom hampers. Amodha's dairy range is coming soon.",
  alternates: { canonical: "/" },
};

const processSteps = [
  { title: "Milk Collection", description: "Fresh milk collected daily from 1,000+ partner farmers near Prayagraj." },
  { title: "Quality Testing", description: "Every batch tested for fat, SNF and purity before it enters our facility." },
  { title: "Khoya Reduction", description: "Traditional slow-reduction methods, alongside modern hygienic processing." },
  { title: "Sweet Making", description: "Our halwais craft milk cake, kalakand, peda and more fresh in-house daily." },
  { title: "Packaging & Dispatch", description: "Hygienic packing and same-day dispatch to retail, wholesale and gifting orders." },
];

export default function HomePage() {
  return (
    <>
      <section className="relative overflow-hidden bg-blush py-24 sm:py-32">
        <div aria-hidden="true" className="pointer-events-none absolute -left-20 top-0 h-72 w-72 rounded-full bg-accent/30 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-20 bottom-0 h-80 w-80 rounded-full bg-primary-light/50 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <div className="sticker-shadow rounded-2xl border-[2.5px] border-ink bg-white p-3">
            <Image
              src="/logos/mithaiwallah.png"
              alt="Mithai Wallah"
              width={900}
              height={507}
              priority
              className="h-24 w-auto sm:h-28"
            />
          </div>
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            By Amodha — Made fresh in Prayagraj, Uttar Pradesh
          </span>
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
              Amodha began with a simple belief: that mithai tastes best when made the way it always has
              been — patiently, honestly, and from milk you can trust. Since {siteConfig.founded}, we&rsquo;ve
              built a network of over 1,000 partner farmers around Prayagraj, collecting fresh milk daily
              and processing it in our own facility rather than buying from anonymous suppliers.
            </p>
            <p className="text-dark/75">
              That same milk is the heart of Mithaiwallah Sweet Corner, where our halwais turn fresh khoya
              into milk cake, kalakand, peda and the Prayagraj specialty, Kunda, every single day. Amodha&rsquo;s
              own dairy range — bilona ghee, paneer, butter and more — is coming soon.
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
                  <Image
                    src="/logos/mithaiwallah.png"
                    alt="Mithai Wallah"
                    width={900}
                    height={507}
                    className="h-auto w-64 sm:w-80"
                  />
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

      <section id="catalog" className="bg-blush py-20 sm:py-28">
        <div className="container-site flex flex-col gap-12">
          <SectionHeading
            eyebrow="Our Sweets"
            title="Handcrafted Mithai, Made Fresh Daily"
            description="Each sweet is made in-house from fresh khoya, paneer and cream — the same quality we've supplied to sweet shops and families for years."
          />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
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
        </div>
      </section>

      <section className="py-20 sm:py-28">
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
                <div key={category.slug} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-blush p-6">
                  <h3 className="font-heading text-lg font-bold text-ink">{category.name}</h3>
                  <p className="mt-2 text-sm text-dark/65">{category.description}</p>
                </div>
              ))}
            </div>
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
              We supply consistent, high-quality mithai in bulk to sweet shop owners, distributors,
              dealers, hotels and restaurants — with dedicated wholesale pricing and reliable dispatch.
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

      <section className="relative overflow-hidden bg-ink py-20 text-white sm:py-28">
        <div aria-hidden="true" className="bg-diamond-pattern pointer-events-none absolute inset-0 opacity-10" />
        <div className="container-site relative grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="font-subheading text-lg italic text-primary-light">Coming Soon</span>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">Amodha Dairy Is On Its Way</h2>
            <p className="mt-4 max-w-xl text-blush/85">
              Bilona ghee, fresh paneer, farm milk, cream, curd and more — the same trusted milk behind
              Mithaiwallah Sweet Corner, coming soon direct to you.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-4 lg:justify-start">
              <ButtonLink href="/dairy-products" variant="secondary">
                Preview the Range
              </ButtonLink>
              <ButtonLink href="/contact" variant="outline">
                Get Notified
              </ButtonLink>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-6">
            <div className="sticker-shadow rounded-3xl border-[2.5px] border-white/20 bg-white/5 p-8 text-center">
              <p className="font-subheading text-2xl italic text-primary-light sm:text-3xl">
                &ldquo;{siteConfig.comingSoonQuote}&rdquo;
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-3">
              {dairyProducts.map((product) => (
                <span
                  key={product.slug}
                  className="sticker-shadow-sm flex h-14 w-14 items-center justify-center rounded-full border-2 border-white/20 bg-white/10 text-2xl grayscale sm:h-16 sm:w-16"
                  aria-label={product.name}
                >
                  <span aria-hidden="true">{product.motif}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Visit Us"
        title="Taste the Difference Traditional Craft Makes"
        description="Order online, visit our retail partners, or connect with our team for wholesale and gifting enquiries."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Amodha Dairy (Coming Soon)", href: "/dairy-products" }}
      />
    </>
  );
}
