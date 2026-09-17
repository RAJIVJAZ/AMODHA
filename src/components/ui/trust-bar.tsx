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
    <section aria-label="Why customers trust Amodha" className="border-y border-gold/20 bg-cream">
      <div className="container-site grid grid-cols-2 gap-6 py-10 text-center sm:grid-cols-3 md:grid-cols-5">
        {trustItems.map((item) => (
          <div key={item.label} className="flex flex-col items-center gap-1">
            <span className="text-2xl font-bold text-brown sm:text-3xl">{item.value}</span>
            <span className="text-xs font-medium uppercase tracking-wide text-dark/60 sm:text-sm">
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
