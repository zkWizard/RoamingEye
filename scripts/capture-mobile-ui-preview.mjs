import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";

const OUT = "docs/mobile-ui-preview";
const VIEW = { width: 390, height: 844 };

async function boot(page) {
  await page.goto("http://localhost:4173/", { waitUntil: "networkidle" });
  await page.waitForFunction(
    () =>
      window.__APP_READY__ === true &&
      window.getComputedStyle(document.querySelector("#loader")).visibility ===
        "hidden"
  );
  const skip = page.locator("#intro-skip");
  if (await skip.isVisible()) await skip.click();
  await page.waitForTimeout(400);
  await page.evaluate(() => window.__FIT_MOBILE_GLOBE__?.());
  await page.waitForTimeout(300);
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: VIEW,
    isMobile: true,
    hasTouch: true,
  });
  await boot(page);
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/after-default-390x844.png` });
  await page.locator("#hud-collapse").evaluate((el) => el.click());
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/after-legend-expanded-390x844.png` });
  await page.locator("#more-button").click();
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/after-menu-open-390x844.png` });
  await browser.close();
}

async function captureDesktopAfter() {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  await page.goto("http://localhost:4173/", { waitUntil: "load" });
  await page.waitForFunction(
    () =>
      window.__APP_READY__ === true &&
      window.getComputedStyle(document.querySelector("#loader")).visibility ===
        "hidden"
  );
  const skip = page.locator("#intro-skip");
  if (await skip.isVisible()) await skip.click();
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/after-desktop-1280x900.png` });
  await browser.close();
}

async function run() {
  await main();
  await captureDesktopAfter();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
