type SectionHeadingProps = {
  eyebrow?: string;
  title: string;
  description?: string;
  align?: "left" | "center";
  light?: boolean;
  /** "h1" for the page's main heading (one per page); section headings stay h2. */
  as?: "h1" | "h2";
};

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "center",
  light = false,
  as: Heading = "h2",
}: SectionHeadingProps) {
  const alignClass = align === "center" ? "items-center text-center mx-auto" : "items-start text-left";

  return (
    <div className={`flex flex-col gap-4 max-w-2xl ${alignClass}`}>
      {eyebrow ? (
        <span
          className={`font-heading sticker-shadow-sm inline-block w-fit rounded-full border-2 border-ink px-4 py-1 text-xs font-semibold uppercase tracking-wide ${
            light ? "bg-primary-light text-ink" : "bg-accent text-white"
          }`}
        >
          {eyebrow}
        </span>
      ) : null}
      <Heading
        className={`text-balance text-3xl font-bold leading-tight sm:text-4xl md:text-5xl ${
          light ? "text-white" : "text-ink"
        }`}
      >
        {title}
      </Heading>
      {description ? (
        <p className={`text-balance text-base sm:text-lg ${light ? "text-blush/90" : "text-dark/70"}`}>
          {description}
        </p>
      ) : null}
    </div>
  );
}
