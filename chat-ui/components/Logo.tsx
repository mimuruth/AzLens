"use client";

import { useId } from "react";

/**
 * AzLens brand mark: a stylized camera aperture (lens) in a gradient rounded
 * square — a modern app-icon style logo.
 */
export default function Logo({
  size = 24,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const gid = useId();
  const blades = [0, 60, 120, 180, 240, 300];

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="AzLens"
    >
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e58a6b" />
          <stop offset="1" stopColor="#c65f3f" />
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="29" height="29" rx="8.5" fill={`url(#${gid})`} />
      <g fill="#fff7f2">
        {blades.map((a) => (
          <path key={a} transform={`rotate(${a} 16 16)`} d="M16 16 L17.5 6 L22.8 9.1 Z" />
        ))}
      </g>
      <circle cx="16" cy="16" r="2.3" fill={`url(#${gid})`} />
    </svg>
  );
}
