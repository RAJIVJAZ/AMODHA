import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/ui/breadcrumbs";
import { ButtonLink } from "@/components/ui/button-link";
import { SectionHeading } from "@/components/ui/section-heading";
import { EnquiryForm } from "@/components/ui/enquiry-form";
import { membership, membershipBenefits, membershipComparison } from "@/data/membership";

export const metadata: Metadata = {
  title: "Mithai Wallah Membership — 20% Off Sweets for ₹199/Year",
  description:
    "Join the Mithai Wallah Membership for ₹199 a year: 20% off sweets and food, free delivery above ₹499 in Prayagraj, priority support and early access.",
  alternates: { canonical: "/membership" },
};

const breakEven = Math.ceil(membership.fee / (membership.discountPercent / 100));

export default function MembershipPage() {
  return (
    <>
      <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Membership" }]} />

      <section className="relative overflow-hidden bg-[#fbeec4] py-16 sm:py-24">
        <div aria-hidden="true" className="pointer-events-none absolute -left-16 -top-10 h-72 w-72 rounded-full bg-accent/20 blur-3xl" />
        <div aria-hidden="true" className="pointer-events-none absolute -right-10 bottom-0 h-64 w-64 rounded-full bg-primary-light/50 blur-3xl" />
        <div className="container-site relative flex flex-col items-center gap-6 text-center">
          <span className="font-heading sticker-shadow-sm inline-block rounded-full border-2 border-ink bg-white px-4 py-1.5 text-sm font-semibold uppercase tracking-wide text-ink">
            Launching soon · Join the waitlist
          </span>
          <h1 className="text-balance max-w-4xl text-4xl font-bold leading-tight text-ink sm:text-5xl md:text-6xl">
            {membership.name}
          </h1>
          <p className="font-heading text-ink">
            <span className="text-5xl font-bold sm:text-6xl">₹{membership.fee}</span>
            <span className="text-xl font-semibold text-dark/60"> / {membership.period}</span>
          </p>
          <p className="text-balance max-w-2xl text-lg text-ink/70 sm:text-xl">
            {membership.discountPercent}% off every sweet and food order, free delivery above ₹
            {membership.freeDeliveryThreshold}, priority support and first access to new sweets and festive boxes.
          </p>
          <ButtonLink href="#waitlist" variant="primary">
            Join the Waitlist
          </ButtonLink>
          <p className="max-w-xl text-sm text-dark/60">
            Membership isn&rsquo;t on sale yet. Joining the waitlist is free and takes no payment — we&rsquo;ll
            message you when it opens. {membership.exclusionNote}
          </p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="Member Benefits" title="What You Get for ₹199 a Year" />
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {membershipBenefits.map((benefit) => (
              <div key={benefit.title} className="sticker-shadow-sm flex flex-col gap-3 rounded-2xl border-2 border-ink bg-white p-6">
                <span aria-hidden="true" className="flex h-12 w-12 items-center justify-center rounded-xl border-2 border-ink bg-[#fbeec4] text-2xl">
                  {benefit.icon}
                </span>
                <h3 className="font-heading text-lg font-bold text-ink">{benefit.title}</h3>
                <p className="text-sm text-dark/70">{benefit.description}</p>
              </div>
            ))}
          </div>
          <p className="sticker-shadow-sm mx-auto rounded-full border-2 border-ink bg-blush px-5 py-2 text-center text-sm font-semibold text-ink">
            {membership.exclusionNote}
          </p>
        </div>
      </section>

      <section className="bg-blush py-16 sm:py-24">
        <div className="container-site flex flex-col gap-10">
          <SectionHeading eyebrow="Compare" title="Regular vs Member" />
          <div className="sticker-shadow mx-auto w-full max-w-3xl overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white">
            <table className="w-full text-left text-sm sm:text-base">
              <caption className="sr-only">Comparison of regular customer and member benefits</caption>
              <thead className="bg-ink text-white">
                <tr>
                  <th scope="col" className="px-3 py-3 font-heading sm:px-5">Benefit</th>
                  <th scope="col" className="px-3 py-3 font-heading sm:px-5">Regular</th>
                  <th scope="col" className="bg-accent px-3 py-3 font-heading sm:px-5">Member</th>
                </tr>
              </thead>
              <tbody className="divide-y-2 divide-ink/10">
                {membershipComparison.map((row) => (
                  <tr key={row.feature}>
                    <th scope="row" className="px-3 py-3 font-heading font-bold text-ink sm:px-5">{row.feature}</th>
                    <td className="px-3 py-3 text-dark/65 sm:px-5">{row.regular}</td>
                    <td className="bg-[#fbeec4]/60 px-3 py-3 font-semibold text-ink sm:px-5">{row.member}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="text-center text-sm text-dark/60">{membership.exclusionNote}</p>
        </div>
      </section>

      <section className="py-16 sm:py-24">
        <div className="container-site">
          <div className="sticker-shadow mx-auto flex max-w-3xl flex-col gap-3 rounded-3xl border-[2.5px] border-ink bg-primary-light/30 p-8 text-center">
            <span className="font-subheading text-lg italic text-ink">Does it pay for itself?</span>
            <p className="font-heading text-2xl font-bold text-ink sm:text-3xl">
              Yes — after about ₹{breakEven.toLocaleString("en-IN")} of sweets in a year.
            </p>
            <p className="text-dark/70">
              {membership.discountPercent}% off ₹{breakEven.toLocaleString("en-IN")} is ₹
              {Math.round((breakEven * membership.discountPercent) / 100)}, which covers the ₹{membership.fee} fee. Every
              order after that is pure saving — before counting free delivery above ₹{membership.freeDeliveryThreshold}.
            </p>
          </div>
        </div>
      </section>

      <section id="waitlist" className="scroll-mt-24 bg-blush py-16 sm:py-24">
        <div className="container-site grid grid-cols-1 gap-10 lg:grid-cols-[1fr_1.4fr] lg:items-start">
          <SectionHeading
            align="left"
            eyebrow="Waitlist"
            title="Be First to Join"
            description="Leave your details and we'll message you on WhatsApp the day membership opens. No payment now."
          />
          <EnquiryForm
            title="Membership Waitlist"
            fields={[
              { name: "name", label: "Name", required: true },
              { name: "mobile", label: "Mobile Number", type: "tel", required: true },
              { name: "area", label: "Area / Locality", required: true },
              {
                name: "frequency",
                label: "How often do you buy sweets?",
                type: "select",
                options: ["Every week", "A few times a month", "Once a month", "Mostly on festivals"],
              },
              { name: "notes", label: "Anything you'd like from membership?", type: "textarea" },
            ]}
            whatsappIntro="Hi Mithai Wallah, please add me to the Membership waitlist."
          />
        </div>
      </section>
    </>
  );
}
