import type { Tier } from "../router";

/**
 * Labeled prompts for evaluating the complexity router. Each case is labeled by
 * intended routing (a human's view of whether it deserves the cheap or the
 * powerful model). Cases marked `hard: true` are known router weaknesses we
 * accept for now — they document where the heuristic disagrees with intent.
 *
 * Grow this dataset over time; the eval harness reports accuracy and surfaces
 * every failing case so regressions are caught in CI.
 */
export type RouterCase = {
  prompt: string;
  expected: Tier;
  hard?: boolean;
  note?: string;
};

export const ROUTER_CASES: RouterCase[] = [
  // --- simple: greetings, quick facts, single short asks ---
  { prompt: "hi there", expected: "simple" },
  { prompt: "thanks, that helps!", expected: "simple" },
  { prompt: "What's the capital of France?", expected: "simple" },
  { prompt: "Convert 10 miles to kilometers.", expected: "simple" },
  { prompt: "What time is it in Tokyo right now?", expected: "simple" },
  { prompt: "Rename config.yaml to config.yml.", expected: "simple" },
  { prompt: "Give me a synonym for 'fast'.", expected: "simple" },
  { prompt: "Translate 'good morning' into Spanish.", expected: "simple" },
  { prompt: "List three popular JavaScript frameworks.", expected: "simple" },
  { prompt: "How many ounces are in a pound?", expected: "simple" },
  { prompt: "Set the request timeout to 30 seconds.", expected: "simple" },
  { prompt: "Summarize this paragraph in one line.", expected: "simple" },
  { prompt: "Explain what an API is.", expected: "simple" },
  { prompt: "Show me today's date.", expected: "simple" },

  // --- complex: code, multi-step reasoning, depth, long/multi-part ---
  {
    prompt:
      "Refactor the auth middleware and explain the trade-offs of each approach.",
    expected: "complex",
  },
  {
    prompt:
      "Design a scalable, concurrent job queue and walk me through the algorithm step by step.",
    expected: "complex",
  },
  {
    prompt:
      "Why does this SQL query do a full table scan, and how can I optimize it?",
    expected: "complex",
  },
  {
    prompt:
      "Compare East US vs West Europe and analyze the trade-offs across multiple options for a latency-sensitive app.",
    expected: "complex",
  },
  {
    prompt:
      "Implement a retry helper with exponential backoff in TypeScript, and cover the edge cases thoroughly.",
    expected: "complex",
  },
  {
    prompt:
      "Diagnose the root cause of this memory leak, explain why it happens, and propose a strategy to fix it.",
    expected: "complex",
  },
  {
    prompt:
      "```python\nfor i in range(10):\n    print(i)\n```\nOptimize this and explain the time complexity.",
    expected: "complex",
  },
  {
    prompt:
      "Walk me through migrating this service from EC2 to Container Apps, step by step, covering edge cases.",
    expected: "complex",
  },
  {
    prompt: "How should I architect this? What are the trade-offs?",
    expected: "complex",
  },
  {
    prompt:
      "Derive the time complexity of quicksort and prove the average case, step by step.",
    expected: "complex",
  },
  {
    prompt:
      "We need to build an end-to-end ingestion pipeline that reads files from blob storage, chunks them, " +
      "generates embeddings, and writes them to a search index. Walk through the design, the failure modes, " +
      "how to make it idempotent, how to backfill existing data, and how to monitor throughput and errors " +
      "in production so we can alert on regressions before users notice them.",
    expected: "complex",
  },

  // --- known-hard: lone action verb, too short to score as complex ---
  {
    prompt: "Debug this stack trace.",
    expected: "complex",
    hard: true,
    note: "short lone-verb request the heuristic scores as simple",
  },
];
