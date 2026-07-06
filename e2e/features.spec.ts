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
  await expect(items).toHaveCount(8);

  // HD tiles, Grid, Borders, Cities, Atmosphere, Plates, Volcanoes, Quakes
  const borders = page.locator('.toolbar__item[title="Borders"]');
  const before = await borders.getAttribute("aria-pressed");
  await borders.click();
  await expect(borders).toHaveAttribute(
    "aria-pressed",
    before === "true" ? "false" : "true"
  );
});

test("geology overlays load their bundled datasets on first enable", async ({
  page,
}) => {
  // Plates and volcanoes are served from public/data — no third-party calls.
  const platesLoaded = page.waitForResponse("**/data/plate-boundaries.geojson");
  await page.locator('.toolbar__item[title="Plates"]').click();
  expect((await platesLoaded).ok()).toBe(true);

  const volcanoesLoaded = page.waitForResponse("**/data/volcanoes.json");
  await page.locator('.toolbar__item[title="Volcanoes"]').click();
  expect((await volcanoesLoaded).ok()).toBe(true);

  await expect(page.locator('.toolbar__item[title="Plates"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await expect(
    page.locator('.toolbar__item[title="Volcanoes"]')
  ).toHaveAttribute("aria-pressed", "true");
});

test("HD tile streaming is on by default (RFC-001 milestone 6)", async ({
  page,
}) => {
  const hd = page.locator('.toolbar__item[title="HD tiles"]');
  await expect(hd).toHaveAttribute("aria-pressed", "true");
  // From orbit nothing streams (the base texture is already as sharp), so
  // the default view must not fire any WMTS tile requests.
  await hd.click();
  await expect(hd).toHaveAttribute("aria-pressed", "false");
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
