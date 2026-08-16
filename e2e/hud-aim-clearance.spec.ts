import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The bottom HUD leaves the middle of the view to the globe.
 *
 * The aim the keyboard turns the globe under is the camera subpoint. It renders
 * at the exact centre of the canvas and it is the point Enter charts, so unlike
 * a cursor it cannot be moved somewhere roomier without lying about which pixel
 * it names. The bottom panel is the half of that pair which can move, and it
 * used not to: it measured 301px tall at 900px of viewport and 301px at 540px,
 * so as the window shortened it climbed over the aim. Below ~722px tall the
 * reticle marked a point the user could not see — at the 665px a 1366x768
 * laptop actually gets, the crosshair sat on the layer selector's own label.
 *
 * Taking the panel's row gaps down at short heights buys 56px and moves that
 * threshold to ~610px. These assertions are the reason it stays there: the
 * panel's captions accrete, and a purely visual fix would be eaten by the next
 * clause added to the source note without anything going red.
 *
 * The companion assertion at a roomy viewport lives in globe-aim.spec.ts; this
 * file is only about the heights where the two used to collide.
 */

// Heights the compressed panel is asserted to clear, from the top of the band
// down to just above the ~610px floor. 720 is the boundary itself, and also the
// default Playwright viewport, so it is the one most likely to regress silently.
const CLEARED_HEIGHTS = [720, 665, 640, 620];

test.use({ viewport: { width: 1280, height: 720 } });

test("the centre of the view is globe, not HUD, at short window heights", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  for (const height of CLEARED_HEIGHTS) {
    await page.setViewportSize({ width: 1280, height });
    // The panel relays out on resize; give it a frame before hit-testing.
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              document.elementFromPoint(
                Math.round(window.innerWidth / 2),
                Math.round(window.innerHeight / 2)
              )?.id ?? ""
          ),
        {
          message: `the aim point is covered by the HUD at ${height}px tall`,
        }
      )
      .toBe("globe");
  }
});

test("the HUD's top edge stays below the aim point", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  // The hit test above is the user-visible property; this one names the reason,
  // so a failure says which way the panel grew rather than only that it did.
  for (const height of CLEARED_HEIGHTS) {
    await page.setViewportSize({ width: 1280, height });
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const top = document
              .querySelector("#controls")!
              .getBoundingClientRect().top;
            return Math.round(top - window.innerHeight / 2);
          }),
        {
          message: `the HUD reaches above the middle of the view at ${height}px tall`,
        }
      )
      .toBeGreaterThan(0);
  }
});

test("the keyboard reticle marks a pixel the user can see on a laptop screen", async ({
  page,
}) => {
  // 665px is what a 1366x768 laptop leaves after browser chrome — the height
  // this defect was actually reported at.
  await page.setViewportSize({ width: 1280, height: 665 });
  await page.goto("/");
  await awaitAppInteractive(page);

  // The globe is the first tab stop, and the reticle is gated on
  // `:focus-visible`, so it takes a real Tab — a programmatic focus() would not
  // raise it.
  await page.keyboard.press("Tab");
  await expect(page.locator("#globe-reticle")).toHaveClass(/is-visible/);

  // Assert the RECT, not the opacity: the reticle fades in, so reading opacity
  // straight after the keypress catches a transition frame rather than a bug.
  const hit = await page.evaluate(() => {
    const r = document.querySelector("#globe-reticle")!.getBoundingClientRect();
    return document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)
    )?.id;
  });
  expect(hit).toBe("globe");
});
