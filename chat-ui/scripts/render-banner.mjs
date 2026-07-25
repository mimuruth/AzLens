// Renders scripts/banner.html to ../docs/banner.png (retro pixel README banner).
// Usage (from chat-ui/): node scripts/render-banner.mjs
import { chromium } from "@playwright/test";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";

const here = path.dirname(fileURLToPath(import.meta.url));
const src = pathToFileURL(path.join(here, "banner.html")).href;
const out = path.resolve(here, "..", "..", "docs", "banner.png");

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 2 });
await page.goto(src, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(400);
const el = await page.$("#banner");
await el.screenshot({ path: out });
await browser.close();
console.log("saved", out);
