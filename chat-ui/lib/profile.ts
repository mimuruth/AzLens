/**
 * User-profile display helpers (pure, unit-tested). Initials fall back from
 * display name → email local-part; a stable colour is derived from the seed so
 * avatars are consistent per user without storing anything.
 */

export function initialsFrom(
  name?: string | null,
  email?: string | null
): string {
  const src = (name ?? "").trim();
  if (src) {
    const parts = src.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return src.slice(0, 2).toUpperCase();
  }
  const e = (email ?? "").trim();
  if (e) {
    const local = e.split("@")[0];
    const segs = local.split(/[.\-_]+/).filter(Boolean);
    if (segs.length >= 2) return (segs[0][0] + segs[1][0]).toUpperCase();
    return (local.slice(0, 2) || "?").toUpperCase();
  }
  return "?";
}

/** Deterministic HSL colour from a seed string (for initials avatars). */
export function colorFrom(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const hue = h % 360;
  return `hsl(${hue} 52% 45%)`;
}

export type Profile = {
  authenticated: boolean;
  name: string | null;
  email: string | null;
  picture: string | null;
  provider: string | null;
  /** Configured Easy Auth providers for sign-in buttons (e.g. ["aad","github"]). */
  providers: string[];
};

export const PROVIDER_LABELS: Record<string, string> = {
  aad: "Microsoft",
  github: "GitHub",
  google: "Google",
};
