import { test, expect } from "@playwright/test";

/**
 * UI-only end-to-end flows — no model provider or MCP server required. Each
 * test runs in a fresh browser context (clean localStorage), so the app starts
 * with a single seeded "New chat".
 */

test("loads with the greeting and composer", async ({ page }) => {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: /how can i help you today/i })
  ).toBeVisible();
  await expect(page.getByPlaceholder("Message AzLens…")).toBeVisible();
  // The agent picker is always available (it needs no API key).
  await expect(page.locator("select.agent-picker")).toBeVisible();
});

test("creates a new chat from the sidebar", async ({ page }) => {
  await page.goto("/");
  const items = page.locator(".chat-item");
  await expect(items).toHaveCount(1);
  await page.getByRole("button", { name: "New chat" }).first().click();
  await expect(page.locator(".chat-item")).toHaveCount(2);
});

test("opens the command palette and filters actions", async ({ page }) => {
  await page.goto("/");
  await page.keyboard.press("Control+K");
  const paletteInput = page.getByPlaceholder("Search chats or run a command…");
  await expect(paletteInput).toBeVisible();
  await paletteInput.fill("toggle");
  await expect(page.getByText("Toggle dark mode")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(paletteInput).toBeHidden();
});

test("saves per-conversation instructions", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Instructions" }).click();
  const box = page.getByPlaceholder(/Always answer in TypeScript/i);
  await expect(box).toBeVisible();
  await box.fill("Answer in French.");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  // Reopen — the saved text should be restored.
  await page.getByRole("button", { name: "Instructions" }).click();
  await expect(
    page.getByPlaceholder(/Always answer in TypeScript/i)
  ).toHaveValue("Answer in French.");
});
