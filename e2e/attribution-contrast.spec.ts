import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The credits row must be READABLE, not merely tappable — at every size, in
 * both themes.
 *
 * e2e/phone-attribution-clearance.spec.ts keeps every control in this row
 * reachable, and says so in its own words: "These are hit tests, not
 * screenshots: the row was always *drawn*." That left the other half of the
 * question unasked, and the answer turned out to depend on the theme.
 *
 * The row is the only HUD surface with nothing painted under it, so its
 * backdrop is whatever the globe canvas — which spans the whole viewport,
 * beneath every overlay — happens to be showing there.
 *
 *  - In LIGHT theme the canvas clears to the page colour and the globe's pale
 *    limb stops above the row. Measured at five widths and five window heights,
 *    the backdrop is a flat 5.54:1 with 0% of the row below AA. Above the phone
 *    breakpoint it needs no plate, and gets none.
 *  - In DARK theme the same geometry drives the atmosphere's bright blue limb
 *    straight through the line. Before the fix: worst pixel 1.37-2.22:1 with
 *    6-16% of the row's backdrop below the 4.5:1 AA floor for 12px text, at
 *    1280x900, 1280x700, 1440x760, 1024x600 and 768x600 alike — a live AA
 *    failure on the default desktop view for half the theme space.
 *  - At PHONE widths the layout lifts the row onto the imagery in BOTH themes,
 *    which is the case the plate was originally added for (worst pixel 1.01:1,
 *    33-64% of the row below AA).
 *
 * So `.attribution::before` is switched on in dark theme at any size, and at
 * phone widths in both. Two things are pinned here:
 *
 *  1. The contrast itself, measured off real pixels. This is the user-facing
 *     guarantee, and it is measured rather than asserted from the token because
 *     the plate is translucent — the composite over the imagery is what a
 *     reader actually sees, and an earlier attempt with `--panel-bg` (0.75
 *     alpha) composited to 3.57:1 and still failed.
 *  2. That the plate costs the row NO height. It is absolutely positioned
 *     precisely so the bottom-anchored HUD above it cannot be pushed up over
 *     the globe — the failure mode this suite has hit three times. Toggling the
 *     plate must not move the row or the panel by even a pixel.
 */

type Size = { w: number; h: number };

/** The phone layout lifts the row onto the imagery in both themes. */
const PHONES: Size[] = [
  { w: 360, h: 844 },
  { w: 390, h: 844 },
  { w: 540, h: 844 },
];

/**
 * Widths and window heights either side of the phone breakpoint. The heights
 * vary as well as the widths because the globe is sized from the viewport, so
 * a short window puts its limb nearer the credits than a tall one does.
 */
const DESKTOPS: Size[] = [
  { w: 768, h: 600 },
  { w: 1024, h: 600 },
  { w: 1280, h: 900 },
  { w: 1440, h: 760 },
];

/** WCAG 2.1 AA for text under 18.66px. The row renders at 12px. */
const AA_SMALL_TEXT = 4.5;

async function bootAt(page: Page, size: Size, theme: "light" | "dark") {
  await page.setViewportSize({ width: size.w, height: size.h });
  await page.goto("/");
  await awaitAppInteractive(page);
  if (theme === "dark") {
    await page.locator(".theme-toggle").click();
    await page.waitForTimeout(500);
  }
}

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

test.describe("attribution contrast", () => {
  // Light theme only needs the phone sizes: above the breakpoint its backdrop
  // is the flat page colour. Dark theme is checked everywhere, because that is
  // where the globe reaches the row at desktop sizes too.
  const CASES = {
    light: PHONES,
    dark: [...PHONES, ...DESKTOPS],
  } as const;

  for (const theme of ["light", "dark"] as const) {
    test(`the credits row clears AA over the globe in ${theme} theme`, async ({
      page,
    }) => {
      test.setTimeout(180_000);
      await bootAt(page, CASES[theme][0], theme);

      for (const size of CASES[theme]) {
        await page.setViewportSize({ width: size.w, height: size.h });
        // Let the toolbar's ResizeObserver publish and the row settle.
        await page.waitForTimeout(500);

        const worst = await backdropContrast(page);
        expect(
          worst,
          `${theme} ${size.w}x${size.h}: worst backdrop contrast ${worst}:1 behind 12px credits text`
        ).toBeGreaterThanOrEqual(AA_SMALL_TEXT);
      }
    });
  }

  test("the plate is out of flow, so the HUD above it cannot move", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    // Dark theme, so the plate is live at the desktop sizes too — those are the
    // ones this change newly switches it on for.
    await bootAt(page, { w: 390, h: 844 }, "dark");

    for (const size of [...PHONES, ...DESKTOPS]) {
      await page.setViewportSize({ width: size.w, height: size.h });
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

      const label = `${size.w}x${size.h}`;
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

  test("the plate follows the globe, not the breakpoint alone", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await bootAt(page, { w: 390, h: 844 }, "light");

    const plateOn = async () =>
      (await page.evaluate(
        () =>
          getComputedStyle(document.querySelector(".attribution")!, "::before")
            .content
      )) !== "none";

    const setWidth = async (w: number) => {
      await page.setViewportSize({ width: w, height: 844 });
      await page.waitForTimeout(400);
    };

    // Light theme: the phone layout lifts the row onto the imagery, so the
    // plate is on; above the breakpoint the backdrop is the flat page colour at
    // 5.54:1 and a plate would be decoration rather than contrast.
    await setWidth(540);
    expect(
      await plateOn(),
      "no plate at the top of the light phone layout"
    ).toBe(true);
    await setWidth(541);
    expect(
      await plateOn(),
      "the light-theme plate leaked past the phone breakpoint"
    ).toBe(false);

    // Dark theme: the globe reaches the row at every size, so the plate is on
    // at every size — the breakpoint stops governing it.
    await page.locator(".theme-toggle").click();
    await page.waitForTimeout(500);
    for (const w of [541, 1280]) {
      await setWidth(w);
      expect(
        await plateOn(),
        `the dark-theme plate is missing at ${w}px, where the globe reaches the row`
      ).toBe(true);
    }
  });

  test("the row's box hugs its credits so the plate is not a footer slab", async ({
    page,
  }) => {
    test.setTimeout(120_000);
    await bootAt(page, { w: 1280, h: 900 }, "dark");
    await page.waitForTimeout(400);

    const measured = await page.evaluate(() => {
      const row = document.querySelector<HTMLElement>(".attribution")!;
      const overlay = row.parentElement!;
      return {
        row: row.getBoundingClientRect().width,
        overlay: overlay.getBoundingClientRect().width,
      };
    });

    // The credits are one line at this width, so the row — and with it the
    // plate — should be appreciably narrower than the overlay it sits in.
    expect(
      measured.row,
      `the credits row spans ${measured.row}px of a ${measured.overlay}px overlay; the plate would slab the footer`
    ).toBeLessThan(measured.overlay * 0.9);
  });
});
