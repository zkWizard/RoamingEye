import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { globePoint } from "./globe";

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
  await awaitAppInteractive(page);
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
  // HD tiles, Grid, Borders, Cities, Atmosphere, Plates, Volcanoes, Quakes,
  // My location.
  await expect(items).toHaveCount(9);
  await expect(page.locator('.toolbar__item[title="My location"]')).toHaveCount(
    1
  );

  const borders = page.locator('.toolbar__item[title="Borders"]');
  const before = await borders.getAttribute("aria-pressed");
  await borders.click();
  await expect(borders).toHaveAttribute(
    "aria-pressed",
    before === "true" ? "false" : "true"
  );
});

test("phone toolbar advertises the toggles hidden past its edge", async ({
  page,
}) => {
  // At 390px the bottom bar shows six of the nine toggles and scrolls for the
  // rest. Tab reaches the hidden ones (focus scrolls them in); a thumb needs
  // to be told they exist, so each edge with items behind it gets a fade.
  await page.setViewportSize({ width: 390, height: 844 });
  const toolbar = page.locator(".toolbar");
  await expect(toolbar).toHaveAttribute("data-overflow", "end");

  const last = page.locator(".toolbar .toolbar__item").last();
  await expect(last).toHaveAttribute("title", "My location");
  await last.scrollIntoViewIfNeeded();

  // Scrolled to the far end: nothing left to the right, so that fade goes.
  await expect(toolbar).toHaveAttribute("data-overflow", "start");

  // The fade is paint-only — the item it sat over is still clickable, and a
  // tap must reach the button rather than a decoration above it.
  const box = await last.boundingBox();
  if (!box) throw new Error("last toolbar item has no bounding box");
  const hit = await page.evaluate(
    ([x, y]) =>
      document
        .elementFromPoint(x, y)
        ?.closest(".toolbar__item")
        ?.getAttribute("title") ?? null,
    [box.x + box.width / 2, box.y + box.height / 2] as [number, number]
  );
  expect(hit).toBe("My location");

  // Desktop keeps the vertical bar, which never overflows: no fade at all.
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect(toolbar).toHaveAttribute("data-overflow", "none");
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
  // A point over the globe and clear of the HUD — a hover there must resolve
  // coords. The canvas centre no longer qualifies: the bottom HUD stack now
  // reaches it.
  const pt = await globePoint(page);
  await page.mouse.move(pt.x, pt.y);

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

  // Annual cadence: the readout is a bare year and the control says "Year".
  await expect(page.locator(".timeline__readout")).toHaveText(/^\d{4}$/);
  await expect(page.getByRole("slider", { name: "Year" })).toBeVisible();

  // Categorical legend: class swatches, no gradient bar.
  await expect(page.locator(".legend__scale")).toBeHidden();
  const classes = page.locator(".legend__classes .legend__key-item");
  await expect(classes).toHaveCount(18);
  await expect(page.locator(".legend__classes")).toContainText("Cropland");

  // Provenance names the layer and the year.
  await expect(page.locator("#provenance")).toContainText(
    /MODIS_Combined_L3_IGBP_Land_Cover_Type_Annual · \d{4}$/
  );

  // The legend cites the product on screen, with its categorical guardrail.
  // Terrain tiles keep arriving while another layer is selected, and their
  // coverage notice used to re-render the terrain note over whichever layer
  // was showing — so every data layer cited ASTGTM v003 (ui/Legend
  // setTerrainTileCoverage). Assert after a settle so a late tile batch that
  // reintroduced the overwrite would fail here.
  const sourceNote = page.locator(".legend__source-note");
  await expect(sourceNote).toContainText("MCD12Q1 v061");
  await expect(sourceNote).toContainText("Colours name a class");
  await expect(sourceNote).toContainText("Barren still permits vegetation");
  await page.waitForTimeout(2000);
  await expect(sourceNote).not.toContainText("ASTGTM");

  // Stepping the timeline moves a whole year.
  const track = page.locator(".timeline__track");
  await track.focus();
  const year = Number(await page.locator(".timeline__readout").textContent());
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".timeline__readout")).toHaveText(String(year - 1));
});

test("timeline stepper buttons move one month and disable at the ends", async ({
  page,
}) => {
  await expect(page.getByRole("slider", { name: "Month" })).toBeVisible();

  const readout = page.locator(".timeline__readout");
  const prev = page.locator('.timeline__step[aria-label^="Previous"]');
  const next = page.locator('.timeline__step[aria-label^="Next"]');

  // Boot lands on the newest month, so forward is a dead end and back isn't.
  await expect(next).toBeDisabled();
  await expect(prev).toBeEnabled();

  const start = await readout.textContent();
  await prev.click();
  await expect(readout).not.toHaveText(start ?? "");
  await expect(next).toBeEnabled();

  // Stepping forward again returns to the newest month and re-disables.
  await next.click();
  await expect(readout).toHaveText(start ?? "");
  await expect(next).toBeDisabled();
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

test("software finder loads reviewed records and filters locally", async ({
  page,
}) => {
  const catalogLoaded = page.waitForResponse("**/data/software-catalog.json");
  await page.locator("#software-link").click();
  expect((await catalogLoaded).ok()).toBe(true);

  const finder = page.locator("#software-page");
  await expect(finder).toHaveClass(/is-open/);
  await expect(finder.locator(".software__card")).not.toHaveCount(0);

  await finder.locator(".software__query").fill("netcdf zarr");
  await expect(finder.locator(".software__results")).toContainText("xarray");
  await expect(finder.locator(".software__results")).not.toContainText("QGIS");

  await finder.locator(".providers__close").click();
  await expect(finder).not.toHaveClass(/is-open/);
});

test("fleet dashboard reports the latest agent run", async ({ page }) => {
  const statusLoaded = page.waitForResponse("**/data/agent-status.json");
  const historyLoaded = page.waitForResponse("**/data/agent-history.json");
  await page.locator("#fleet-link").click();
  expect((await statusLoaded).ok()).toBe(true);
  expect((await historyLoaded).ok()).toBe(true);

  const dashboard = page.locator("#fleet-page");
  await expect(dashboard).toHaveClass(/is-open/);
  await expect(dashboard.locator(".fleet__agent")).toHaveCount(6);
  await expect(dashboard.locator(".fleet__summary")).toContainText("Published");
  await expect(dashboard.locator(".fleet__history-item")).not.toHaveCount(0);

  await dashboard.locator(".providers__close").click();
  await expect(dashboard).not.toHaveClass(/is-open/);
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
  // Acatenango, Guatemala (14.501, -90.876) — facing the default camera and
  // clear of the bottom-centre HUD stack (layer selector + legend), whose
  // height varies with the active layer's legend content.
  const pt = screenPointFor(14.501, -90.876, viewport.width, viewport.height);

  // A HUD panel over this point would swallow the pointermove and make the
  // hover assertion below fail for a reason that has nothing to do with
  // markers, so state the precondition explicitly.
  const hitId = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.id ?? "",
    [pt.x, pt.y] as const
  );
  expect(hitId).toBe("globe");

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
  // Wheel events must land on the globe, not the bottom HUD stack.
  const pt = await globePoint(page);
  await page.mouse.move(pt.x, pt.y);
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
  // Denver (39.741, -104.986) — facing the default camera, the most isolated
  // dot in view (~52 px from its nearest neighbour against a ~5 px pick
  // radius), and high above the bottom-centre HUD stack. Quito was the old
  // target, but it projects a pixel below the vertical centre, which the
  // growing HUD stack now covers.
  const pt = screenPointFor(39.741, -104.986, viewport.width, viewport.height);

  // A HUD panel over this point would swallow the pointermove and make the
  // hover assertion below fail for a reason that has nothing to do with
  // markers, so state the precondition explicitly.
  const hitId = await page.evaluate(
    ([x, y]) => document.elementFromPoint(x, y)?.id ?? "",
    [pt.x, pt.y] as const
  );
  expect(hitId).toBe("globe");

  const tooltip = page.locator("#hover-tooltip");
  let jitter = 0;
  await expect(async () => {
    await page.mouse.move(pt.x + (jitter ^= 1), pt.y);
    await expect(tooltip).toContainText("Denver · United States of America", {
      timeout: 300,
    });
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

test("search traces an exact returned boundary without a study-region box", async ({
  page,
}) => {
  let highResolutionRequests = 0;
  page.on("request", (request) => {
    if (request.url().includes("HLS_S30_Nadir_BRDF_Adjusted_Reflectance")) {
      highResolutionRequests++;
    }
  });
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "Exactville",
          display_name: "Exactville, Example State, Example Country",
          lat: "34.0000",
          lon: "-118.0000",
          type: "city",
          category: "boundary",
          boundingbox: ["33.9", "34.1", "-118.2", "-117.8"],
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [-118.2, 33.9],
                [-117.8, 33.9],
                [-117.8, 34.1],
                [-118.2, 33.9],
              ],
            ],
          },
        },
      ]),
    })
  );

  const input = page.locator(".search__input");
  await input.fill("Exactville");
  await page.locator(".search__result").click();

  await expect(input).toHaveValue("Exactville");
  await expect(page.locator("#study-chip")).not.toHaveClass(/is-visible/);
  const insights = page.locator("#place-insights");
  await expect(insights).toHaveClass(/is-open/);
  await expect(insights).toContainText("Vegetation");
  await expect(insights).toContainText("Precipitation");
  await expect(insights).toContainText("Soil moisture");
  await expect(insights).toContainText("Air temperature");
  await page.waitForTimeout(500);
  expect(highResolutionRequests).toBe(0);
});

test("place insights report nearby USGS seismicity with its source and scope", async ({
  page,
}) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "Exactville",
          display_name: "Exactville, Example State, Example Country",
          lat: "34.0000",
          lon: "-118.0000",
          type: "city",
          category: "boundary",
          // Centre (34, -118); the circumscribed radius is roughly 21 km.
          boundingbox: ["33.9", "34.1", "-118.2", "-117.8"],
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [-118.2, 33.9],
                [-117.8, 33.9],
                [-117.8, 34.1],
                [-118.2, 33.9],
              ],
            ],
          },
        },
      ]),
    })
  );
  await page.route("**earthquake.usgs.gov**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        features: [
          {
            // ~7 km from the extent centre: inside the radius.
            geometry: { type: "Point", coordinates: [-118.05, 34.05, 9.2] },
            properties: {
              mag: 5.2,
              magType: "mww",
              time: 1_750_000_000_000,
              place: "Near Exactville",
            },
          },
          {
            // Hundreds of km away: outside the radius.
            geometry: { type: "Point", coordinates: [-120, 40, 480] },
            properties: {
              mag: 6.1,
              time: 1_750_000_000_000,
              place: "Far away",
            },
          },
        ],
      }),
    })
  );

  await page.locator(".search__input").fill("Exactville");
  await page.locator(".search__result").click();

  const seismicity = page.locator(
    '[aria-label="Recent earthquakes near this place"]'
  );
  await expect(seismicity).toContainText("1 event");
  await expect(seismicity).toContainText("Near Exactville");
  await expect(seismicity).toContainText("M5.2 mww");
  await expect(seismicity).toContainText("shallow");
  // Events outside the circumscribed radius must not be attributed to the place.
  await expect(seismicity).not.toContainText("Far away");
  // The radial query overshoots the rectangle's corners; the panel must say so
  // rather than implying the events sit inside the searched boundary.
  await expect(seismicity).toContainText("past the boundary corners");
  await expect(seismicity).toContainText("USGS");
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
  // Three full boots (the beforeEach, plus two revisits), and beforeEach time
  // counts against the test budget. A boot is only fast when imagery is warm:
  // a cold sharp image is allowed 15s before it times out and the curtain
  // lifts on the retry path, so the worst case is ~45s of boot alone and the
  // default 30s cannot cover it. This spec asserts session restore, not
  // network speed — give it room rather than letting GIBS latency decide.
  test.setTimeout(120_000);

  // Change the working context: EVI layer + Grid overlay.
  await page.locator(".layer-selector__trigger").click();
  await page
    .locator(".layer-selector__option", { hasText: "Vegetation (EVI)" })
    .click();
  await page.locator('.toolbar__item[title="Grid"]').click();
  await page.waitForTimeout(700); // debounced persistence

  // Plain revisit (no hash): the session restores. waitUntil commit — the
  // interactive gate (render + curtain) is what matters, not the load event.
  await page.goto("/", { waitUntil: "commit" });
  await awaitAppInteractive(page);
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
  await awaitAppInteractive(page);
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
