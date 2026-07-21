/**
 * AzLens brand mark: a monoline camera aperture (lens) drawn with a warm
 * coral→violet gradient stroke — a clean, modern AI-product style.
 */
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  // Unique gradient id per instance so multiple logos on a page render correctly.
  const gid = `azlens-grad-${size}`;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={`url(#${gid})`}
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="AzLens"
    >
      <defs>
        <linearGradient
          id={gid}
          x1="3"
          y1="3"
          x2="21"
          y2="21"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#e6a07f" />
          <stop offset="0.55" stopColor="#d97757" />
          <stop offset="1" stopColor="#8b6bd9" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="10" />
      <path d="M14.31 8l5.74 9.94" />
      <path d="M9.69 8h11.48" />
      <path d="M7.38 12l5.74-9.94" />
      <path d="M9.69 16L3.95 6.06" />
      <path d="M14.31 16H2.83" />
      <path d="M16.62 12l-5.74 9.94" />
    </svg>
  );
}
