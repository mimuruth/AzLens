import type { Redis } from "ioredis";

/**
 * Shared ioredis client, lazily created from REDIS_URL. Returns null when Redis
 * is not configured or can't be reached, so callers degrade gracefully. Kept
 * free of `server-only` so pure consumers (and their tests) can import it.
 */

// undefined = not yet initialised, null = no Redis configured/available.
let redisClient: Redis | null | undefined;

export async function getRedis(): Promise<Redis | null> {
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
      console.warn("Redis error (features fall back gracefully):", err.message)
    );
    redisClient = client;
    return client;
  } catch (err) {
    console.warn("Redis init failed; continuing without it:", err);
    redisClient = null;
    return null;
  }
}
