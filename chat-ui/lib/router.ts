import type { CoreMessage } from "ai";

/**
 * Lightweight, zero-cost complexity router.
 *
 * It inspects the latest user message with a set of heuristics and decides
 * whether the request is "simple" (route to a cheap/fast model) or "complex"
 * (route to a more capable, more expensive model). No extra LLM call is made,
 * so routing adds no latency or cost.
 */

export type Tier = "simple" | "complex";
export type ProviderId = "azure" | "openai" | "anthropic" | "local";

export type Complexity = {
  tier: Tier;
  score: number;
  signals: string[];
};

const COMPLEX_PATTERNS: [RegExp, string][] = [
  [
    /```|\b(SELECT|FROM|WHERE|JOIN)\b|(^|\s)(def |class |function |import |const |async )/im,
    "code",
  ],
  [
    /\b(refactor|architect|design|implement|optimi[sz]e|debug|diagnos|analyz|compare|trade-?offs?|migrat\w+|algorithm|proof|prove|derive|strategy|root cause|scal\w+|concurren\w+|performance)\b/i,
    "reasoning",
  ],
  [
    /\b(step[- ]by[- ]step|in detail|thorough|comprehensive|end[- ]to[- ]end|edge cases?)\b/i,
    "depth",
  ],
  [/\b(why|how come|explain|walk me through|reason about)\b/i, "explanation"],
  [
    /\b(multiple|several|each|all of|both)\b.*\b(files?|resources?|steps?|options?)\b/i,
    "multi-part",
  ],
];

/** Classify a single piece of text as simple or complex. */
export function classifyComplexity(text: string): Complexity {
  const t = (text || "").trim();
  const words = t.length === 0 ? 0 : t.split(/\s+/).length;
  const signals: string[] = [];
  let score = 0;

  for (const [pattern, label] of COMPLEX_PATTERNS) {
    if (pattern.test(t)) {
      score += 2;
      signals.push(label);
    }
  }

  if (words > 80) {
    score += 2;
    signals.push("long");
  } else if (words > 40) {
    score += 1;
    signals.push("medium-length");
  }

  const questions = (t.match(/\?/g) ?? []).length;
  if (questions >= 2) {
    score += 1;
    signals.push("multi-question");
  }

  // Very short greetings / acknowledgements are always simple.
  if (words > 0 && words <= 6 && signals.length === 0) {
    signals.push("short");
  }

  const tier: Tier = score >= 3 ? "complex" : "simple";
  return { tier, score, signals };
}

/** Extract the text of the most recent user message. */
export function lastUserText(messages: CoreMessage[] | undefined): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "user") continue;
    if (typeof m.content === "string") return m.content;
    if (Array.isArray(m.content)) {
      return m.content
        .map((part) =>
          typeof part === "object" && part && "text" in part
            ? String((part as { text: unknown }).text ?? "")
            : ""
        )
        .join(" ")
        .trim();
    }
  }
  return "";
}

function availableProviders(): ProviderId[] {
  const p: ProviderId[] = [];
  if (process.env.AZURE_OPENAI_API_KEY) p.push("azure");
  if (process.env.OPENAI_API_KEY) p.push("openai");
  if (process.env.ANTHROPIC_API_KEY) p.push("anthropic");
  if (process.env.LOCAL_OPENAI_BASE_URL) p.push("local");
  return p;
}

// Model chosen for each provider at each tier.
const POWERFUL: Record<ProviderId, string> = {
  anthropic: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
  openai: "gpt-4o",
  azure: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
  local: process.env.LOCAL_MODEL || "local-model",
};
const CHEAP: Record<ProviderId, string> = {
  local: process.env.LOCAL_MODEL || "local-model",
  openai: "gpt-4o-mini",
  anthropic: "claude-3-5-haiku-latest",
  azure: process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o",
};

// Preference order when picking across configured providers.
// Complex work favours the most capable cloud models; simple work favours the
// cheapest option (a free local model first, if one is configured).
const POWERFUL_ORDER: ProviderId[] = ["anthropic", "openai", "azure", "local"];
const CHEAP_ORDER: ProviderId[] = ["local", "openai", "anthropic", "azure"];

function parseOverride(
  raw: string | undefined
): { provider: ProviderId; model: string } | null {
  if (!raw) return null;
  const [provider, ...rest] = raw.split(":");
  const model = rest.join(":").trim();
  const p = provider?.trim().toLowerCase();
  if (!p || !model) return null;
  if (p === "azure" || p === "openai" || p === "anthropic" || p === "local") {
    return { provider: p, model };
  }
  return null;
}

export type RouteDecision = {
  provider: ProviderId;
  model: string;
  tier: Tier;
  reason: string;
};

/**
 * Given the latest user text, classify complexity and pick a concrete
 * provider + model from whatever is configured on the server.
 *
 * Overridable with AUTO_SIMPLE / AUTO_COMPLEX env vars in the form
 * "provider:model" (e.g. AUTO_COMPLEX="anthropic:claude-3-5-sonnet-latest").
 *
 * Pass `exclude` to skip providers (used for fallback when one is unreachable).
 */
export function resolveAutoModel(
  text: string,
  exclude: ProviderId[] = []
): RouteDecision {
  const { tier, signals } = classifyComplexity(text);
  const avail = availableProviders().filter((p) => !exclude.includes(p));

  const override = parseOverride(
    tier === "complex" ? process.env.AUTO_COMPLEX : process.env.AUTO_SIMPLE
  );
  if (override && avail.includes(override.provider)) {
    return {
      provider: override.provider,
      model: override.model,
      tier,
      reason: `${tier} · override`,
    };
  }

  const order = tier === "complex" ? POWERFUL_ORDER : CHEAP_ORDER;
  const table = tier === "complex" ? POWERFUL : CHEAP;
  const provider = order.find((p) => avail.includes(p)) ?? avail[0];

  if (!provider) {
    throw new Error(
      "No chat provider configured for auto-routing. Set at least one of " +
        "AZURE_OPENAI_API_KEY, OPENAI_API_KEY, ANTHROPIC_API_KEY, or LOCAL_OPENAI_BASE_URL."
    );
  }

  const reasonSignals = signals.length ? signals.join(", ") : "brief request";
  return {
    provider,
    model: table[provider],
    tier,
    reason: `${tier} (${reasonSignals})`,
  };
}

/**
 * Quick reachability probe. Only the local server can realistically be
 * configured-but-down (cloud providers are assumed reachable when a key is
 * set), so this checks the local OpenAI-compatible /models endpoint.
 */
export async function isProviderReachable(
  provider: ProviderId
): Promise<boolean> {
  if (provider !== "local") return true;
  const base = process.env.LOCAL_OPENAI_BASE_URL;
  if (!base) return false;
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/models`, {
      headers: {
        Authorization: `Bearer ${process.env.LOCAL_OPENAI_API_KEY || "lm-studio"}`,
      },
      signal: AbortSignal.timeout(1500),
    });
    return res.ok;
  } catch {
    return false;
  }
}
