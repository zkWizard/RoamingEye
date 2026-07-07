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

/**
 * Screen position of a lat/lon on the default view (camera at (0, 0, 3.2)
 * looking at the origin, fov 45°) — mirrors lib/geo.latLngToVector3 plus a
 * standard perspective projection, so tests can aim the mouse at a marker.
 */
function screenPointFor(
  lat: number,
  lon: number,
  width: number,
  height: number
): { x: number; y: number } {
  const DEG2RAD = Math.PI / 180;
  const phi = (90 - lat) * DEG2RAD;
  const theta = (lon + 180) * DEG2RAD;
  const r = 1.005; // marker altitude — close enough for both overlays
  const x = -r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);
  const f = 1 / Math.tan((45 / 2) * DEG2RAD);
  const zCam = z - 3.2;
  const ndcX = (f / (width / height)) * (x / -zCam);
  const ndcY = f * (y / -zCam);
  return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height };
}

test("hovering a volcano marker shows its details", async ({ page }) => {
  const volcanoesLoaded = page.waitForResponse("**/data/volcanoes.json");
  await page.locator('.toolbar__item[title="Volcanoes"]').click();
  await volcanoesLoaded;

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  // Darwin volcano, Galápagos (-0.18, -91.28) — near the default view centre.
  const pt = screenPointFor(-0.18, -91.28, viewport.width, viewport.height);

  const tooltip = page.locator("#hover-tooltip");
  let jitter = 0;
  await expect(async () => {
    // Re-fire pointermove each retry (the first may precede the data parse).
    await page.mouse.move(pt.x + (jitter ^= 1), pt.y);
    await expect(tooltip).toContainText(/last erupted/, { timeout: 300 });
  }).toPass({ timeout: 10_000 });
});

test("hovering a city dot shows its name", async ({ page }) => {
  const citiesLoaded = page.waitForResponse("**/data/cities.json");
  await page.locator('.toolbar__item[title="Cities"]').click();
  await citiesLoaded;

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  // Quito (-0.213, -78.502) — isolated enough that no other dot can win.
  const pt = screenPointFor(-0.213, -78.502, viewport.width, viewport.height);

  const tooltip = page.locator("#hover-tooltip");
  let jitter = 0;
  await expect(async () => {
    await page.mouse.move(pt.x + (jitter ^= 1), pt.y);
    await expect(tooltip).toContainText("Quito · Ecuador", { timeout: 300 });
  }).toPass({ timeout: 10_000 });
});

declare global {
  interface Window {
    __APP_READY__?: boolean;
  }
}
