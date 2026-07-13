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
    providers.push({
      id: "openai",
      label: "OpenAI",
      models: ["gpt-4o", "gpt-4o-mini", "o3-mini"],
    });
  }
  if (process.env.ANTHROPIC_API_KEY) {
    providers.push({
      id: "anthropic",
      label: "Anthropic",
      models: ["claude-3-5-sonnet-latest", "claude-3-5-haiku-latest"],
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

  return Response.json(providers);
}
