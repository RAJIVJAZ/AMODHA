import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";

export const metadata: Metadata = {
  title: "Our Process | Farm to Factory Transparency",
  description:
    "See how Amodha collects milk, tests quality, processes dairy and hand-crafts sweets in our Prayagraj facility — from milk collection to dispatch.",
  alternates: { canonical: "/our-process" },
};

const stages = [
  {
    title: "1. Milk Collection",
    description:
      "Every morning and evening, milk is collected from over 1,000 partner farmers across villages near Prayagraj at dedicated collection centres. Each farmer's milk is logged individually for traceability.",
    points: ["Twice-daily collection", "Village-level collection centres", "Farmer ledger & fair payment"],
  },
  {
    title: "2. Quality Testing",
    description:
      "Before any milk enters our facility, it's tested for fat percentage, SNF (solids-not-fat), and CLR (corrected lactometer reading) to ensure purity and to calculate fair farmer payments.",
    points: ["Fat & SNF testing", "Adulteration checks", "Immediate chilling after testing"],
  },
  {
    title: "3. Bilona & Dairy Production",
    description:
      "Accepted milk moves into production — some is set into curd for hand-churned bilona ghee, some is processed into paneer, butter, cream and curd, and the rest is chilled and packed as fresh milk.",
    points: ["Traditional bilona hand-churning", "Batch-wise production logs", "Hygienic processing lines"],
  },
  {
    title: "4. Khoya & Sweet Making",
    description:
      "Fresh milk is slow-reduced into khoya, which becomes the base for our mithai range. Our halwais then hand-craft milk cake, kalakand, peda, kunda and more, fresh every day.",
    points: ["Daily fresh khoya production", "Hand-crafted by experienced halwais", "No artificial preservatives"],
  },
  {
    title: "5. Quality Lab Checks",
    description:
      "Finished products pass through quality checks for taste, texture and hygiene before packaging — with random batch sampling to maintain consistency across every dispatch.",
    points: ["Batch sampling", "Taste & texture consistency checks", "Hygiene compliance verification"],
  },
  {
    title: "6. Packaging & Dispatch",
    description:
      "Products are packed in food-grade, tamper-evident packaging suited to their shelf life, then dispatched same-day to retail partners, wholesale customers and gifting orders across India.",
    points: ["Food-grade tamper-evident packaging", "Cold-chain logistics where required", "Same-day dispatch"],
  },
];

export default function OurProcessPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Our Process" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Transparency by Design"
          title="From Farm to Factory to Your Table"
          description="Every product we make passes through six stages of careful, documented process — combining traditional technique with modern food-safety standards."
        />
      </section>

      <section className="container-site pb-14 sm:pb-20">
        <div className="flex flex-col gap-8">
          {stages.map((stage, index) => (
            <div
              key={stage.title}
              className="grid grid-cols-1 gap-6 rounded-3xl border border-gold/20 bg-white p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-start"
            >
              <span className="font-heading text-4xl font-bold text-gold/40 lg:text-5xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-brown">{stage.title.replace(/^\d+\.\s*/, "")}</h2>
                <p className="mt-2 text-dark/70">{stage.description}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {stage.points.map((point) => (
                    <li
                      key={point}
                      className="rounded-full bg-cream px-3 py-1.5 text-xs font-medium text-brown sm:text-sm"
                    >
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="bg-brown py-16 text-white sm:py-20">
        <div className="container-site text-center">
          <span className="font-subheading text-lg italic text-gold-light">Factory Tour</span>
          <h2 className="mt-2 text-3xl font-bold sm:text-4xl">See Our Facility for Yourself</h2>
          <p className="mx-auto mt-4 max-w-2xl text-cream/85">
            We welcome wholesale partners, corporate clients and distributors to visit our Prayagraj
            facility — from the milk collection floor to the quality lab, production area and packaging
            line.
          </p>
        </div>
      </section>

      <CtaSection
        eyebrow="Certified Quality"
        title="FSSAI Certified. Farmer Sourced. Factory Fresh."
        description="Schedule a facility visit or start a wholesale conversation with our team."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
