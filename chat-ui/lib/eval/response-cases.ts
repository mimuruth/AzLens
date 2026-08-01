import type { ResponseCase } from "./response-eval";

/**
 * Response-eval cases: prompts with assertions on the model's output. Keep them
 * cheap and provider-agnostic (short answers, temperature 0). Grow as needed.
 */
export const RESPONSE_CASES: ResponseCase[] = [
  {
    name: "factual — capital of France",
    prompt: "What is the capital of France? Answer with just the city name.",
    assertions: [
      { type: "contains", value: "Paris", ci: true },
      { type: "notContains", value: "sorry", ci: true },
    ],
  },
  {
    name: "instruction following — JSON only",
    system: "Respond with a single JSON object and nothing else.",
    prompt: 'Return a JSON object with keys "city" and "country" for Tokyo.',
    assertions: [
      { type: "json", keys: ["city", "country"] },
      { type: "contains", value: "Tokyo", ci: true },
    ],
  },
  {
    name: "concise — one word answer",
    prompt: "In one word, what colour is a clear daytime sky?",
    assertions: [{ type: "contains", value: "blue", ci: true }],
  },
  {
    name: "code — TypeScript add function",
    prompt:
      "Write a TypeScript function named add that returns the sum of two numbers. Reply with only a fenced code block.",
    assertions: [
      { type: "regex", value: "function\\s+add", flags: "i" },
      { type: "contains", value: "```" },
    ],
  },
  {
    name: "grounded — region recommendation (judge)",
    system:
      "Context: For EU users, West Europe has lower latency than East US. " +
      "Answer using only this context.",
    prompt:
      "For a latency-sensitive app serving EU users, which Azure region should I pick and why?",
    assertions: [
      { type: "contains", value: "West Europe", ci: true },
      {
        type: "judge",
        rubric:
          "The answer recommends West Europe for EU users and does not recommend East US.",
      },
    ],
  },
];
