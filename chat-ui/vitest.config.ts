import { defineConfig } from "vitest/config";

/**
 * Vitest scopes to the unit tests under lib/. The Playwright E2E specs live in
 * tests/e2e and are excluded here so `npm test` never tries to run them.
 */
export default defineConfig({
  test: {
    include: ["lib/**/*.test.ts"],
    exclude: ["node_modules", "tests/e2e/**", ".next/**"],
  },
});
