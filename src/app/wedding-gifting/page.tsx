import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { CtaSection } from "@/components/ui/cta-section";

export const metadata: Metadata = {
  title: "Wedding Sweet Boxes | Premium Wedding Gifting & Return Gifts",
  description:
    "Premium wedding hampers from Mithaiwallah Sweet Corner — bride & groom name customisation, theme-matched packaging and memorable wedding return gifts, made fresh in Prayagraj.",
  alternates: { canonical: "/wedding-gifting" },
};

const customisationList = [
  { label: "Bride & Groom Names", description: "Printed or embossed directly on the box." },
  { label: "Wedding Logo / Monogram", description: "Your wedding hashtag or monogram design featured on the packaging." },
  { label: "Wedding Theme Colours", description: "Box, ribbon and card colours matched to your wedding palette." },
  { label: "Invitation Card Match", description: "Packaging styled to complement your invitation card design." },
  { label: "Gift Note / Message Card", description: "A personalised note from the couple included in every box." },
];

const steps = [
  { title: "Tell Us Your Vision", description: "Wedding date, guest count, theme colours and budget." },
  { title: "Sweet & Box Selection", description: "Choose your mithai combination and packaging style." },
  { title: "Design Approval", description: "We share a mock-up with names, colours and finishing details." },
  { title: "Fresh Production", description: "Boxes are packed fresh close to your wedding date for peak flavour." },
  { title: "On-Time Delivery", description: "Delivered to your venue or distributed directly to your guest list." },
];

export default function WeddingGiftingPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Wedding Gifting" }]} />

      <section className="relative overflow-hidden bg-blush py-20 sm:py-28">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-accent/25 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-primary-light/50 blur-3xl" />
        <div className="container-site relative grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="flex flex-col items-center gap-6 text-center lg:items-start lg:text-left">
            <span className="font-heading sticker-shadow-sm rounded-full border-2 border-ink bg-accent px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-white">
              For Celebrations
            </span>
            <h1 className="text-balance max-w-3xl text-4xl font-bold text-ink sm:text-5xl">
              Wedding Gifting Your Guests Will Remember
            </h1>
            <p className="max-w-2xl text-balance text-lg text-ink/70">
              Premium hampers with bride and groom customisation, theme-matched packaging, and mithai made
              fresh for your big day.
            </p>
          </div>
          <div className="sticker-shadow relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-[2.5px] border-ink">
            <Image
              src="/images/sweet-corner/wedding-sweet-boxes.webp"
              alt="Row of Mithaiwallah wedding sweet boxes with gold lattice lids, blush ribbon bows and fresh roses"
              fill
              priority
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Make It Personal" title="Customisation Options" />
        <div className="mt-10 grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="sticker-shadow relative aspect-[4/5] w-full overflow-hidden rounded-3xl border-2 border-ink">
            <Image
              src="/images/sweet-corner/packaging-blush-wedding.webp"
              alt="Blush Mithaiwallah wedding gift box with gold lattice lid, rose and baby's breath, satin bow"
              fill
              sizes="(max-width: 1024px) 100vw, 40vw"
              className="object-cover"
            />
          </div>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            {customisationList.map((item) => (
              <div key={item.label} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-blush p-6">
                <h3 className="font-heading font-bold text-ink">{item.label}</h3>
                <p className="mt-2 text-sm text-dark/65">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site">
          <SectionHeading eyebrow="Planning Made Simple" title="How Wedding Gifting Works" />
          <ol className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
            {steps.map((step, index) => (
              <li key={step.title} className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-6">
                <span className="font-heading text-3xl font-bold text-primary-dark">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3 className="font-heading mt-2 font-bold text-ink">{step.title}</h3>
                <p className="mt-1 text-sm text-dark/65">{step.description}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section id="design" className="container-site py-14 sm:py-20">
        <div className="grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div>
            <SectionHeading align="left" eyebrow="Get Started" title="Design Your Wedding Box" />
            <p className="mt-4 text-dark/70">
              Share your wedding details below and our team will get in touch with sweet combinations,
              box designs and pricing based on your guest count and timeline.
            </p>
          </div>
          <EnquiryForm
            title="Wedding Gifting Enquiry"
            description="Fields marked * are required."
            whatsappIntro="New Wedding Gifting Enquiry"
            fields={[
              { name: "coupleNames", label: "Bride & Groom Names", required: true },
              { name: "weddingDate", label: "Wedding Date" },
              { name: "phone", label: "Phone Number", type: "tel", required: true },
              { name: "email", label: "Email Address", type: "email" },
              { name: "guestCount", label: "Approximate Guest Count", type: "select", options: ["Under 100", "100-300", "300-500", "500-1000", "1000+"], required: true },
              { name: "theme", label: "Wedding Theme / Colours" },
              { name: "requirements", label: "Tell us more about your requirement", type: "textarea" },
            ]}
          />
        </div>
      </section>

      <CtaSection
        title="Let's Make Your Wedding Gifting Unforgettable"
        description="From a small trial box to thousands of units — our wedding gifting team handles it all."
        primaryCta={{ label: "Design Your Wedding Box", href: "#design" }}
        secondaryCta={{ label: "Browse Sweet Corner", href: "/sweet-corner" }}
      />
    </>
  );
}
