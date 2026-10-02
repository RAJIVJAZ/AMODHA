const ROSETTE_POINTS = Array.from({ length: 48 }, (_, i) => {
  const angle = (i / 48) * Math.PI * 2;
  const radius = i % 2 === 0 ? 97 : 91;
  return `${(100 + radius * Math.cos(angle)).toFixed(2)},${(100 + radius * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

export function GheeSeal({ className = "h-28 w-28", idPrefix = "ghee-seal" }: { className?: string; idPrefix?: string }) {
  const gold = `${idPrefix}-gold`;
  const top = `${idPrefix}-top`;
  const bottom = `${idPrefix}-bottom`;

  return (
    <svg viewBox="0 0 200 200" role="img" aria-label="100% Pure Desi Ghee seal" className={className}>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fbe39a" />
          <stop offset="45%" stopColor="#e6b84f" />
          <stop offset="100%" stopColor="#b9862c" />
        </linearGradient>
        <path id={top} d="M 30,100 A 70,70 0 0 1 170,100" />
        <path id={bottom} d="M 20,100 A 80,80 0 0 0 180,100" />
      </defs>

      <polygon points={ROSETTE_POINTS} fill={`url(#${gold})`} stroke="#16323f" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="100" cy="100" r="86" fill="none" stroke="#16323f" strokeWidth="1.5" />
      <circle cx="100" cy="100" r="56" fill="none" stroke="#16323f" strokeWidth="1.5" strokeDasharray="3 3" />

      <text fill="#16323f" fontSize="14.5" fontWeight="800" letterSpacing="1.2" fontFamily="var(--font-heading), sans-serif">
        <textPath href={`#${top}`} startOffset="50%" textAnchor="middle">
          100% PURE DESI GHEE
        </textPath>
      </text>
      <text fill="#16323f" fontSize="10.5" fontWeight="700" letterSpacing="1.6" fontFamily="var(--font-heading), sans-serif">
        <textPath href={`#${bottom}`} startOffset="50%" textAnchor="middle">
          ★ MITHAI WALLAH ★
        </textPath>
      </text>

      <path
        d="M100,66 C100,66 83,88 83,99 A17,17 0 0 0 117,99 C117,88 100,66 100,66 Z"
        fill="#fff6d8"
        stroke="#16323f"
        strokeWidth="2.5"
      />
      <path d="M93,98 A8,8 0 0 0 100,108" fill="none" stroke="#e6b84f" strokeWidth="3" strokeLinecap="round" />
      <text x="100" y="138" textAnchor="middle" fill="#16323f" fontSize="13" fontWeight="800" letterSpacing="2" fontFamily="var(--font-heading), sans-serif">
        SHUDDH
      </text>
    </svg>
  );
}
