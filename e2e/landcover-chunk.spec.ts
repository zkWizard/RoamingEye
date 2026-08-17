import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive, awaitHashSettled } from "./boot";
import { globePoint } from "./globe";

/**
 * A land-cover read runs two requests at once: the rendered-pixel sample, and
 * the class tables that decode it, which load on demand as their own chunk.
 *
 * Either can fail, and they need opposite remedies. A rejected dynamic import
 * stays rejected in the browser's module map, so probing again re-requests
 * nothing — while the sampler fetch is an ordinary request a second probe does
 * re-issue. One sentence used to answer for both and told the reader to retry,
 * which for the chunk is advice that can never work. These specs drive each leg
 * into failure separately and pin that the reader is told the remedy that
 * matches the leg that actually broke.
 */

const CLASS_CHUNK = "**/assets/landCoverClassRead*";
const REGION_CHUNK = "**/assets/landCoverRegionRead*";
const SAMPLER = "**/wms.cgi**";

test.use({ viewport: { width: 1280, height: 900 } });

const status = (page: Page) => page.locator(".probe__status");

/** Probe a point on the land-cover layer the way a pointer does. */
async function probeGlobe(page: Page, dx = 0, dy = 0): Promise<void> {
  const pt = await globePoint(page);
  await page.mouse.click(pt.x + dx, pt.y + dy);
}

test("a failed land-cover chunk names reload, and probing again is not the remedy", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(CLASS_CHUNK, (route) => {
    attempts++;
    return route.abort();
  });

  await page.goto("/#layer=landcover");
  await awaitAppInteractive(page);
  await probeGlobe(page);

  // Premise: the chunk really was requested and really did fail.
  await expect.poll(() => attempts, { timeout: 20_000 }).toBeGreaterThan(0);
  await expect(status(page)).toHaveText(
    "Reading the land-cover class failed — reload the page to try again.",
    { timeout: 20_000 }
  );

  // Probing again is NOT the remedy, so the copy must not name it: the module
  // map holds the rejection, and the second probe re-requests nothing.
  const before = attempts;
  await probeGlobe(page, 14, 9);
  await expect(status(page)).toHaveText(
    "Reading the land-cover class failed — reload the page to try again.",
    { timeout: 20_000 }
  );
  expect(attempts).toBe(before);

  // The remedy the message does name works.
  await page.unroute(CLASS_CHUNK);
  await page.reload();
  await awaitAppInteractive(page);
  await probeGlobe(page);
  await expect(status(page)).toContainText("IGBP class", { timeout: 25_000 });
});

test("a failed land-cover sampler still names retry, and probing again re-requests", async ({
  page,
}) => {
  await page.goto("/#layer=landcover");
  await awaitAppInteractive(page);

  // Routed only after boot: the boot gate waits on its own WMS GetMap, so
  // aborting from the start would fail the page rather than the probe.
  let attempts = 0;
  await page.route(SAMPLER, (route) => {
    attempts++;
    return route.abort();
  });

  await probeGlobe(page);
  await expect(status(page)).toHaveText(
    "Reading the land-cover class failed — check the connection and retry.",
    { timeout: 25_000 }
  );

  // This leg's advice is honest, and that is the whole reason the chunk leg
  // needed its own wording rather than both being changed to reload.
  const before = attempts;
  expect(before).toBeGreaterThan(0);
  await probeGlobe(page, 14, 9);
  await expect
    .poll(() => attempts, { timeout: 25_000 })
    .toBeGreaterThan(before);
});

test("a failed land-cover chunk names reload for a drawn region too", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(REGION_CHUNK, (route) => {
    attempts++;
    return route.abort();
  });

  await page.goto("/#layer=landcover");
  await awaitAppInteractive(page);

  // Draw a box the way a keyboard does — arm, corner, aim, corner.
  await page.locator("#globe").focus();
  await page.keyboard.press("ArrowRight");
  await awaitHashSettled(page);
  await page.locator(".draw-button").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".draw-button")).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.keyboard.press("Enter");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");

  await expect.poll(() => attempts, { timeout: 25_000 }).toBeGreaterThan(0);
  await expect(status(page)).toHaveText(
    "Reading the land-cover classes failed — reload the page to try again.",
    { timeout: 25_000 }
  );
});
