// Regenerate docs/terrain-buildings-preview/* after terrain relief / OSM buildings.
// Usage: npm run dev, then: node scripts/capture-terrain-buildings-preview.mjs
// Optional: PREFIX=before node scripts/capture-terrain-buildings-preview.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const URL = process.env.TERRAIN_URL ?? "http://localhost:5173/";
const OUT_DIR = "docs/terrain-buildings-preview";
const PREFIX = process.env.PREFIX ?? "after";
const GL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

const LIGHT = "light=flat";
const LAYER = "layer=terrain";

const VIEWS = [
  {
    id: "alps",
    hash: `${LAYER}&lat=46.5&lon=8&alt=0.32&pitch=55&hdg=-15&${LIGHT}`,
  },
  {
    id: "grand-canyon",
    hash: `${LAYER}&lat=36.1&lon=-112.1&alt=0.32&pitch=55&hdg=40&${LIGHT}`,
  },
  {
    id: "manhattan",
    hash: `${LAYER}&lat=40.758&lon=-73.985&alt=0.32&pitch=55&hdg=95&${LIGHT}`,
  },
];

async function snap(page, name) {
  const path = join(OUT_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await page.screenshot({ type: "png" }));
  console.log(`wrote ${path}`);
}

async function settleView(page) {
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 60_000,
  });
  await page.waitForSelector("#loader.is-hidden", { timeout: 60_000 });
  const pitch0 = await page.evaluate(() => window.__VIEW_PITCH__ ?? 0);
  if (pitch0 < 45) {
    const tilt = page.locator(".tilt-dock__3d");
    if (await tilt.isVisible()) await tilt.click();
  }
  await page.waitForFunction(() => (window.__VIEW_PITCH__ ?? 0) > 45, null, {
    timeout: 20_000,
  });
  const viewport = page.viewportSize();
  if (viewport) {
    const x = Math.round(viewport.width / 2);
    const y = Math.round(viewport.height * 0.35);
    await page.mouse.move(x, y);
    for (let w = 0; w < 6; w++) {
      await page.mouse.wheel(0, -350);
      await page.waitForTimeout(400);
    }
  }
  await page.waitForTimeout(12_000);
}

const browser = await chromium.launch({ args: GL });

for (const { id, hash } of VIEWS) {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await desktop.goto(`${URL.replace(/\/$/, "")}/#${hash}`);
  await settleView(desktop);
  const cities = desktop.locator('.toolbar__item[title="Cities"]');
  if (await cities.isVisible()) await cities.click();
  await desktop.waitForTimeout(3_000);
  await snap(desktop, `${PREFIX}-desktop-${id}.png`);
  await desktop.close();
}

const phone = await browser.newPage({
  viewport: { width: 390, height: 844 },
  deviceScaleFactor: 1,
  isMobile: true,
  hasTouch: true,
});
await phone.goto(
  `${URL.replace(/\/$/, "")}/#${LAYER}&lat=40.758&lon=-73.985&alt=0.32&pitch=55&hdg=95&${LIGHT}`
);
await settleView(phone);
const fold = phone.locator("#hud-collapse");
if (await fold.isVisible()) {
  const expanded = await fold.getAttribute("aria-expanded");
  if (expanded === "true") await fold.click();
}
await phone.waitForTimeout(1_500);
await snap(phone, `${PREFIX}-phone-manhattan.png`);
await phone.close();

await browser.close();
