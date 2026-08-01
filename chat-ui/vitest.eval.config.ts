import { defineConfig } from "vitest/config";

// Opt-in, live-model response eval. Run with `npm run eval:llm`. Kept separate
// from the default `npm test` so CI never calls a real model. Loads .env.local.
export default defineConfig({
  test: {
    include: ["lib/eval/**/*.llm.test.ts"],
    setupFiles: ["./lib/eval/load-env.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
