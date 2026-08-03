import { createHash } from "node:crypto";
import { getRedis } from "./redis";

/**
 * Optional exact-match response cache (Redis). Keyed by a hash of the agent,
 * model, system prompt, and message list, so byte-identical requests can skip
 * the model call. Opt-in via RESPONSE_CACHE_TTL_SEC (and REDIS_URL); disabled
 * by default. `cacheKey` is pure and unit-tested.
 */

export type CacheKeyInput = {
  agentId: string;
  provider?: string;
  model?: string;
  system: string;
  messages: unknown;
};

export function cacheKey(input: CacheKeyInput): string {
  const stable = JSON.stringify({
    a: input.agentId,
    p: input.provider ?? "",
    m: input.model ?? "",
    s: input.system,
    msgs: input.messages,
  });
  return `resp:${createHash("sha256").update(stable).digest("hex")}`;
}

export async function cacheGet(key: string): Promise<string | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

export async function cacheSet(
  key: string,
  value: string,
  ttlSec: number
): Promise<void> {
  if (ttlSec <= 0) return;
  const redis = await getRedis();
  if (!redis) return;
  try {
    await redis.set(key, value, "EX", ttlSec);
  } catch {
    /* cache is best-effort */
  }
}
