/**
 * Rough public list prices (USD per 1M tokens) used only to show an estimated
 * per-turn cost in the UI. Keep this as a best-effort guide — it is not billing
 * accurate. Local/self-hosted models are treated as free.
 */
type Price = { input: number; output: number };

// Matched by substring against the model id, longest match wins.
const PRICES: Record<string, Price> = {
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "gpt-4o": { input: 2.5, output: 10 },
  "o3-mini": { input: 1.1, output: 4.4 },
  "claude-3-5-haiku": { input: 0.8, output: 4 },
  "claude-3-5-sonnet": { input: 3, output: 15 },
  "claude-3-7-sonnet": { input: 3, output: 15 },
};

export type Usage = {
  promptTokens?: number | null;
  completionTokens?: number | null;
};

/**
 * Estimate the USD cost of a turn. Returns null when the model price is unknown
 * (e.g. a local model) or token counts are unavailable.
 */
export function estimateCost(
  model: string | undefined,
  usage: Usage | undefined
): number | null {
  if (!model || !usage) return null;
  const prompt = Number.isFinite(usage.promptTokens as number)
    ? (usage.promptTokens as number)
    : 0;
  const completion = Number.isFinite(usage.completionTokens as number)
    ? (usage.completionTokens as number)
    : 0;
  if (prompt === 0 && completion === 0) return null;

  const key = Object.keys(PRICES)
    .filter((k) => model.includes(k))
    .sort((a, b) => b.length - a.length)[0];
  if (!key) return null;

  const price = PRICES[key];
  const cost = (prompt / 1e6) * price.input + (completion / 1e6) * price.output;
  return Number.isFinite(cost) ? cost : null;
}
