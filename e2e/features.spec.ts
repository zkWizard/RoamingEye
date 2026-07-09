import { test, expect } from "@playwright/test";

/**
 * Behavioural e2e for the interactive surfaces that don't depend on external
 * services (toolbar overlays, hover readout). Search and the high-res study
 * region hit third-party endpoints (Nominatim / HLS) and are exercised
 * manually rather than gated in CI.
 */

// Every feature test doubles as an uncaught-exception canary: interactions
// (draw, zoom, modals, layer switches) must never throw to the page.
let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/");
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
});

test.afterEach(() => {
  // The error-toast test throws deliberately; everything else must be clean.
  expect(
    pageErrors.filter((m) => !m.includes("e2e synthetic failure"))
  ).toEqual([]);
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

test("land-cover layer steps by year with a class-swatch legend", async ({
  page,
}) => {
  await page.locator(".layer-selector__trigger").click();
  await page
    .locator(".layer-selector__option", { hasText: "Land cover" })
    .click();

  // Annual cadence: the readout is a bare year, newest first.
  await expect(page.locator(".timeline__readout")).toHaveText(/^\d{4}$/);

  // Categorical legend: class swatches, no gradient bar.
  await expect(page.locator(".legend__scale")).toBeHidden();
  const classes = page.locator(".legend__classes .legend__key-item");
  await expect(classes).toHaveCount(18);
  await expect(page.locator(".legend__classes")).toContainText("Cropland");

  // Provenance names the layer and the year.
  await expect(page.locator("#provenance")).toContainText(
    /MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual · \d{4}$/
  );

  // Stepping the timeline moves a whole year.
  const track = page.locator(".timeline__track");
  await track.focus();
  const year = Number(await page.locator(".timeline__readout").textContent());
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".timeline__readout")).toHaveText(String(year - 1));
});

test("? opens the keyboard-shortcuts overlay and Esc closes it", async ({
  page,
}) => {
  const overlay = page.locator("#shortcuts-page");
  await expect(overlay).not.toHaveClass(/is-open/);

  await page.keyboard.press("?");
  await expect(overlay).toHaveClass(/is-open/);
  await expect(overlay).toContainText("Keyboard shortcuts");
  await expect(overlay).toContainText("Jump a year back / forward");

  await page.keyboard.press("Escape");
  await expect(overlay).not.toHaveClass(/is-open/);

  // The ? button in the header hint opens it too.
  await page.locator("#shortcuts-link").click();
  await expect(overlay).toHaveClass(/is-open/);
});

test("toggling volcanoes surfaces its color key in the legend", async ({
  page,
}) => {
  const volcanoes = page.locator('.toolbar__item[title="Volcanoes"]');
  const key = page.locator(".legend__key");

  await expect(key).toHaveCount(0);
  await volcanoes.click();
  await expect(key).toHaveCount(1);
  await expect(key).toContainText("Last eruption");
  await expect(key).toContainText("since 1900");

  await volcanoes.click();
  await expect(key).toHaveCount(0);
});

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

test("city labels appear at close zoom and not from orbit", async ({
  page,
}) => {
  const citiesLoaded = page.waitForResponse("**/data/cities.json");
  await page.locator('.toolbar__item[title="Cities"]').click();
  await citiesLoaded;

  // Default view is from orbit (camera distance 3.2) — no labels.
  const layer = page.locator(".city-labels");
  await expect(layer).toBeHidden();

  // Wheel-zoom toward the surface; OrbitControls needs a few frames of
  // damping, so poll until the label layer fades in.
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  await page.mouse.move(viewport.width / 2, viewport.height / 2);
  await expect(async () => {
    await page.mouse.wheel(0, -400);
    await expect(layer).toBeVisible({ timeout: 400 });
  }).toPass({ timeout: 15_000 });

  // South America fills the default view — a top-30 city label must show.
  await expect(page.locator(".city-label:visible").first()).toBeVisible();
});

test("drawing a region opens its monthly-mean chart", async ({ page }) => {
  await page.locator(".draw-button").click();
  await expect(page.locator(".draw-button")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;
  await page.mouse.move(cx - 60, cy - 60);
  await page.mouse.down();
  await page.mouse.move(cx + 60, cy + 60, { steps: 8 });
  await page.mouse.up();

  // The drawer disarms itself and the chart opens as a region probe.
  await expect(page.locator(".draw-button")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  const probe = page.locator("#probe-panel");
  await expect(probe).toHaveClass(/is-open/);
  await expect(probe).toContainText("Drawn region · mean over");
  // The Point/Area toggle doesn't apply to a drawn box.
  await expect(page.locator(".probe__segment").first()).toBeHidden();
  await expect(probe.locator(".probe__status")).toContainText(
    /Sampling|months|No data/
  );
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

test("rendering pauses while the tab is hidden and resumes on return", async ({
  page,
}) => {
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_ACTIVE__))
    .toBe(true);

  // Fake backgrounding: override document.hidden, fire visibilitychange.
  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => true,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_ACTIVE__))
    .toBe(false);

  await page.evaluate(() => {
    Object.defineProperty(document, "hidden", {
      configurable: true,
      get: () => false,
    });
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_ACTIVE__))
    .toBe(true);
});

test("recovers from a lost WebGL context", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));

  // Same-type getContext returns the app's live context; simulate GPU loss.
  await page.evaluate(() => {
    const gl = document
      .querySelector<HTMLCanvasElement>("#globe")!
      .getContext("webgl2") as WebGL2RenderingContext;
    const ext = gl.getExtension("WEBGL_lose_context");
    if (!ext) throw new Error("WEBGL_lose_context unavailable");
    ext.loseContext();
    setTimeout(() => ext.restoreContext(), 600);
  });

  await expect(page.locator("#timeline-status")).toContainText(
    "Graphics context lost"
  );
  await expect(page.locator("#timeline-status")).not.toContainText(
    "Graphics context lost",
    { timeout: 10_000 }
  );
  expect(errors).toEqual([]);
});

test("offline shows a banner, reconnect clears it and recovers", async ({
  page,
  context,
}) => {
  const banner = page.locator(".offline-banner");
  await expect(banner).toBeHidden();

  // Chromium's setOffline drives navigator.onLine and the online/offline
  // events — the same signals the app listens to in the field.
  await context.setOffline(true);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Offline");

  await context.setOffline(false);
  await expect(banner).toBeHidden();
  // Reconnect re-drives the texture pipeline; the app must settle back to a
  // loaded, quiet state (no stuck "Loading…" and no retry pill).
  await expect(page.locator(".status-retry")).toBeHidden({ timeout: 20_000 });
});

test("uncaught errors surface a dismissible toast", async ({ page }) => {
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("e2e synthetic failure");
    }, 0);
  });
  const toast = page.locator(".error-toast");
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("e2e synthetic failure");
  await toast.locator(".error-toast__close").click();
  await expect(toast).toBeHidden();
});

test("search shows failure and no-results states", async ({ page }) => {
  // Force a network failure without touching the real geocoder.
  await page.route("**nominatim**", (route) => route.abort());
  const input = page.locator(".search__input");
  await input.fill("reykjavik");
  await expect(page.locator(".search__message")).toContainText(
    "Search unavailable",
    { timeout: 15_000 }
  );

  // Next keystroke clears the message row.
  await input.fill("r");
  await expect(page.locator(".search__message")).toHaveCount(0);
});

test("modals trap focus and restore it on close", async ({ page }) => {
  await page.locator("#shortcuts-link").click();
  const overlay = page.locator("#shortcuts-page");
  await expect(overlay).toHaveClass(/is-open/);

  // Tab several times: focus must stay inside the panel.
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    const inside = await page.evaluate(() =>
      document
        .querySelector("#shortcuts-page")!
        .contains(document.activeElement)
    );
    expect(inside).toBe(true);
  }

  // Close: focus returns to the opener.
  await page.keyboard.press("Escape");
  await expect(overlay).not.toHaveClass(/is-open/);
  await expect(page.locator("#shortcuts-link")).toBeFocused();
});

test("restores the last session; a URL hash still wins", async ({ page }) => {
  // Change the working context: EVI layer + Grid overlay.
  await page.locator(".layer-selector__trigger").click();
  await page
    .locator(".layer-selector__option", { hasText: "Vegetation (EVI)" })
    .click();
  await page.locator('.toolbar__item[title="Grid"]').click();
  await page.waitForTimeout(700); // debounced persistence

  // Plain revisit (no hash): the session restores. waitUntil commit — the
  // boot prefetch can hold the load event back; __APP_READY__ is the gate.
  await page.goto("/", { waitUntil: "commit" });
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Vegetation (EVI)"
  );
  await expect(page.locator('.toolbar__item[title="Grid"]')).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // An explicit hash outranks the stored session.
  await page.goto("/#layer=snow", { waitUntil: "commit" });
  await page.reload({ waitUntil: "commit" });
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Snow cover"
  );
});

test("imagery failure offers a retry that recovers", async ({ page }) => {
  // Kill GIBS, then step to a month whose sharp texture isn't loaded yet.
  await page.route("**gibs.earthdata.nasa.gov**", (route) => route.abort());
  await page.locator(".timeline__track").focus();
  await page.keyboard.press("ArrowLeft");

  const retry = page.locator(".status-retry");
  await expect(retry).toBeVisible({ timeout: 15_000 });
  await expect(page.locator("#timeline-status")).toContainText(
    "Imagery failed to load"
  );

  // Network back: retry re-drives the pipeline and the failure clears.
  await page.unroute("**gibs.earthdata.nasa.gov**");
  await retry.click();
  await expect(retry).toBeHidden();
  await expect(page.locator("#timeline-status")).not.toContainText(
    "Imagery failed to load",
    { timeout: 20_000 }
  );
});

test("layer picker is arrow-key navigable", async ({ page }) => {
  await page.locator(".layer-selector__trigger").click();
  // The selected option (NDVI) receives focus on open.
  await expect(
    page.locator('.layer-selector__option[aria-selected="true"]')
  ).toBeFocused();

  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Vegetation (EVI)"
  );
});

test("comparison mode pins a month and sweeps a divider", async ({ page }) => {
  const button = page.locator(".compare-button");
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");

  const divider = page.locator(".compare-divider");
  await expect(divider).toHaveClass(/is-visible/);
  await expect(divider.locator(".compare-divider__chip--pinned")).toContainText(
    "pinned"
  );

  // Sweep: dragging the divider moves the split position.
  const before = await divider.evaluate((el) => el.style.left);
  const box = await divider.boundingBox();
  if (!box) throw new Error("divider has no bounding box");
  await page.mouse.move(box.x + box.width / 2, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 180, box.y + 300, {
    steps: 6,
  });
  await page.mouse.up();
  const after = await divider.evaluate((el) => el.style.left);
  expect(after).not.toBe(before);

  // Disabling cleans the divider up.
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(divider).not.toHaveClass(/is-visible/);

  // Static layers have no time dimension — compare must refuse.
  await page.locator(".layer-selector__trigger").click();
  await page.locator(".layer-selector__option", { hasText: "Terrain" }).click();
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "false");
  await expect(divider).not.toHaveClass(/is-visible/);
});

declare global {
  interface Window {
    __APP_READY__?: boolean;
    __RENDER_ACTIVE__?: boolean;
  }
}
