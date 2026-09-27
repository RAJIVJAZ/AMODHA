import Image from "next/image";
import Link from "next/link";

type ProductCardProps = {
  href: string;
  name: string;
  description: string;
  icon?: string;
  cta?: string;
  color?: string;
  badge?: string;
  image?: string;
};

export function ProductCard({
  href,
  name,
  description,
  icon = "✦",
  cta = "Learn More",
  color = "#fff0f0",
  badge,
  image,
}: ProductCardProps) {
  return (
    <Link
      href={href}
      className="sticker-shadow group relative flex flex-col justify-between overflow-hidden rounded-3xl border-[2.5px] border-ink bg-white transition-all duration-150 hover:-translate-y-1 hover:shadow-[6px_6px_0_0_var(--color-ink)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {badge ? (
        <span className="font-heading absolute right-3 top-3 z-10 rounded-full border-2 border-ink bg-accent px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
          {badge}
        </span>
      ) : null}
      {image ? (
        <div className="relative aspect-[4/3] w-full border-b-2 border-ink">
          <Image src={image} alt={name} fill sizes="(max-width: 640px) 100vw, 400px" className="object-cover" />
        </div>
      ) : null}
      <div className="flex flex-1 flex-col justify-between p-6">
        <div>
          {!image ? (
            <div
              className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-ink text-3xl"
              style={{ backgroundColor: color }}
            >
              <span aria-hidden="true">{icon}</span>
            </div>
          ) : null}
          <h3 className="font-heading mb-2 text-xl font-bold text-ink">{name}</h3>
          <p className="text-sm leading-relaxed text-dark/70">{description}</p>
        </div>
        <span className="font-heading mt-5 inline-flex items-center gap-1 text-sm font-semibold uppercase tracking-wide text-accent">
          {cta}
          <span aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-1">
            →
          </span>
        </span>
      </div>
    </Link>
  );
}
