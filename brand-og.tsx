// Inline SVG of the DetheAI mark for next/og image routes (no CSS / gradients-by-id clashes).

export function MarkSvg({ size }: { size: number }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size}>
      <defs>
        <linearGradient id="ogBody" x1="6" y1="8" x2="88" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0f2fd6" />
          <stop offset="0.55" stopColor="#1258ea" />
          <stop offset="1" stopColor="#1c8cff" />
        </linearGradient>
        <linearGradient id="ogBars" x1="42" y1="30" x2="72" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#0e3fe0" />
          <stop offset="1" stopColor="#1a86ff" />
        </linearGradient>
      </defs>
      <path
        d="M14 12 H46 C72 12 91 28 91 50 C91 72 72 88 46 88 H24 C18 88 14 84 14 78 Z"
        fill="url(#ogBody)"
      />
      <path
        d="M27 26 H40 C56 26 68 31 76 38 C80.5 41.5 82.5 45.5 82.5 50 C82.5 54.5 80.5 58.5 76 62 C68 69 56 74 40 74 H31.5 C27.5 74 26 71.5 27 68.5 C29.5 64 32.5 61 31.5 57.5 C30.8 55.3 29 54.2 29.2 52.4 C29.4 51 30.6 50.6 30.4 49.4 C30.2 48.2 29.4 48 29.6 46.8 C29.8 45.6 31 45.3 30.8 44 C30.4 41 27.4 39.6 26.2 36 C25 32.2 25.6 28.6 27 26 Z"
        fill="#ffffff"
      />
      <rect x="41.5" y="43.5" width="4.4" height="13" rx="2.2" fill="url(#ogBars)" />
      <rect x="48.5" y="35" width="4.4" height="30" rx="2.2" fill="url(#ogBars)" />
      <rect x="55.5" y="40" width="4.4" height="20" rx="2.2" fill="url(#ogBars)" />
      <rect x="62.5" y="44.5" width="4.4" height="11" rx="2.2" fill="url(#ogBars)" />
      <rect x="69.3" y="47.6" width="4.4" height="4.8" rx="2.2" fill="url(#ogBars)" />
      <path
        d="M14 78 C22 66 36 58 50 58 C40 64 30 74 24 88 C18 88 14 84 14 78 Z"
        fill="#0f36de"
        opacity="0.55"
      />
    </svg>
  );
}
