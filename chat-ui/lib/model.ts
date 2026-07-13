import type { LanguageModel } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Selects the chat model provider from environment variables.
 *
 * Choose explicitly with CHAT_PROVIDER=azure|openai|anthropic, otherwise the
 * first provider with a configured API key wins (azure → openai → anthropic).
 */
export function getModel(override?: {
  provider?: string;
  model?: string;
}): LanguageModel {
  const provider =
    (override?.provider || process.env.CHAT_PROVIDER || "").toLowerCase() ||
    autoDetectProvider();

  switch (provider) {
    case "azure": {
      const azure = createAzure({
        resourceName: process.env.AZURE_OPENAI_RESOURCE_NAME ?? "",
        apiKey: process.env.AZURE_OPENAI_API_KEY ?? "",
        apiVersion: process.env.AZURE_OPENAI_API_VERSION ?? "2024-10-21",
      });
      return azure(
        override?.model || process.env.AZURE_OPENAI_DEPLOYMENT || "gpt-4o"
      );
    }
    case "openai": {
      const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });
      return openai(override?.model || process.env.OPENAI_MODEL || "gpt-4o");
    }
    case "anthropic": {
      const anthropic = createAnthropic({
        apiKey: process.env.ANTHROPIC_API_KEY ?? "",
      });
      return anthropic(
        override?.model ||
          process.env.ANTHROPIC_MODEL ||
          "claude-3-5-sonnet-latest"
      );
    }
    default:
      throw new Error(
        "No chat provider configured. Set one of AZURE_OPENAI_API_KEY, " +
          "OPENAI_API_KEY, or ANTHROPIC_API_KEY (optionally with CHAT_PROVIDER)."
      );
  }
}

function autoDetectProvider(): string {
  if (process.env.AZURE_OPENAI_API_KEY) return "azure";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  return "";
}
