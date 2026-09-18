import { scallopedBadgePath } from "@/lib/badge-path";

type BrandBadgeProps = {
  title: string;
  subtitle?: string;
  tone?: "brown" | "cream" | "paisley";
  width?: number;
  height?: number;
  className?: string;
};

const tones = {
  brown: {
    fill: "var(--color-brown)",
    outerStroke: "var(--color-gold)",
    midStroke: null as string | null,
    innerStroke: "var(--color-gold-light)",
    pattern: null as string | null,
    text: "var(--color-cream)",
    subtext: "var(--color-gold-light)",
  },
  cream: {
    fill: "var(--color-cream)",
    outerStroke: "var(--color-gold)",
    midStroke: null,
    innerStroke: "var(--color-accent-red)",
    pattern: null,
    text: "var(--color-brown)",
    subtext: "var(--color-gold-dark)",
  },
  // Sampled directly from the Mithaiwallah Sweet Corner badge artwork, so the two
  // brand marks read as one matched family: magenta / gold / teal triple border,
  // cream ground with a tan motif pattern, teal wordmark.
  paisley: {
    fill: "#f9eddf",
    outerStroke: "#ab3170",
    midStroke: "#c09a4e",
    innerStroke: "#375756",
    pattern: "#d8c6a0",
    text: "#375756",
    subtext: "#8a6f3f",
  },
};

export function BrandBadge({
  title,
  subtitle,
  tone = "brown",
  width = 220,
  height = 92,
  className = "",
}: BrandBadgeProps) {
  const palette = tones[tone];
  const patternId = `badge-pattern-${tone}`;
  const clipId = `badge-clip-${tone}-${width}x${height}`;
  const outerPath = scallopedBadgePath(width, height, { bumps: 13, amplitude: height * 0.075 });
  const midPath = scallopedBadgePath(width - 6, height - 6, { bumps: 13, amplitude: (height - 6) * 0.075 });
  const innerPath = scallopedBadgePath(width - 12, height - 12, { bumps: 13, amplitude: (height - 12) * 0.075 });

  return (
    <div
      className={`relative inline-flex shrink-0 items-center justify-center ${className}`}
      style={{ width, height }}
    >
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        className="absolute inset-0"
        aria-hidden="true"
      >
        {palette.pattern ? (
          <defs>
            <pattern id={patternId} width={14} height={14} patternUnits="userSpaceOnUse">
              <rect width={14} height={14} fill={palette.fill} />
              <circle cx={3.5} cy={3.5} r={1.1} fill={palette.pattern} opacity={0.55} />
              <circle cx={10.5} cy={10.5} r={1.1} fill={palette.pattern} opacity={0.55} />
            </pattern>
            <clipPath id={clipId}>
              <path d={outerPath} />
            </clipPath>
          </defs>
        ) : null}
        <path
          d={outerPath}
          fill={palette.pattern ? `url(#${patternId})` : palette.fill}
          stroke={palette.outerStroke}
          strokeWidth={2.5}
          clipPath={palette.pattern ? `url(#${clipId})` : undefined}
        />
        {palette.midStroke ? (
          <path d={midPath} transform="translate(3,3)" fill="none" stroke={palette.midStroke} strokeWidth={1.5} />
        ) : null}
        <path
          d={innerPath}
          transform={palette.midStroke ? "translate(6,6)" : "translate(5,5)"}
          fill="none"
          stroke={palette.innerStroke}
          strokeWidth={1.25}
          opacity={0.85}
        />
      </svg>
      <div className="relative z-10 flex flex-col items-center justify-center px-3 text-center leading-none">
        <span
          className="font-heading font-bold tracking-tight"
          style={{
            color: palette.text,
            fontSize: Math.max(14, width * 0.14),
          }}
        >
          {title}
        </span>
        {subtitle ? (
          <span
            className="font-subheading mt-1 italic tracking-wide"
            style={{
              color: palette.subtext,
              fontSize: Math.max(9, width * 0.052),
            }}
          >
            {subtitle}
          </span>
        ) : null}
      </div>
    </div>
  );
}
