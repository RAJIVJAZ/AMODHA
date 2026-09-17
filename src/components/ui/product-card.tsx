import Link from "next/link";

type ProductCardProps = {
  href: string;
  name: string;
  description: string;
  icon?: string;
  cta?: string;
};

export function ProductCard({ href, name, description, icon = "✦", cta = "Learn More" }: ProductCardProps) {
  return (
    <Link
      href={href}
      className="group flex flex-col justify-between rounded-2xl border border-gold/25 bg-white p-6 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-gold hover:shadow-lg hover:shadow-gold/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold"
    >
      <div>
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-cream text-2xl text-gold-dark ring-1 ring-gold/30">
          <span aria-hidden="true">{icon}</span>
        </div>
        <h3 className="mb-2 text-xl font-bold text-brown">{name}</h3>
        <p className="text-sm leading-relaxed text-dark/70">{description}</p>
      </div>
      <span className="mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-accent-red">
        {cta}
        <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
