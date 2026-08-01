// One-off screenshot generator for the README. Seeds a realistic conversation
// into localStorage, then captures the redesigned UI to ../docs/*.png.
// Usage (from chat-ui/, with the dev server running on :3000):
//   node scripts/capture-shots.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const docs = path.resolve(here, "..", "..", "docs");
const BASE = process.env.SHOT_BASE || "http://localhost:3000";

const now = Date.now();
const assistant = [
  "Here's a quick comparison and a retry helper.",
  "",
  "## Region comparison",
  "",
  "| Region | Latency (EU users) | AI services |",
  "| --- | --- | --- |",
  "| East US | Higher | Broadest |",
  "| West Europe | Low | Broad |",
  "",
  "**Recommendation:** use **West Europe** for EU-facing, latency-sensitive traffic.",
  "",
  "```ts",
  "export async function withRetry<T>(fn: () => Promise<T>, tries = 3): Promise<T> {",
  "  for (let i = 0; ; i++) {",
  "    try {",
  "      return await fn();",
  "    } catch (e) {",
  "      if (i >= tries - 1) throw e;",
  "      await new Promise((r) => setTimeout(r, 2 ** i * 200));",
  "    }",
  "  }",
  "}",
  "```",
].join("\n");

const seed = {
  "azlens.theme": "dark",
  "azlens.active": "demo-hero",
  "azlens.conversations": JSON.stringify([
    {
      id: "demo-hero",
      title: "Compare Azure regions for a new app",
      updatedAt: now,
      pinned: true,
      renamed: true,
    },
    {
      id: "c2",
      title: "Refactor the auth middleware",
      updatedAt: now - 3_600_000,
      renamed: true,
    },
    {
      id: "c3",
      title: "Draft the v0.4 release notes",
      updatedAt: now - 2 * 86_400_000,
      renamed: true,
    },
    {
      id: "c4",
      title: "KQL: failed sign-ins last 24h",
      updatedAt: now - 5 * 86_400_000,
      renamed: true,
    },
  ]),
  "azlens.messages.demo-hero": JSON.stringify([
    {
      id: "m1",
      role: "user",
      parts: [
        {
          type: "text",
          text: "Compare East US vs West Europe for latency-sensitive workloads, and show a quick TypeScript retry helper.",
        },
      ],
    },
    { id: "m2", role: "assistant", parts: [{ type: "text", text: assistant }] },
  ]),
  "azlens.projects": JSON.stringify([
    { id: "p1", name: "Platform migration", createdAt: now, order: 0 },
    { id: "p2", name: "Q3 cost review", createdAt: now, order: 1 },
  ]),
};

const shot = async (page, name) => {
  await page.screenshot({ path: path.join(docs, name), fullPage: false });
  console.log("saved", name);
};

const main = async () => {
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2,
  });
  await context.addInitScript((data) => {
    for (const [k, v] of Object.entries(data)) localStorage.setItem(k, v);
  }, seed);

  const page = await context.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForSelector(".markdown table", { timeout: 15000 });
  await page.waitForTimeout(600);

  // 1) Hero — dark mode, seeded conversation.
  await shot(page, "chat-ui-hero.png");

  // 2) Command palette.
  await page.keyboard.press("Control+K");
  await page.waitForSelector("input[placeholder*='Search chats']", {
    timeout: 5000,
  });
  await page.waitForTimeout(300);
  await shot(page, "chat-ui-palette.png");
  await page.keyboard.press("Escape");

  // 3) Projects modal.
  await page.getByRole("button", { name: "Manage" }).click();
  await page.waitForSelector(".projects-modal", { timeout: 5000 });
  await page.waitForTimeout(300);
  await shot(page, "chat-ui-projects.png");
  await page.keyboard.press("Escape");

  // 4) Artifacts panel (the seeded reply has a code block → one artifact).
  await page.getByRole("button", { name: "Artifacts" }).click();
  await page.waitForSelector(".artifacts-panel", { timeout: 5000 });
  await page.waitForTimeout(400);
  await shot(page, "chat-ui-artifacts.png");
  await page.keyboard.press("Escape");

  // 5) Collapsed icon rail.
  await page.getByRole("button", { name: /Collapse sidebar/i }).click();
  await page.waitForTimeout(400);
  await shot(page, "chat-ui-rail.png");
  await page.getByRole("button", { name: /Toggle sidebar/i }).click();

  // 6) Light mode, multi-chat. Toggle via the UI (a reload would re-apply the
  // seed's dark theme through addInitScript).
  await page.getByRole("button", { name: "Light mode" }).first().click();
  await page.waitForTimeout(500);
  await shot(page, "chat-ui-multichat.png");

  await browser.close();
  console.log("done →", docs);
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
