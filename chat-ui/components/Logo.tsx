/**
 * AzLens brand mark: a thin-line camera aperture (lens) in the coral accent —
 * a clean monoline style similar to modern AI product logos.
 */
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="#d97757"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="AzLens"
    >
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
