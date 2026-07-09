import { fileURLToPath } from "node:url";
import { test, expect } from "@playwright/test";

/**
 * Visual regression for the scientific chrome — legends, timeline, picker,
 * toolbar, modals — where a CSS refactor can silently break layout in the
 * theme or viewport nobody manually re-checked.
 *
 * Determinism rules:
 *  - the WebGL canvas is hidden via injected style (imagery varies by fetch
 *    and month; the UI panels blur a deterministic page background instead);
 *  - the boot freshness probe is blocked and the month pinned by deep link,
 *    so the timeline doesn't shift when NASA publishes a new month;
 *  - Linux-only (baselines are CI renders; font rasterization differs per
 *    OS). Regenerate via the "Update visual baselines" dispatch workflow.
 *
 * The suite is ADVISORY: it runs in its own continue-on-error CI job (see
 * ci.yml `visual`), posting its report as an artifact on mismatch.
 */

test.skip(
  process.platform !== "linux",
  "visual baselines are Linux (CI) renders"
);

const FIXED_VIEW = "#layer=ndvi&t=2020-06&lat=0.00&lon=0.00&alt=2.20";
// stylePath (not inline style): supported by this Playwright's
// toHaveScreenshot; hides the imagery-variable canvas in every shot.
const shot = {
  stylePath: fileURLToPath(
    new URL("./visual-hide-canvas.css", import.meta.url)
  ),
};

test.beforeEach(async ({ page }) => {
  // Freeze the timeline: no freshness growth, pinned month via the hash.
  await page.route("**DescribeDomains**", (route) => route.abort());
  await page.goto(`/${FIXED_VIEW}`);
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
});

test("controls panel (timeline + selector), dark", async ({ page }) => {
  await expect(page.locator(".controls")).toHaveScreenshot(
    "controls-dark.png",
    shot
  );
});

test("controls panel, light theme", async ({ page }) => {
  await page.locator(".theme-toggle").click();
  await expect(page.locator(".controls")).toHaveScreenshot(
    "controls-light.png",
    shot
  );
});

test("layer picker open", async ({ page }) => {
  await page.locator(".layer-selector__trigger").click();
  await expect(page.locator(".layer-selector__panel")).toHaveScreenshot(
    "layer-picker.png",
    shot
  );
});

test("legend, gradient layer", async ({ page }) => {
  await expect(page.locator("#legend")).toHaveScreenshot(
    "legend-gradient.png",
    shot
  );
});

test("legend, categorical layer (land cover)", async ({ page }) => {
  await page.goto("/#layer=landcover&t=2020-01");
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
  await expect(page.locator("#legend")).toHaveScreenshot(
    "legend-classes.png",
    shot
  );
});

test("toolbar, desktop", async ({ page }) => {
  await expect(page.locator("#toolbar")).toHaveScreenshot(
    "toolbar-desktop.png",
    shot
  );
});

test("toolbar, phone width (bottom app bar)", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await expect(page.locator("#toolbar")).toHaveScreenshot(
    "toolbar-mobile.png",
    shot
  );
});

test("providers modal panel", async ({ page }) => {
  await page.locator("#providers-link").click();
  await expect(page.locator(".providers__panel")).toHaveScreenshot(
    "providers-panel.png",
    shot
  );
});

test("shortcuts overlay", async ({ page }) => {
  await page.locator("#shortcuts-link").click();
  await expect(page.locator("#shortcuts-page")).toHaveScreenshot(
    "shortcuts.png",
    shot
  );
});
