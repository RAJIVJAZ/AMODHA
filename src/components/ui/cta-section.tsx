import { ButtonLink } from "@/components/ui/button-link";

type CtaSectionProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  primaryCta: { label: string; href: string };
  secondaryCta?: { label: string; href: string };
};

export function CtaSection({ eyebrow, title, description, primaryCta, secondaryCta }: CtaSectionProps) {
  return (
    <section className="relative overflow-hidden bg-ink py-16 sm:py-20">
      <div className="bg-diamond-pattern pointer-events-none absolute inset-0 opacity-10" />
      <div className="container-site relative flex flex-col items-center gap-6 text-center">
        {eyebrow ? (
          <span className="font-subheading text-lg italic text-primary-light">{eyebrow}</span>
        ) : null}
        <h2 className="text-balance max-w-3xl text-3xl font-bold text-white sm:text-4xl md:text-5xl">
          {title}
        </h2>
        {description ? (
          <p className="max-w-2xl text-balance text-base text-blush/90 sm:text-lg">{description}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-4">
          <ButtonLink href={primaryCta.href} variant="secondary">
            {primaryCta.label}
          </ButtonLink>
          {secondaryCta ? (
            <ButtonLink href={secondaryCta.href} variant="outline">
              {secondaryCta.label}
            </ButtonLink>
          ) : null}
        </div>
      </div>
    </section>
  );
}
