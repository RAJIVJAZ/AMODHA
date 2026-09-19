import Link from "next/link";

type ProductCardProps = {
  href: string;
  name: string;
  description: string;
  icon?: string;
  cta?: string;
  color?: string;
};

export function ProductCard({
  href,
  name,
  description,
  icon = "✦",
  cta = "Learn More",
  color = "#fff0f0",
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className="sticker-shadow group flex flex-col justify-between rounded-3xl border-[2.5px] border-ink bg-white p-6 transition-all duration-150 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      <div>
        <div
          className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink text-3xl"
          style={{ backgroundColor: color }}
        >
          <span aria-hidden="true">{icon}</span>
        </div>
        <h3 className="font-heading mb-2 text-xl font-bold text-ink">{name}</h3>
        <p className="text-sm leading-relaxed text-dark/70">{description}</p>
      </div>
      <span className="font-heading mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-accent">
        {cta}
        <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
          →
        </span>
      </span>
    </Link>
  );
}
