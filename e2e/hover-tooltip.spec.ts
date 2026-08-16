import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The globe hover readout must stay inside the window.
 *
 * Overlay records describe themselves with six provenance-bearing fields, so
 * a volcano hover runs ~138 characters — far wider than the window. The box
 * used to be `white-space: nowrap` and was only ever FLIPPED to the far side
 * of the cursor, never clamped, so the overflow landed on the left: at
 * 1280x800 the readout started at x=-166 and at 390x844 at x=-612, cutting
 * off the record's NAME, which sits at that end. See docs/BACKLOG.md.
 *
 * Chromium-only by construction: the webkit/firefox projects `testMatch` a
 * named list of specs, which this file is deliberately not on.
 */

/** Acatenango, Guatemala — faces the default camera, well clear of the
 * bottom-centre HUD stack, and the target features.spec.ts already trusts. */
const VOLCANO = { lat: 14.501, lon: -90.876 };

/**
 * Screen position of a lat/lon on the default view (camera at (0, 0, 3.2),
 * fov 45°) — mirrors lib/geo.latLngToVector3 plus a standard perspective
 * projection, so the test can aim the mouse at a marker.
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
  const r = 1.005; // marker altitude
  const x = -r * Math.sin(phi) * Math.cos(theta);
  const y = r * Math.cos(phi);
  const z = r * Math.sin(phi) * Math.sin(theta);
  const f = 1 / Math.tan((45 / 2) * DEG2RAD);
  const zCam = z - 3.2;
  const ndcX = (f / (width / height)) * (x / -zCam);
  const ndcY = f * (y / -zCam);
  return { x: ((ndcX + 1) / 2) * width, y: ((1 - ndcY) / 2) * height };
}

// 390x844 is the tighter case — the box is capped at viewport-28, leaving so
// little slack that the flip always overshoots and the clamp always fires.
// 1280x800 proves the defect was never phone-only.
for (const vp of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 },
]) {
  test(`a long overlay hover readout stays on screen at ${vp.width}px`, async ({
    page,
  }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.setViewportSize(vp);
    await page.goto("/");
    await awaitAppInteractive(page);

    await page.locator('.toolbar__item[title="Volcanoes"]').click();

    const pt = screenPointFor(VOLCANO.lat, VOLCANO.lon, vp.width, vp.height);
    // A HUD panel over this point would swallow the pointermove and fail the
    // hover for a reason unrelated to the tooltip, so state the precondition.
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
    }).toPass({ timeout: 15_000 });

    const box = await page.evaluate(() => {
      const el = document.querySelector("#hover-tooltip") as HTMLElement;
      const r = el.getBoundingClientRect();
      return {
        left: r.left,
        right: r.right,
        top: r.top,
        bottom: r.bottom,
        chars: (el.textContent ?? "").length,
        // A box that clips rather than wraps overflows its own content area.
        scrollWidth: el.scrollWidth,
        clientWidth: el.clientWidth,
        // One client rect per line box, so this counts rendered lines
        // without hardcoding a font metric (`line-height` is `normal` here,
        // which computes to the string, not a number).
        lines: (() => {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getClientRects().length;
        })(),
        vw: window.innerWidth,
        vh: window.innerHeight,
      };
    });

    // Premise: if this fails the overlay copy shrank, not the layout — the
    // readout is no longer long enough for this test to be measuring anything.
    expect(
      box.chars,
      "overlay hover text is long enough to overflow the window"
    ).toBeGreaterThan(100);
    expect(
      box.lines,
      "the readout wrapped onto more than one line"
    ).toBeGreaterThan(1);

    // The regression guard: every edge inside the window.
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(box.vw);
    expect(box.bottom).toBeLessThanOrEqual(box.vh);
    // ...and wrapped rather than clipped inside its own box.
    expect(box.scrollWidth).toBeLessThanOrEqual(box.clientWidth + 1);

    expect(pageErrors).toEqual([]);
  });
}
