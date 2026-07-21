/**
 * AzLens brand mark.
 *
 * A rounded-square (squircle) tile filled with the brand cyan→indigo→violet
 * gradient, holding a bold white "A" monogram whose counter frames a focal dot
 * — the "lens" that AzLens focuses through. App-icon friendly and legible at
 * every size used in the UI (24–44px).
 */
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient id per size so multiple logos on a page render correctly.
  const gid = `azlens-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      className={className}
      role="img"
      aria-label="AzLens"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="2"
          y1="2"
          x2="30"
          y2="30"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#22d3ee" />
          <stop offset="0.52" stopColor="#6366f1" />
          <stop offset="1" stopColor="#8b5cf6" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="8.5" fill={`url(#${gid})`} />
      {/* "A" monogram */}
      <path
        d="M9 23.5 L16 8 L23 23.5"
        fill="none"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M11.8 17.6 H20.2"
        stroke="#fff"
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      {/* focal point (the lens) */}
      <circle cx="16" cy="13.6" r="1.45" fill="#fff" />
    </svg>
  );
}
