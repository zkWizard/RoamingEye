import { test, expect } from "@playwright/test";

/**
 * Behavioural e2e for the interactive surfaces that don't depend on external
 * services (toolbar overlays, hover readout). Search and the high-res study
 * region hit third-party endpoints (Nominatim / HLS) and are exercised
 * manually rather than gated in CI.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
});

test("toolbar exposes overlay toggles and flips their state", async ({
  page,
}) => {
  const items = page.locator(".toolbar__item");
  await expect(items).toHaveCount(5);

  const borders = items.nth(1); // Grid, Borders, Cities, Atmosphere, Quakes
  const before = await borders.getAttribute("aria-pressed");
  await borders.click();
  await expect(borders).toHaveAttribute(
    "aria-pressed",
    before === "true" ? "false" : "true"
  );
});

test("hovering the globe shows a coordinate readout", async ({ page }) => {
  const canvas = page.locator("#globe");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("globe canvas has no bounding box");

  // Centre of the canvas is over the globe — a hover there must resolve coords.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);

  const tooltip = page.locator("#hover-tooltip");
  await expect(tooltip).toHaveClass(/is-visible/);
  await expect(tooltip).toContainText("°");
});

declare global {
  interface Window {
    __APP_READY__?: boolean;
  }
}
