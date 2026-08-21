import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The credits row must be READABLE on a phone, not merely tappable.
 *
 * e2e/phone-attribution-clearance.spec.ts already keeps every control in this
 * row reachable, and says so in its own words: "These are hit tests, not
 * screenshots: the row was always *drawn*." That left the other half of the
 * question unasked. Above 540px the row sits on the page background and
 * measures a uniform 5.54:1, but the phone layout lifts it onto the imagery,
 * where its backdrop is whatever pixels the globe happens to be showing.
 * Measured over the boot view before the fix, the worst pixel reached 1.01:1
 * and 33-64% of the row's backdrop sat below the 4.5:1 AA threshold for 12px
 * text — the four data-source credits and the three controls beside them were
 * drawn, hit-testable, and unreadable.
 *
 * `.attribution::before` puts the app's standard `--panel-bg-strong` plate
 * under the row at phone widths, which makes the backdrop deterministic
 * instead of image-dependent. Two things are pinned here:
 *
 *  1. The contrast itself, measured off real pixels in both themes. This is
 *     the user-facing guarantee, and it is measured rather than asserted from
 *     the token because the plate is translucent — the composite over dark
 *     imagery is what a reader actually sees, and an earlier attempt with
 *     `--panel-bg` (0.75 alpha) composited to 3.57:1 and still failed.
 *  2. That the plate costs the row NO height. It is absolutely positioned
 *     precisely so the bottom-anchored HUD above it cannot be pushed up over
 *     the globe — the failure mode this suite has hit three times. Toggling
 *     the plate must not move the row or the panel by even a pixel.
 */

const PHONES = [360, 390, 540];

/** WCAG 2.1 AA for text under 18.66px. The row renders at 12px. */
const AA_SMALL_TEXT = 4.5;

/**
 * Worst-case contrast between the row's text colour and the pixels actually
 * behind its glyphs.
 *
 * The glyphs are hidden with `color: transparent`, NOT `visibility: hidden` —
 * visibility is inherited by pseudo-elements, so hiding the element would hide
 * the very plate under test and measure the bare globe again.
 */
async function backdropContrast(page: Page): Promise<number> {
  const meta = await page.evaluate(() => {
    const row = document.querySelector<HTMLElement>(".attribution")!;
    const rect = row.getBoundingClientRect();
    return {
      box: {
        x: Math.round(rect.x),
        y: Math.round(rect.y),
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      },
      color: getComputedStyle(row).color,
    };
  });

  const marker = "contrast-probe-sheet";
  await page.addStyleTag({
    content: `/* ${marker} */ .attribution, .attribution * { color: transparent !important; }`,
  });
  await page.waitForTimeout(250);
  const shot = await page.screenshot({
    clip: {
      x: meta.box.x,
      y: meta.box.y,
      width: meta.box.w,
      height: meta.box.h,
    },
  });
  await page.evaluate((m) => {
    for (const sheet of Array.from(document.querySelectorAll("style"))) {
      if (sheet.textContent && sheet.textContent.includes(m)) sheet.remove();
    }
  }, marker);

  return page.evaluate(
    async (args: { b64: string; color: string }) => {
      const img = new Image();
      img.src = "data:image/png;base64," + args.b64;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;

      // WCAG relative luminance.
      const lin = (v: number) => {
        const c = v / 255;
        return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
      };
      const lum = (r: number, g: number, b: number) =>
        0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratio = (a: number, b: number) =>
        (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);

      const parts = (args.color.match(/[\d.]+/g) || []).slice(0, 3).map(Number);
      const textLum = lum(parts[0], parts[1], parts[2]);

      let worst = Infinity;
      for (let i = 0; i < data.length; i += 4) {
        const r = ratio(textLum, lum(data[i], data[i + 1], data[i + 2]));
        if (r < worst) worst = r;
      }
      return Math.round(worst * 100) / 100;
    },
    { b64: shot.toString("base64"), color: meta.color }
  );
}

test.describe("phone attribution contrast", () => {
  for (const theme of ["light", "dark"] as const) {
    test(`the credits row clears AA over the globe in ${theme} theme`, async ({
      page,
    }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto("/");
      await awaitAppInteractive(page);
      if (theme === "dark") {
        await page.locator(".theme-toggle").click();
        await page.waitForTimeout(500);
      }

      for (const width of PHONES) {
        await page.setViewportSize({ width, height: 844 });
        // Let the toolbar's ResizeObserver publish and the row settle.
        await page.waitForTimeout(500);

        const worst = await backdropContrast(page);
        expect(
          worst,
          `${theme} ${width}x844: worst backdrop contrast ${worst}:1 behind 12px credits text`
        ).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
      }
    });
  }

  test("the plate is out of flow, so the HUD above it cannot move", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await awaitAppInteractive(page);
    await page.waitForTimeout(500);

    for (const width of PHONES) {
      await page.setViewportSize({ width, height: 844 });
      await page.waitForTimeout(500);

      const geometry = await page.evaluate(() => {
        const read = () => {
          const row = document
            .querySelector(".attribution")!
            .getBoundingClientRect();
          const panel = document
            .querySelector("#controls")!
            .getBoundingClientRect();
          return { row: row.top, rowHeight: row.height, panel: panel.top };
        };
        const withPlate = read();
        // Suppressing the plate must change nothing but the paint.
        const style = document.createElement("style");
        style.textContent =
          ".attribution::before { content: none !important; }";
        document.head.appendChild(style);
        const withoutPlate = read();
        style.remove();
        return { withPlate, withoutPlate };
      });

      const label = `${width}x844`;
      expect(
        Math.abs(geometry.withPlate.row - geometry.withoutPlate.row),
        `${label}: credits row moved when the plate was toggled`
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(
          geometry.withPlate.rowHeight - geometry.withoutPlate.rowHeight
        ),
        `${label}: credits row changed height when the plate was toggled`
      ).toBeLessThanOrEqual(0.5);
      expect(
        Math.abs(geometry.withPlate.panel - geometry.withoutPlate.panel),
        `${label}: HUD panel moved when the plate was toggled — the plate is in flow`
      ).toBeLessThanOrEqual(0.5);
    }
  });

  test("the plate is scoped to the phone layout", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await awaitAppInteractive(page);

    const plateContent = () =>
      page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".attribution")!, "::before")
            .content
      );

    await page.setViewportSize({ width: 540, height: 844 });
    await page.waitForTimeout(400);
    expect(
      await plateContent(),
      "no plate at the top of the phone layout"
    ).not.toBe("none");

    // Above the breakpoint the row is back on the page background, which
    // already measures 5.54:1 — the plate would be decoration, not contrast.
    await page.setViewportSize({ width: 541, height: 844 });
    await page.waitForTimeout(400);
    expect(
      await plateContent(),
      "the plate leaked past the phone breakpoint"
    ).toBe("none");
  });
});
