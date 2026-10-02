import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";
import { processSteps } from "@/data/process";

export const metadata: Metadata = {
  title: "How We Make Our Sweets: Pure Desi Ghee, Traceable Batches",
  description:
    "How Mithai Wallah makes sweets in Prayagraj: milk from ~100 local farmers, quality testing, traditional recipes, 100% pure desi ghee, hygienic packing and traceable batches.",
  alternates: { canonical: "/our-process" },
};

export default function OurProcessPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Our Process" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Transparency by Design"
          title="How We Make Our Sweets"
          description="Six steps from fresh farm milk to a sealed box at your door — every batch recorded and traceable."
        />
        <div className="sticker-shadow relative mt-10 aspect-[21/9] w-full overflow-hidden rounded-3xl border-[2.5px] border-ink">
          <Image
            src="/images/sweet-corner/ghee-pour-quality.webp"
            alt="Pure desi ghee being poured over a Milk Cake with Kalakand and Barfi in the background"
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
        </div>
      </section>

      <section className="container-site pb-14 sm:pb-20">
        <div className="flex flex-col gap-8">
          {processSteps.map((stage, index) => (
            <div
              key={stage.title}
              className="sticker-shadow grid grid-cols-1 gap-6 rounded-3xl border-[2.5px] border-ink bg-white p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-start"
            >
              <span className="font-heading text-4xl font-bold text-primary/40 lg:text-5xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-ink">{stage.title}</h2>
                <p className="mt-2 text-dark/70">{stage.description}</p>
                <ul className="mt-4 flex flex-wrap gap-2">
                  {stage.points.map((point) => (
                    <li
                      key={point}
                      className="rounded-full border-2 border-ink/15 bg-blush px-3 py-1.5 text-xs font-medium text-ink sm:text-sm"
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

      <section className="bg-ink py-16 text-white sm:py-20">
        <div className="container-site grid grid-cols-1 items-center gap-10 lg:grid-cols-2">
          <div className="text-center lg:text-left">
            <span className="font-subheading text-lg italic text-primary-light">Factory Tour</span>
            <h2 className="mt-2 text-3xl font-bold sm:text-4xl">See Our Facility for Yourself</h2>
            <p className="mx-auto mt-4 max-w-2xl text-blush/85 lg:mx-0">
              We welcome wholesale partners, corporate clients and customers to visit our Prayagraj
              kitchen — from where milk arrives, to where sweets are made and packed.
            </p>
          </div>
          <div className="sticker-shadow relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-[2.5px] border-white/20">
            <Image
              src="/images/sweet-corner/production-facility.webp"
              alt="Mithai Wallah production facility with masked, gloved staff preparing sweets in large steel kadhais"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Made Honestly"
        title="Farmer Sourced. Pure Desi Ghee. Traceable Batches."
        description="Schedule a facility visit or start a wholesale conversation with our team."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
