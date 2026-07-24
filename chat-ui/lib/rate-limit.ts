import "server-only";
import type { Redis } from "ioredis";

/**
 * Per-caller rate limiter for /api/chat.
 *
 * Uses a shared Redis store when REDIS_URL is set (correct across replicas);
 * otherwise falls back to an in-memory sliding window (per-replica). If Redis
 * is configured but unreachable, requests fail open to the in-memory limiter so
 * availability is preserved. Disabled entirely when the limit is 0.
 */
const hits = new Map<string, number[]>();

function inMemory(
  key: string,
  limit: number,
  windowMs: number
): { ok: boolean; retryAfter: number } {
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

// undefined = not yet initialised, null = no Redis configured/available.
let redisClient: Redis | null | undefined;

async function getRedis(): Promise<Redis | null> {
  if (redisClient !== undefined) return redisClient;
  const url = process.env.REDIS_URL;
  if (!url) {
    redisClient = null;
    return null;
  }
  try {
    const { default: RedisCtor } = await import("ioredis");
    const client = new RedisCtor(url, {
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      lazyConnect: false,
    });
    client.on("error", (err) =>
      console.warn(
        "Redis error (rate limit falls back to memory):",
        err.message
      )
    );
    redisClient = client;
    return client;
  } catch (err) {
    console.warn("Redis init failed; using in-memory rate limit:", err);
    redisClient = null;
    return null;
  }
}

export async function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000
): Promise<{ ok: boolean; retryAfter: number }> {
  if (limit <= 0) return { ok: true, retryAfter: 0 };

  const redis = await getRedis();
  if (redis) {
    try {
      const windowSec = Math.ceil(windowMs / 1000);
      const bucket = Math.floor(Date.now() / windowMs);
      const rkey = `rl:${key}:${bucket}`;
      const count = await redis.incr(rkey);
      if (count === 1) await redis.expire(rkey, windowSec);
      if (count > limit) {
        const ttl = await redis.ttl(rkey);
        return { ok: false, retryAfter: Math.max(1, ttl) };
      }
      return { ok: true, retryAfter: 0 };
    } catch (err) {
      console.warn("Redis rate-limit error; falling back to memory:", err);
      return inMemory(key, limit, windowMs);
    }
  }
  return inMemory(key, limit, windowMs);
}

/** Best-effort caller identity from Easy Auth headers or forwarded IP. */
export function callerKey(headers: Headers): string {
  return (
    headers.get("x-ms-client-principal-id") ||
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    "local"
  );
}
