// Regenerate docs/tilt-preview/* after tilt quality fixes.
// Usage: npm run dev, then: node scripts/capture-tilt-preview.mjs
import { chromium } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const URL = process.env.TILT_URL ?? "http://localhost:5173/";
const OUT_DIR = "docs/tilt-preview";
const GL = [
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
];

/**
 * Tilted over Esri base: close enough that the draped month fades and the
 * relief is pitched for side lighting. `pitch` / `hdg` and `light=flat`
 * keep NASA shading off the terrain.
 */
const VIEWS = [
  {
    id: "himalaya",
    hash: "lat=28.6&lon=86.9&alt=0.32&pitch=55&hdg=25&light=flat",
  },
  {
    id: "alps",
    hash: "lat=46.5&lon=8&alt=0.35&pitch=55&hdg=-15&light=flat",
  },
  {
    id: "grand-canyon",
    hash: "lat=36.1&lon=-112.1&alt=0.34&pitch=55&hdg=40&light=flat",
  },
  {
    id: "san-francisco",
    hash: "lat=37.8&lon=-122.45&alt=0.33&pitch=55&hdg=80&light=flat",
  },
];

async function snap(page, name) {
  const path = join(OUT_DIR, name);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, await page.screenshot({ type: "png" }));
  console.log(`wrote ${path}`);
}

async function settleTiles(page) {
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 60_000,
  });
  await page.waitForSelector("#loader.is-hidden", { timeout: 60_000 });
  await page.waitForTimeout(14_000);
}

const browser = await chromium.launch({ args: GL });

for (const { id, hash } of VIEWS) {
  const desktop = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 1,
  });
  await desktop.goto(`${URL}#${hash}`);
  await settleTiles(desktop);
  await snap(desktop, `after-desktop-${id}.png`);
  await desktop.close();

  const phone = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 1,
    isMobile: true,
    hasTouch: true,
  });
  await phone.goto(`${URL}#${hash}`);
  await settleTiles(phone);
  const fold = phone.locator("#hud-collapse");
  if (await fold.isVisible()) {
    const expanded = await fold.getAttribute("aria-expanded");
    if (expanded === "true") await fold.click();
  }
  await phone.waitForTimeout(1_500);
  await snap(phone, `after-phone-${id}.png`);
  await phone.close();
}

await browser.close();
