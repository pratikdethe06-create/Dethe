import Link from "next/link";

/**
 * DetheAI brand mark — a blue "D" whose white counter holds a face profile
 * (speaking) and a rising sound-wave. Faithful vector recreation of the
 * supplied logo so it stays crisp from favicon to hero size.
 */
export function DetheMark({
  className = "size-10",
  id = "dethe-mark",
}: {
  className?: string;
  id?: string;
}) {
  const g1 = `${id}-body`;
  const g2 = `${id}-sheen`;
  const g3 = `${id}-bars`;
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden="true" focusable="false">
      <defs>
        {/* deep royal blue (top-left) → bright azure (bottom-right) */}
        <linearGradient id={g1} x1="6" y1="8" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0f2fd6" />
          <stop offset="0.55" stopColor="#1258ea" />
          <stop offset="1" stopColor="#1c8cff" />
        </linearGradient>
        {/* lighter sweep along the outer edge of the bowl */}
        <linearGradient id={g2} x1="40" y1="14" x2="92" y2="66" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#7fc0ff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <linearGradient id={g3} x1="42" y1="30" x2="72" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0e3fe0" />
          <stop offset="1" stopColor="#1a86ff" />
        </linearGradient>
      </defs>

      {/* ── outer D (with the softened bottom-left corner swoosh) ── */}
      <path
        d="M14 12 H46 C72 12 91 28 91 50 C91 72 72 88 46 88 H24 C18 88 14 84 14 78 Z"
        fill={`url(#${g1})`}
      />
      <path
        d="M14 12 H46 C72 12 91 28 91 50 C91 72 72 88 46 88 H24 C18 88 14 84 14 78 Z"
        fill={`url(#${g2})`}
      />

      {/* ── white counter: face profile on the left, bars area on the right ── */}
      <path
        d="M27 26 H40 C56 26 68 31 76 38 C80.5 41.5 82.5 45.5 82.5 50 C82.5 54.5 80.5 58.5 76 62 C68 69 56 74 40 74 H31.5 C27.5 74 26 71.5 27 68.5
           C29.5 64 32.5 61 31.5 57.5 C30.8 55.3 29 54.2 29.2 52.4 C29.4 51 30.6 50.6 30.4 49.4 C30.2 48.2 29.4 48 29.6 46.8 C29.8 45.6 31 45.3 30.8 44
           C30.4 41 27.4 39.6 26.2 36 C25 32.2 25.6 28.6 27 26 Z"
        fill="#ffffff"
      />

      {/* ── sound-wave bars (left → right: small, tall, medium, small, dot) ── */}
      <g fill={`url(#${g3})`}>
        <rect x="41.5" y="43.5" width="4.4" height="13" rx="2.2" />
        <rect x="48.5" y="35" width="4.4" height="30" rx="2.2" />
        <rect x="55.5" y="40" width="4.4" height="20" rx="2.2" />
        <rect x="62.5" y="44.5" width="4.4" height="11" rx="2.2" />
        <rect x="69.3" y="47.6" width="4.4" height="4.8" rx="2.2" />
      </g>

      {/* ── bottom-left accent swoosh ── */}
      <path
        d="M14 78 C22 66 36 58 50 58 C40 64 30 74 24 88 C18 88 14 84 14 78 Z"
        fill="#0f36de"
        opacity="0.55"
      />
    </svg>
  );
}

/**
 * Wordmark: "Dethe" in deep navy, "AI" in a royal-blue → azure gradient.
 */
export function DetheWordmark({
  className = "",
  light = false,
  size = 21,
}: {
  className?: string;
  light?: boolean;
  size?: number;
}) {
  return (
    <span
      className={`display inline-flex items-baseline whitespace-nowrap font-extrabold tracking-[-.045em] ${className}`}
      style={{ fontSize: size, lineHeight: 1 }}
    >
      <span className={light ? "text-white" : "text-[#0b1f4d]"}>Dethe</span>
      <span className="brand-ai">AI</span>
    </span>
  );
}

export function BrandLogo({
  href = "/",
  compact = false,
  light = false,
}: {
  href?: string;
  compact?: boolean;
  light?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`brand-lockup group inline-flex items-center ${compact ? "gap-2" : "gap-2.5"}`}
      aria-label="DetheAI home"
    >
      <span className={`brand-mark relative shrink-0 ${compact ? "size-8" : "size-10"}`}>
        <DetheMark className="size-full" id={compact ? "dethe-mark-sm" : "dethe-mark"} />
      </span>
      <DetheWordmark light={light} size={compact ? 18 : 22} />
    </Link>
  );
}
