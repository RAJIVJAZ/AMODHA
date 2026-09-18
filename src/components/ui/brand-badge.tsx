import { scallopedBadgePath } from "@/lib/badge-path";

type BrandBadgeProps = {
  title: string;
  subtitle?: string;
  tone?: "brown" | "cream";
  width?: number;
  height?: number;
  className?: string;
};

const tones = {
  brown: {
    fill: "var(--color-brown)",
    outerStroke: "var(--color-gold)",
    innerStroke: "var(--color-gold-light)",
    text: "var(--color-cream)",
    subtext: "var(--color-gold-light)",
  },
  cream: {
    fill: "var(--color-cream)",
    outerStroke: "var(--color-gold)",
    innerStroke: "var(--color-accent-red)",
    text: "var(--color-brown)",
    subtext: "var(--color-gold-dark)",
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
  const outerPath = scallopedBadgePath(width, height, { bumps: 13, amplitude: height * 0.075 });
  const innerPath = scallopedBadgePath(width - 10, height - 10, { bumps: 13, amplitude: (height - 10) * 0.075 });

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
        <path
          d={outerPath}
          transform="translate(0,0)"
          fill={palette.fill}
          stroke={palette.outerStroke}
          strokeWidth={2.5}
        />
        <path
          d={innerPath}
          transform="translate(5,5)"
          fill="none"
          stroke={palette.innerStroke}
          strokeWidth={1.25}
          opacity={0.8}
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
