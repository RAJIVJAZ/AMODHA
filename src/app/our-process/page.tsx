import type { Metadata } from "next";
import Image from "next/image";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { SectionHeading } from "@/components/ui/section-heading";
import { CtaSection } from "@/components/ui/cta-section";

export const metadata: Metadata = {
  title: "Our Process: Pure Desi Ghee, Recorded Live",
  description:
    "See how Mithaiwallah makes mithai in Prayagraj: fresh milk from 100+ local farmers, 100% pure desi ghee, every batch recorded live and packed hygienically.",
  alternates: { canonical: "/our-process" },
};

const stages = [
  {
    title: "1. Milk Collection",
    description:
      "Fresh milk is collected directly from around 100 local farmers in villages near Prayagraj. Buying straight from farmers means we know where every litre comes from.",
    points: ["~100 local farmers", "Direct from the village", "Fair, reliable payment"],
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
      "Fresh milk is slow-reduced into khoya, the base for our mithai range. Our halwais then make milk cake, kalakand, peda, kunda and more by hand — cooked only in 100% pure desi ghee.",
    points: ["Fresh khoya", "100% pure desi ghee", "No vanaspati or blended fats"],
  },
  {
    title: "5. Recorded Live",
    description:
      "Every batch is cooked on camera and recorded live in our hygienic kitchen, from raw milk to finished sweet. If you want to know how your mithai was made, you can see it.",
    points: ["Every batch on camera", "Hygienic kitchen", "Nothing hidden"],
  },
  {
    title: "6. Packing & Delivery",
    description:
      "Sweets are packed in sealed, food-safe boxes and delivered fresh to your door across Prayagraj.",
    points: ["Sealed, food-safe packing", "Delivered across Prayagraj", "Free delivery on ₹999+"],
  },
];

export default function OurProcessPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Our Process" }]} />

      <section className="container-site py-14 sm:py-20">
        <SectionHeading
          eyebrow="Transparency by Design"
          title="From Farm to Kitchen to Your Table"
          description="Six stages, all out in the open — from fresh farm milk to a sealed box at your door, with every batch recorded live."
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
          {stages.map((stage, index) => (
            <div
              key={stage.title}
              className="sticker-shadow grid grid-cols-1 gap-6 rounded-3xl border-[2.5px] border-ink bg-white p-6 sm:p-8 lg:grid-cols-[auto_1fr] lg:items-start"
            >
              <span className="font-heading text-4xl font-bold text-primary/40 lg:text-5xl">
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="text-2xl font-bold text-ink">{stage.title.replace(/^\d+\.\s*/, "")}</h2>
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
              We welcome wholesale partners, corporate clients and distributors to visit our Prayagraj
              facility — from the milk collection floor to the quality lab, production area and packaging
              line.
            </p>
          </div>
          <div className="sticker-shadow relative aspect-[4/3] w-full overflow-hidden rounded-3xl border-[2.5px] border-white/20">
            <Image
              src="/images/sweet-corner/production-facility.webp"
              alt="Mithaiwallah production facility with masked, gloved staff preparing sweets in large steel kadhais"
              fill
              sizes="(max-width: 1024px) 100vw, 50vw"
              className="object-cover"
            />
          </div>
        </div>
      </section>

      <CtaSection
        eyebrow="Made Honestly"
        title="Farmer Sourced. Pure Desi Ghee. Recorded Live."
        description="Schedule a facility visit or start a wholesale conversation with our team."
        primaryCta={{ label: "Contact Us", href: "/contact" }}
        secondaryCta={{ label: "Wholesale Enquiry", href: "/wholesale" }}
      />
    </>
  );
}
