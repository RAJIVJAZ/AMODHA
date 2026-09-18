import { siteConfig } from "@/lib/site";

const trustItems = [
  { value: siteConfig.stats.farmers, label: "Farmers Connected" },
  { value: siteConfig.stats.customers, label: "Happy Customers" },
  { value: siteConfig.stats.retailPartners, label: "Retail Partners" },
  { value: "FSSAI", label: "Certified Facility" },
  { value: "Est. " + siteConfig.founded, label: "In Prayagraj" },
];

export function TrustBar() {
  return (
    <section aria-label="Why customers trust Amodha" className="bg-primary-light/30 py-10">
      <div className="container-site grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-5">
        {trustItems.map((item) => (
          <div
            key={item.label}
            className="sticker-shadow-sm flex flex-col items-center gap-1 rounded-2xl border-2 border-ink bg-white px-3 py-5 text-center"
          >
            <span className="font-heading text-2xl font-bold text-ink sm:text-3xl">{item.value}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-dark/60 sm:text-sm">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
