import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { CtaSection } from "@/components/ui/cta-section";
import { ProductCard } from "@/components/ui/product-card";
import { getSweet } from "@/data/sweets";

export const metadata: Metadata = {
  title: "Corporate Sweet Gift Boxes | Custom Branding & Bulk Orders",
  description:
    "Custom-branded mithai boxes from Mithai Wallah, Prayagraj — made with 100% pure desi ghee in traceable batches. Bulk orders for client gifting, employee rewards and festive gifting.",
  alternates: { canonical: "/corporate-gifting" },
};

const industries = [
  "Banks & NBFCs",
  "Real Estate",
  "Hotels & Hospitality",
  "Manufacturing",
  "IT & Technology",
  "Government Organizations",
  "Schools & Universities",
  "Healthcare",
];

const packagingOptions = [
  "Mono Carton",
  "Premium Carton",
  "Rigid Box",
  "Magnetic Box",
  "Luxury Box",
  "Wooden Box",
];

const customisations = ["Logo Printing", "Gold Foiling", "Embossing", "UV Printing", "Ribbon Finishing", "Custom Insert Cards", "QR Code (digital message)", "Personalised Gift Note"];

const processSteps = [
  { title: "Share Your Brief", description: "Tell us your quantity, budget range and occasion." },
  { title: "Sample & Box Design", description: "We share sweet combinations and packaging options with pricing." },
  { title: "Approve & Confirm", description: "Approve final design, branding and delivery timeline." },
  { title: "Production & Delivery", description: "We make every box fresh, pack it safely and deliver on schedule." },
];

export default function CorporateGiftingPage() {
  const dryFruitBox = getSweet("premium-dry-fruit-box");

  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Gifting" }]} />

      <section className="relative overflow-hidden bg-blush py-20 sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary-light/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-site relative grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <span className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-primary-light px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
              For Businesses
            </span>
            <h1 className="text-balance max-w-3xl text-4xl font-bold text-ink sm:text-5xl">
              Corporate Gifting That Reflects Your Brand
            </h1>
            <p className="max-w-2xl text-balance text-lg text-ink/70">
              Gift boxes with custom branding and bulk order capacity — for client gifting, employee
              rewards and festive corporate gifting programs. Made with 100% pure desi ghee.
            </p>
          </div>
          <div className="sticker-shadow relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-[2.5px] border-ink">
            <Image
              src="/images/sweet-corner/corporate-gift-hamper.webp"
              alt="Mithai Wallah premium corporate gift hamper with ribbon bow, gift tag and an assortment box of sweets"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      {dryFruitBox ? (
        <section className="container-site py-14 sm:py-20">
          <SectionHeading
            eyebrow="New for Corporate Gifting"
            title="Premium Dry Fruit Box"
            description="Add a curated dry fruit box alongside your mithai hampers — a premium standalone gift or a mixed sweet-and-dry-fruit combo, in any quantity."
          />
          <div className="mt-8 max-w-sm">
            <ProductCard
              href={`/sweet-corner/${dryFruitBox.slug}`}
              name={dryFruitBox.name}
              description={dryFruitBox.shortDescription}
              icon="🌰"
              color={dryFruitBox.color}
              image={dryFruitBox.image}
              badge="New"
              cta="View Details"
            />
          </div>
        </section>
      ) : null}

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Who We Serve" title="Industries We Work With" />
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {industries.map((industry) => (
            <div
              key={industry}
              className="sticker-shadow-sm rounded-xl border-2 border-ink bg-blush px-4 py-5 text-center text-sm font-semibold text-ink"
            >
              {industry}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Packaging" title="Packaging Options" />
            <div className="sticker-shadow-sm relative mt-6 aspect-[4/3] w-full overflow-hidden rounded-2xl border-2 border-ink">
              <Image
                src="/images/sweet-corner/packaging-ivory-gold.webp"
                alt="Ivory Mithai Wallah gift box with gold foil branding and a champagne satin ribbon bow"
                fill
                sizes="(max-width: 1024px) 100vw, 50vw"
                className="object-cover"
              />
            </div>
            <div className="mt-6 flex flex-wrap gap-2">
              {packagingOptions.map((option) => (
                <span key={option} className="rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-medium text-ink">
                  {option}
                </span>
              ))}
            </div>
          </div>
          <div>
            <SectionHeading align="left" eyebrow="Personalisation" title="Customisation Options" />
            <div className="mt-6 flex flex-wrap gap-2">
              {customisations.map((option) => (
                <span key={option} className="rounded-full border-2 border-ink bg-white px-4 py-2 text-sm font-medium text-ink">
                  {option}
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="How It Works" title="From Brief to Dispatch" />
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {processSteps.map((step, index) => (
            <div key={step.title} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-6">
              <span className="font-heading text-3xl font-bold text-primary-dark">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="font-heading mt-2 font-bold text-ink">{step.title}</h3>
              <p className="mt-1 text-sm text-dark/65">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="quote" className="bg-blush py-14 sm:py-20">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <SectionHeading align="left" eyebrow="Get Started" title="Get a Custom Quote" />
            <p className="mt-4 text-dark/70">
              Share your requirements below and our corporate gifting team will respond with sweet
              combinations, packaging options and pricing tailored to your budget and quantity.
            </p>
          </div>
          <EnquiryForm
            title="Corporate Gifting Enquiry"
            description="Fields marked * are required."
            whatsappIntro="New Corporate Gifting Enquiry"
            fields={[
              { name: "company", label: "Company Name", required: true },
              { name: "contactName", label: "Contact Person", required: true },
              { name: "phone", label: "Phone Number", type: "tel", required: true },
              { name: "email", label: "Email Address", type: "email" },
              { name: "quantity", label: "Approximate Quantity", type: "select", options: ["Under 50", "50-100", "100-500", "500-1000", "1000+"], required: true },
              { name: "occasion", label: "Occasion", type: "select", options: ["Diwali", "New Year", "Client Gifting", "Employee Rewards", "Other Festive Gifting"] },
              { name: "requirements", label: "Tell us more about your requirement", type: "textarea" },
            ]}
          />
        </div>
      </section>

      <CtaSection
        title="Let's Design a Gift Box Your Clients Will Remember"
        description="Talk to our corporate gifting team about branding, packaging and delivery timelines."
        primaryCta={{ label: "Get Custom Quote", href: "#quote" }}
        secondaryCta={{ label: "Browse Our Sweets", href: "/#catalog" }}
      />
    </>
  );
}
