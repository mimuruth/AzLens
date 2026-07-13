/**
 * Lists the chat providers that are actually configured on the server (based on
 * which API keys are present), with a small set of selectable models each.
 */
export const runtime = "nodejs";

type Provider = { id: string; label: string; models: string[] };

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

  return Response.json(providers);
}
