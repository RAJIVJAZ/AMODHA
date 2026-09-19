import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { siteConfig } from "@/lib/site";

export const metadata: Metadata = {
  title: "Contact Us",
  description:
    "Get in touch with Amodha Dairy Products and Mithaiwallah Sweet Corner in Prayagraj, Uttar Pradesh — for retail, wholesale, corporate and wedding gifting enquiries.",
  alternates: { canonical: "/contact" },
};

const contactCards = [
  {
    title: "Call Us",
    value: siteConfig.contact.phone,
    href: `tel:${siteConfig.contact.phoneHref}`,
  },
  {
    title: "WhatsApp",
    value: "Chat with our team",
    href: `https://wa.me/${siteConfig.contact.whatsapp}`,
  },
  {
    title: "Email",
    value: siteConfig.contact.email,
    href: `mailto:${siteConfig.contact.email}`,
  },
  {
    title: "Visit Us",
    value: `${siteConfig.address.plant.line2}, ${siteConfig.address.plant.city}, ${siteConfig.address.plant.state}`,
    href: siteConfig.mapsUrl,
  },
];

export default function ContactPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Contact" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Get in Touch"
          title="We'd Love to Hear From You"
          description="Whether you're a retail customer, sweet shop owner, hotel, or planning a corporate or wedding order — our team is here to help."
        />

        <div className="mt-12 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {contactCards.map((card) => (
            <a
              key={card.title}
              href={card.href}
              target={card.href.startsWith("http") ? "_blank" : undefined}
              rel={card.href.startsWith("http") ? "noopener noreferrer" : undefined}
              className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-blush p-6 text-center transition-transform hover:-translate-y-1"
            >
              <h3 className="text-sm font-semibold uppercase tracking-wide text-primary-dark">
                {card.title}
              </h3>
              <p className="mt-2 text-sm font-medium text-ink">{card.value}</p>
            </a>
          ))}
        </div>
      </section>

      <section className="bg-blush py-14 sm:py-20">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.2fr] lg:items-start">
          <div className="flex flex-col gap-6">
            <div>
              <h2 className="text-2xl font-bold text-ink">Our Manufacturing Plant</h2>
              <address className="mt-2 not-italic text-dark/70">
                {siteConfig.address.plant.line1}
                <br />
                {siteConfig.address.plant.line2}
                <br />
                {siteConfig.address.plant.city}, {siteConfig.address.plant.state} -{" "}
                {siteConfig.address.plant.postalCode}
                <br />
                India
              </address>
            </div>
            <div className="sticker-shadow overflow-hidden rounded-2xl border-2 border-ink">
              <iframe
                title="Amodha Dairy Products manufacturing plant on Google Maps"
                src={siteConfig.mapsEmbedUrl}
                width="100%"
                height="320"
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="block"
              />
            </div>
            <div className="sticker-shadow-sm rounded-2xl border-2 border-ink bg-white p-5">
              <h2 className="font-heading text-lg font-bold text-ink">Registered Office</h2>
              <address className="mt-2 not-italic text-sm text-dark/70">
                {siteConfig.address.office.line1}
                <br />
                {siteConfig.address.office.line2}
                <br />
                {siteConfig.address.office.city}, {siteConfig.address.office.state} -{" "}
                {siteConfig.address.office.postalCode}
                <br />
                India
              </address>
              <a
                href={siteConfig.officeMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2 inline-block text-sm font-semibold text-primary-dark hover:underline"
              >
                View on Google Maps →
              </a>
            </div>
          </div>
          <EnquiryForm
            title="Send Us a Message"
            description="Fields marked * are required."
            whatsappIntro="New General Enquiry"
            fields={[
              { name: "name", label: "Full Name", required: true },
              { name: "phone", label: "Phone Number", type: "tel", required: true },
              { name: "email", label: "Email Address", type: "email" },
              {
                name: "topic",
                label: "I'm reaching out about",
                type: "select",
                required: true,
                options: [
                  "Retail Order",
                  "Wholesale / Dealer Enquiry",
                  "Corporate Gifting",
                  "Wedding Gifting",
                  "General Question",
                ],
              },
              { name: "message", label: "Message", type: "textarea", required: true },
            ]}
          />
        </div>
      </section>
    </>
  );
}
