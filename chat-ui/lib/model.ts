import type { LanguageModel } from "ai";
import { createAzure } from "@ai-sdk/azure";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";

/**
 * Selects the chat model provider from environment variables.
 *
 * Choose explicitly with CHAT_PROVIDER=azure|openai|anthropic|local, otherwise
 * the first provider with a configured API key wins
 * (azure → openai → anthropic → local).
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
      // `compatibility: "strict"` makes the SDK send
      // `stream_options: { include_usage: true }`, so token usage is reported
      // for streamed responses (needed for the usage/cost footer).
      const openai = createOpenAI({
        apiKey: process.env.OPENAI_API_KEY ?? "",
        compatibility: "strict",
      });
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
    case "local": {
      // Any OpenAI-compatible server (LM Studio, Ollama, vLLM, llama.cpp).
      // LM Studio default: http://localhost:1234/v1 (no real key required).
      const local = createOpenAI({
        baseURL:
          process.env.LOCAL_OPENAI_BASE_URL || "http://localhost:1234/v1",
        apiKey: process.env.LOCAL_OPENAI_API_KEY || "lm-studio",
      });
      return local(override?.model || process.env.LOCAL_MODEL || "local-model");
    }
    default:
      throw new Error(
        "No chat provider configured. Set one of AZURE_OPENAI_API_KEY, " +
          "OPENAI_API_KEY, ANTHROPIC_API_KEY, or LOCAL_OPENAI_BASE_URL " +
          "(optionally with CHAT_PROVIDER)."
      );
  }
}

function autoDetectProvider(): string {
  if (process.env.AZURE_OPENAI_API_KEY) return "azure";
  if (process.env.OPENAI_API_KEY) return "openai";
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.LOCAL_OPENAI_BASE_URL) return "local";
  return "";
}
