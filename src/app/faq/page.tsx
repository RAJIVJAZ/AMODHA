import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { FaqAccordion } from "@/components/ui/faq-accordion";
import { CtaSection } from "@/components/ui/cta-section";
import { generalFaqs } from "@/data/faqs";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Answers to common questions about Amodha Dairy Products and Mithaiwallah Sweet Corner — ordering, wholesale, gifting, delivery and quality.",
  alternates: { canonical: "/faq" },
};

export default function FaqPage() {
  const faqJsonLd = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: generalFaqs.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: { "@type": "Answer", text: faq.answer },
    })),
  };

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }} />
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "FAQs" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading eyebrow="Support" title="Frequently Asked Questions" align="left" />
        <div className="mt-10 max-w-3xl">
          <FaqAccordion items={generalFaqs} />
        </div>
      </section>

      <CtaSection
        title="Still Have Questions?"
        description="Our team is happy to help with orders, wholesale pricing or gifting requirements."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
