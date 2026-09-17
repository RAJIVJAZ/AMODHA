import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { CtaSection } from "@/components/ui/cta-section";

export const metadata: Metadata = {
  title: "Corporate Sweet Gift Boxes | Custom Branding & Bulk Orders",
  description:
    "Luxury corporate gifting from Amodha's Mithaiwallah Sweet Corner — custom-branded mithai boxes, bulk orders and Pan-India delivery for client gifting, employee rewards and festive corporate gifting.",
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
  { title: "Production & Dispatch", description: "We produce fresh, pack and dispatch Pan-India on schedule." },
];

export default function CorporateGiftingPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Corporate Gifting" }]} />

      <section className="relative overflow-hidden bg-brown py-20 text-white sm:py-28">
        <div aria-hidden="true" className="bg-diamond-pattern absolute inset-0 opacity-[0.08]" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <span className="font-subheading text-lg italic text-gold-light">For Businesses</span>
          <h1 className="text-balance max-w-3xl text-4xl font-bold sm:text-5xl">
            Corporate Gifting That Reflects Your Brand
          </h1>
          <p className="max-w-2xl text-balance text-lg text-cream/90">
            Luxury gift boxes with custom branding, bulk order capacity and Pan-India delivery — for
            client gifting, employee rewards, and festive corporate gifting programs.
          </p>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Who We Serve" title="Industries We Work With" />
        <div className="mt-10 grid grid-cols-2 gap-4 sm:grid-cols-4">
          {industries.map((industry) => (
            <div
              key={industry}
              className="rounded-xl border border-gold/20 bg-cream px-4 py-5 text-center text-sm font-semibold text-brown"
            >
              {industry}
            </div>
          ))}
        </div>
      </section>

      <section className="bg-cream py-14 sm:py-20">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading align="left" eyebrow="Packaging" title="Packaging Options" />
            <div className="mt-6 flex flex-wrap gap-2">
              {packagingOptions.map((option) => (
                <span key={option} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-brown ring-1 ring-gold/25">
                  {option}
                </span>
              ))}
            </div>
          </div>
          <div>
            <SectionHeading align="left" eyebrow="Personalisation" title="Customisation Options" />
            <div className="mt-6 flex flex-wrap gap-2">
              {customisations.map((option) => (
                <span key={option} className="rounded-full bg-white px-4 py-2 text-sm font-medium text-brown ring-1 ring-gold/25">
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
            <div key={step.title} className="rounded-2xl border border-gold/20 bg-white p-6">
              <span className="font-heading text-3xl font-bold text-gold-dark">
                {String(index + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-semibold text-brown">{step.title}</h3>
              <p className="mt-1 text-sm text-dark/65">{step.description}</p>
            </div>
          ))}
        </div>
      </section>

      <section id="quote" className="bg-cream py-14 sm:py-20">
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
              { name: "quantity", label: "Approximate Quantity", type: "select", options: ["50-100", "100-500", "500-1000", "1000-5000", "5000+"], required: true },
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
        secondaryCta={{ label: "Explore Sweet Corner", href: "/sweet-corner" }}
      />
    </>
  );
}
