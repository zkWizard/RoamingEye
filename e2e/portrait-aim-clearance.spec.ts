import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A phone held upright leaves the middle of the view to the globe.
 *
 * hud-aim-clearance.spec.ts states the invariant this file extends — the aim is
 * the camera subpoint, it renders at the exact centre of the canvas and it is
 * the point Enter charts, so it cannot be moved somewhere roomier without lying
 * about which pixel it names. That file pins the invariant at 1280px wide, at
 * the short heights where the panel used to climb over the aim.
 *
 * Upright phones break it for the opposite reason. They are 800-932px tall, so
 * every height-keyed rule reads them as roomy: the spacing trim is gated at
 * 720px and the landscape auto-fold at 460px. But the panel's height does not
 * follow the window's — it is a fixed ~360px — so on a window barely twice that
 * the panel's top lands above the centre anyway. Measured on main before this
 * fix, the centre hit-tested `legend__measures` at 390x844, `legend__bar` at
 * 360x800, `layer-selector__current` at 412x915 and `timeline__readout` at
 * 320x568.
 *
 * The fix asks the layout rather than guessing a breakpoint, so the assertions
 * here come in matched pairs: it must fold where the aim is covered AND leave
 * the panel alone where it is not. The second half is what keeps it from being
 * a blanket rule about narrow windows.
 */

// Covered on main: the panel's top is above the centre of the window.
const COVERED = [
  { width: 390, height: 844 }, // iPhone 14/15
  { width: 360, height: 800 }, // the common Android
];

// Clear on main by 12px and 54px respectively — these must NOT fold, or the
// rule has stopped being about the aim and become a rule about narrow windows.
const CLEAR = [
  { width: 430, height: 932 }, // iPhone 15 Pro Max
  { width: 540, height: 960 }, // the widest viewport the fold control renders at
];

const aimHit = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const el = document.elementFromPoint(
      Math.round(window.innerWidth / 2),
      Math.round(window.innerHeight / 2)
    );
    return el?.id || el?.className || el?.tagName || "";
  });

test.use({ viewport: { width: 390, height: 844 } });

test("an upright phone opens with the globe under the aim", async ({
  page,
}) => {
  for (const size of COVERED) {
    await page.setViewportSize(size);
    // The fold default is decided as the boot curtain lifts, so it is a
    // property of a LOAD, not of a resize — reload before reading it.
    await page.goto("/");
    await awaitAppInteractive(page);

    await expect
      .poll(() => aimHit(page), {
        message: `the aim is covered by the HUD at ${size.width}x${size.height}`,
      })
      .toBe("globe");

    await expect(
      page.locator("#controls"),
      `the panel should open folded at ${size.width}x${size.height}`
    ).toHaveClass(/is-collapsed/);
  }
});

test("the folded panel keeps the citation and the way back", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  // What the fold keeps is the whole reason it is defensible: the layer
  // selector names what is on the globe and the provenance line carries the
  // product ID and the month, so no citation ends up behind a gesture.
  await expect(page.locator("#layer-selector")).toBeVisible();
  await expect(page.locator("#provenance")).toBeVisible();

  // And the gesture back is on screen and reversible.
  const collapse = page.locator("#hud-collapse");
  await expect(collapse).toBeVisible();
  await expect(collapse).toHaveAttribute("aria-expanded", "false");

  const box = (await collapse.boundingBox())!;
  expect(
    box.y,
    "the fold control is off the top of the screen"
  ).toBeGreaterThan(0);

  await collapse.click();
  await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);
  await expect(collapse).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#legend")).toBeVisible();
  await expect(page.locator("#timeline")).toBeVisible();
});

test("a viewport whose aim is already clear keeps every row", async ({
  page,
}) => {
  for (const size of CLEAR) {
    await page.setViewportSize(size);
    await page.goto("/");
    await awaitAppInteractive(page);

    await expect(
      page.locator("#controls"),
      `nothing was covered at ${size.width}x${size.height}, so nothing should fold`
    ).not.toHaveClass(/is-collapsed/);

    await expect
      .poll(() => aimHit(page), {
        message: `the aim regressed at ${size.width}x${size.height}`,
      })
      .toBe("globe");
  }
});
