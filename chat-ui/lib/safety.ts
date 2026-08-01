/**
 * Input moderation / guardrails. Prefers Azure AI Content Safety when
 * configured (CONTENT_SAFETY_ENDPOINT), otherwise falls back to a local
 * heuristic that flags prompt-injection and a few high-signal harmful patterns.
 * `screenText` is pure and unit-tested; `moderateText` adds the network path.
 */

export type Screen = {
  flagged: boolean;
  categories: string[];
  reason?: string;
};
export type Moderation = {
  allowed: boolean;
  categories: string[];
  reason?: string;
  source: "azure" | "heuristic";
};

const INJECTION_PATTERNS: RegExp[] = [
  /ignore (?:all |any )?(?:the |your )?(?:previous|prior|above|earlier) (?:instructions|prompts?)/i,
  /disregard (?:the |your )?(?:system|previous|above) (?:prompt|instructions)/i,
  /(?:reveal|show|print|repeat|output) (?:me )?(?:your |the )?(?:system prompt|initial instructions|hidden prompt)/i,
  /you are now (?:in )?(?:developer|dan|jailbreak|god) mode/i,
  /pretend (?:you are|to be) (?:an? )?(?:unrestricted|uncensored|jailbroken)/i,
  /\bDAN\b.*\b(mode|jailbreak)\b/i,
];

const HARM_PATTERNS: [RegExp, string][] = [
  [
    /\bhow to (?:make|build|synthesi[sz]e) (?:a )?(?:bomb|explosive|nerve agent)\b/i,
    "violence",
  ],
  [
    /\b(?:kill|end) (?:myself|my life)\b|\bhow to (?:commit )?suicide\b/i,
    "self_harm",
  ],
];

/** Pure, deterministic local screen — no network. */
export function screenText(text: string): Screen {
  const t = text ?? "";
  const categories: string[] = [];
  if (INJECTION_PATTERNS.some((r) => r.test(t)))
    categories.push("prompt_injection");
  for (const [re, label] of HARM_PATTERNS) {
    if (re.test(t) && !categories.includes(label)) categories.push(label);
  }
  return {
    flagged: categories.length > 0,
    categories,
    reason: categories.length
      ? `Local safety heuristic flagged: ${categories.join(", ")}.`
      : undefined,
  };
}

const AZURE_CATEGORIES = ["Hate", "SelfHarm", "Sexual", "Violence"];

/** Call Azure AI Content Safety text:analyze; returns flagged categories. */
async function analyzeAzure(
  endpoint: string,
  text: string
): Promise<{ categories: string[] }> {
  const threshold = Number(process.env.CONTENT_SAFETY_THRESHOLD ?? 4);
  const url =
    endpoint.replace(/\/$/, "") +
    "/contentsafety/text:analyze?api-version=2024-09-01";

  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  const key = process.env.CONTENT_SAFETY_KEY;
  if (key) {
    headers["Ocp-Apim-Subscription-Key"] = key;
  } else {
    const { DefaultAzureCredential } = await import("@azure/identity");
    const token = await new DefaultAzureCredential().getToken(
      "https://cognitiveservices.azure.com/.default"
    );
    if (!token) throw new Error("No Content Safety credential.");
    headers["Authorization"] = `Bearer ${token.token}`;
  }

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify({
      text: text.slice(0, 10000),
      categories: AZURE_CATEGORIES,
      outputType: "FourSeverityLevels",
    }),
  });
  if (!res.ok) throw new Error(`Content Safety HTTP ${res.status}`);
  const json = (await res.json()) as {
    categoriesAnalysis?: { category: string; severity: number }[];
  };
  const flagged = (json.categoriesAnalysis ?? [])
    .filter((c) => (c.severity ?? 0) >= threshold)
    .map((c) => c.category.toLowerCase());
  return { categories: flagged };
}

/**
 * Moderate a piece of text. Injection is always screened locally; when Azure
 * Content Safety is configured it also checks harmful-content categories. On
 * any network error it degrades to the local heuristic (fail-open by design so
 * an outage doesn't take the app down — tune per your risk posture).
 */
export async function moderateText(text: string): Promise<Moderation> {
  const heur = screenText(text);
  const endpoint = process.env.CONTENT_SAFETY_ENDPOINT;
  if (!endpoint) {
    return {
      allowed: !heur.flagged,
      categories: heur.categories,
      reason: heur.reason,
      source: "heuristic",
    };
  }
  try {
    const azure = await analyzeAzure(endpoint, text);
    const categories = [...new Set([...heur.categories, ...azure.categories])];
    const allowed = categories.length === 0;
    return {
      allowed,
      categories,
      reason: allowed
        ? undefined
        : `Blocked categories: ${categories.join(", ")}.`,
      source: "azure",
    };
  } catch {
    return {
      allowed: !heur.flagged,
      categories: heur.categories,
      reason: heur.reason,
      source: "heuristic",
    };
  }
}
