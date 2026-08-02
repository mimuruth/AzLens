"use client";

import { useState } from "react";
import { initialsFrom, colorFrom } from "@/lib/profile";

/** A user avatar: the profile picture when available, else coloured initials. */
export default function Avatar({
  name,
  email,
  picture,
  size = 28,
}: {
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  size?: number;
}) {
  const [broken, setBroken] = useState(false);
  const initials = initialsFrom(name, email);
  const seed = name || email || initials;

  if (picture && !broken) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        className="avatar avatar-img"
        src={picture}
        alt={name ?? "User"}
        width={size}
        height={size}
        onError={() => setBroken(true)}
        referrerPolicy="no-referrer"
      />
    );
  }

  return (
    <span
      className="avatar avatar-initials"
      style={{
        width: size,
        height: size,
        background: colorFrom(seed),
        fontSize: Math.round(size * 0.4),
      }}
      aria-label={name ?? "User"}
      title={name ?? "User"}
    >
      {initials}
    </span>
  );
}
