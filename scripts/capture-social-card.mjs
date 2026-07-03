// Regenerate the social-sharing card (public/social-card.jpg).
// Usage: start the dev server (npm run dev), then: node scripts/capture-social-card.mjs
import { chromium } from "@playwright/test";

const OUT = process.argv[2] ?? "public/social-card.jpg";
const URL = process.env.CARD_URL ?? "http://localhost:5173/";

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 }, // standard og:image aspect
  deviceScaleFactor: 2,
});
await page.goto(URL);
await page.waitForFunction(() => window.__APP_READY__ === true, null, {
  timeout: 30_000,
});
// Wait until the first imagery load finishes (loader hides).
await page.waitForSelector("#loader.is-hidden", { timeout: 30_000 });
// Give the sharp texture a moment to swap in for a crisp card.
await page.waitForTimeout(2500);
await page.screenshot({ path: OUT, type: "jpeg", quality: 85 });
await browser.close();
console.log(`captured ${OUT}`);
