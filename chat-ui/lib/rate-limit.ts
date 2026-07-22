import "server-only";

/**
 * Tiny in-memory sliding-window rate limiter. Good enough for a single-instance
 * app or per-replica throttling; swap for Redis if you need cluster-wide limits.
 * Disabled entirely when the limit is 0.
 */
const hits = new Map<string, number[]>();

export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): { ok: boolean; retryAfter: number } {
  if (limit <= 0) return { ok: true, retryAfter: 0 };
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    hits.set(key, recent);
    const retryAfter = Math.ceil((windowMs - (now - recent[0])) / 1000);
    return { ok: false, retryAfter: Math.max(1, retryAfter) };
  }
  recent.push(now);
  hits.set(key, recent);
  return { ok: true, retryAfter: 0 };
}

/** Best-effort caller identity from Easy Auth headers or forwarded IP. */
export function callerKey(headers: Headers): string {
  return (
    headers.get("x-ms-client-principal-id") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
