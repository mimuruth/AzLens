import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright E2E config for the chat UI. These tests exercise UI flows that
 * don't require a model provider (greeting, new chat, command palette, per-
 * conversation instructions), so they run without any API keys.
 *
 * Locally the tests reuse a dev server already running on :3000; in CI they
 * start `npm run dev` themselves. Browsers must be installed once with
 * `npx playwright install --with-deps chromium`.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
