import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { CtaSection } from "@/components/ui/cta-section";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { dealerFaqs } from "@/data/faqs";

export const metadata: Metadata = {
  title: "Wholesale & Distributor Program | Sweet Wholesale Supplier",
  description:
    "Become an Amodha dealer or distributor. Wholesale dairy and mithai supply for sweet shops, hotels, restaurants and retail chains across Uttar Pradesh and beyond.",
  alternates: { canonical: "/wholesale" },
};

const segments = [
  { title: "Sweet Shop Owners", description: "Wholesale khoya, milk cake, Bikaneri Cake and Kunda for your retail counter." },
  { title: "Distributors & Dealers", description: "Territory-based supply agreements with wholesale pricing and schemes." },
  { title: "Hotels & Restaurants", description: "Consistent bulk supply of paneer, cream, milk and mithai for F&B operations." },
  { title: "Retail Chains", description: "Reliable dairy and sweets supply for multi-outlet retail businesses." },
];

const benefits = [
  "Competitive wholesale pricing tiers",
  "Consistent quality across every batch",
  "Dedicated account support",
  "Flexible order quantities & schedules",
  "Reliable, on-time dispatch",
  "Promotional schemes for high-volume partners",
];

export default function WholesalePage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wholesale" }]} />

      <section className="relative overflow-hidden bg-blush py-20 sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-primary-light/50 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-accent/25 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <span className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-primary-light px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            Wholesale & Distribution
          </span>
          <h1 className="text-balance max-w-3xl text-4xl font-bold text-ink sm:text-5xl">
            Become an Amodha Wholesale Partner
          </h1>
          <p className="max-w-2xl text-balance text-lg text-ink/70">
            We supply consistent, high-quality dairy and mithai in bulk to sweet shop owners,
            distributors, hotels, restaurants and retail chains.
          </p>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Who We Partner With" title="Built for Every Kind of Trade Partner" />
        <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {segments.map((segment) => (
            <div key={segment.title} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-blush p-6">
              <h3 className="font-heading font-bold text-ink">{segment.title}</h3>
              <p className="mt-2 text-sm text-dark/65">{segment.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-2 lg:items-center">
          <div>
            <SectionHeading align="left" eyebrow="Why Partner With Us" title="Dealer & Distributor Benefits" />
          </div>
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {benefits.map((benefit) => (
              <li key={benefit} className="flex items-start gap-2 rounded-xl border-2 border-ink bg-white p-4 text-sm text-dark/75">
                <span className="mt-0.5 text-primary-dark" aria-hidden="true">✓</span>
                {benefit}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section id="apply" className="container-site py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <SectionHeading align="left" eyebrow="Get Started" title="Become a Distributor" />
            <p className="mt-4 text-dark/70">
              Tell us about your business and trade area. Our sales team will reach out with wholesale
              pricing, minimum order quantities and onboarding details.
            </p>
          </div>
          <EnquiryForm
            title="Wholesale / Dealer Enquiry"
            description="Fields marked * are required."
            whatsappIntro="New Wholesale / Dealer Enquiry"
            fields={[
              { name: "businessName", label: "Business Name", required: true },
              { name: "contactName", label: "Contact Person", required: true },
              { name: "phone", label: "Phone Number", type: "tel", required: true },
              { name: "email", label: "Email Address", type: "email" },
              { name: "businessType", label: "Business Type", type: "select", options: ["Sweet Shop", "Distributor", "Dealer", "Hotel / Restaurant", "Retail Chain", "Other"], required: true },
              { name: "city", label: "City / Territory", required: true },
              { name: "requirements", label: "Products & Approximate Volume", type: "textarea" },
            ]}
          />
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site max-w-3xl">
          <SectionHeading eyebrow="Questions" title="Dealer & Distributor FAQs" align="left" />
          <div className="mt-8">
            <FaqAccordion items={dealerFaqs} />
          </div>
        </div>
      </section>

      <CtaSection
        title="Let's Build a Reliable Supply Partnership"
        description="Join 100+ retail and wholesale partners already trusting Amodha for consistent quality."
        primaryCta={{ label: "Become a Distributor", href: "#apply" }}
        secondaryCta={{ label: "Contact Sales", href: "/contact" }}
      />
    </>
  );
}
