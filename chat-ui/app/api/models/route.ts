/**
 * Lists the chat providers that are actually configured on the server (based on
 * which API keys are present), with a small set of selectable models each.
 */
export const runtime = "nodejs";

type Provider = { id: string; label: string; models: string[] };

/**
 * Queries an OpenAI-compatible /models endpoint (e.g. LM Studio, Ollama) for the
 * currently loaded model ids. Returns [] if the server is unreachable so the UI
 * degrades gracefully.
 */
async function discoverLocalModels(baseUrl: string): Promise<string[]> {
  try {
    const url = `${baseUrl.replace(/\/$/, "")}/models`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${process.env.LOCAL_OPENAI_API_KEY || "lm-studio"}`,
      },
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id);
  } catch {
    return [];
  }
}

/** Merge curated + discovered ids, de-duplicated, curated entries kept first. */
function mergeModels(curated: string[], discovered: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of [...curated, ...discovered]) {
    if (id && !seen.has(id)) {
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Discover OpenAI chat models via GET /v1/models. Returns [] on any failure. */
async function discoverOpenAiModels(): Promise<string[]> {
  try {
    const res = await fetch("https://api.openai.com/v1/models", {
      headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id)
      .filter((id) => /^(gpt|o[134])/.test(id))
      .filter(
        (id) =>
          !/(embedding|whisper|tts|audio|dall|image|moderation|realtime|search|transcribe)/.test(
            id
          )
      )
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

/** Discover Anthropic models via GET /v1/models. Returns [] on any failure. */
async function discoverAnthropicModels(): Promise<string[]> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": process.env.ANTHROPIC_API_KEY ?? "",
        "anthropic-version": "2023-06-01",
      },
      signal: AbortSignal.timeout(2500),
    });
    if (!res.ok) return [];
    const json = (await res.json()) as { data?: { id?: string }[] };
    return (json.data ?? [])
      .map((m) => m.id)
      .filter((id): id is string => !!id)
      .filter((id) => id.startsWith("claude"))
      .sort((a, b) => b.localeCompare(a));
  } catch {
    return [];
  }
}

export async function GET(): Promise<Response> {
  const providers: Provider[] = [];

  if (process.env.AZURE_OPENAI_API_KEY) {
    providers.push({
      id: "azure",
      label: "Azure OpenAI",
      models: [process.env.AZURE_OPENAI_DEPLOYMENT ?? "gpt-4o"],
    });
  }
  if (process.env.OPENAI_API_KEY) {
    const curated = [
      "gpt-5.6-sol",
      "gpt-5.6-terra",
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
    ];
    const discovered = await discoverOpenAiModels();
    providers.push({
      id: "openai",
      label: "OpenAI",
      models: mergeModels(curated, discovered),
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    const curated = [
      "claude-opus-4-8",
      "claude-sonnet-5",
      "fable-5",
      "claude-3-5-sonnet-latest",
      "claude-3-5-haiku-latest",
    ];
    const discovered = await discoverAnthropicModels();
    providers.push({
      id: "anthropic",
      label: "Anthropic",
      models: mergeModels(curated, discovered),
    });
  }
  if (process.env.LOCAL_OPENAI_BASE_URL) {
    const baseUrl = process.env.LOCAL_OPENAI_BASE_URL;
    const discovered = await discoverLocalModels(baseUrl);
    const fallback = process.env.LOCAL_MODEL || "local-model";
    providers.push({
      id: "local",
      label: process.env.LOCAL_LABEL || "Local (LM Studio)",
      models: discovered.length > 0 ? discovered : [fallback],
    });
  }

  // Prepend an "Auto" option that routes by task complexity (cheap model for
  // simple prompts, powerful model for complex ones). Only useful when at least
  // one real provider is configured.
  if (providers.length > 0) {
    providers.unshift({
      id: "auto",
      label: "Auto",
      models: ["route by complexity"],
    });
  }

  return Response.json(providers);
}
