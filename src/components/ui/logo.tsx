type LogoProps = {
  size?: "sm" | "md" | "lg";
  tone?: "ink" | "white";
  tagline?: string;
  className?: string;
};

const sizes = {
  sm: { title: "text-xl", tag: "text-[10px]", dot: "h-1.5 w-1.5" },
  md: { title: "text-2xl sm:text-3xl", tag: "text-xs", dot: "h-2 w-2" },
  lg: { title: "text-4xl sm:text-5xl", tag: "text-sm", dot: "h-2.5 w-2.5" },
};

export function Logo({ size = "md", tone = "ink", tagline = "Mithaiwallah Sweet Corner", className = "" }: LogoProps) {
  const s = sizes[size];
  const titleColor = tone === "ink" ? "text-ink" : "text-white";
  const tagColor = tone === "ink" ? "text-primary-dark" : "text-primary-light";

  return (
    <span className={`inline-flex flex-col leading-none ${className}`}>
      <span className={`font-heading ${s.title} inline-flex items-center gap-1.5 font-bold tracking-tight ${titleColor}`}>
        Amodha
        <span className={`${s.dot} rounded-full bg-accent`} aria-hidden="true" />
      </span>
      {tagline ? (
        <span className={`font-subheading mt-0.5 italic tracking-wide ${s.tag} ${tagColor}`}>{tagline}</span>
      ) : null}
    </span>
  );
}
