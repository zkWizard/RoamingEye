import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The phone bottom bar must not sit on the attribution row.
 *
 * At 540px and under the overlay toolbar stops being a right-hand column and
 * becomes a bar pinned across the bottom of the screen, and `.overlay--bottom`
 * moves up by a fixed `3.6rem` to get out of its way. That constant was 18px
 * short of the bar's real height, so the last line of the attribution — which
 * carries the "Data providers" button, the repository link and the feedback
 * link — rendered underneath the bar and its taps landed on the toolbar
 * instead. The links are the app's provenance and contribution surface, so
 * losing them on a phone loses more than a row of small print.
 *
 * The row is lifted clear by the shortfall between that reserve and the bar's
 * measured height, which Toolbar.ts publishes as `--toolbar-height`. That
 * covers the home indicator too: `env(safe-area-inset-bottom)` is inside the
 * bar's own padding, so a notched phone grows the bar and the lift together.
 *
 * The lift is on the credits line alone, not on the reserve above it. The
 * overlay is bottom-anchored, so raising it would carry the HUD panel up by
 * the same amount — and the panel's top edge is already close enough to the
 * globe point hover-tooltip.spec.ts hovers at 390px that 18px pushed it over.
 * The last test here pins that: the panel must not move with the bar.
 *
 * These are hit tests, not screenshots: the row was always *drawn* — Chromium
 * paints the toolbar's translucent panel over it — and only the hit test says
 * who receives the tap.
 */

const PHONES = [
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "small Android", width: 360, height: 740 },
  { name: "iPhone Pro Max", width: 430, height: 932 },
  // The widest viewport still on the phone layout: the bar is at its longest
  // here, so it is the last width where the reserve could be wrong.
  { name: "phone breakpoint", width: 540, height: 900 },
];

/** Every link and button in the attribution row, in DOM order. */
const ATTRIBUTION = [
  "#providers-link",
  '.attribution a[href$="/RoamingEye"]',
  '.attribution a[href*="issues"]',
];

async function ownsItsCentre(page: Page, selector: string) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el)
      return {
        found: false,
        selector: sel,
        owns: false,
        y: 0,
        bottom: 0,
        hit: "",
      };
    // These are inline links in running text, so one of them can wrap across
    // two lines — and then its bounding rect is the union of both line boxes
    // and the centre of that union falls in the gap between them, on whichever
    // link happens to sit at that x on the other line. CI's text metrics wrap
    // this row differently from a local run, so the union's centre is not a
    // stable probe: hit-test each line box instead.
    const rects = Array.from(el.getClientRects());
    const name = (n: Element | null) =>
      n
        ? `${n.tagName.toLowerCase()}${n.id ? "#" + n.id : ""}.${String(n.className).split(" ")[0]}`
        : "null";
    let worst: { y: number; hit: string } | null = null;
    for (const r of rects) {
      const hit = document.elementFromPoint(
        r.x + r.width / 2,
        r.y + r.height / 2
      );
      if (!hit || !(hit === el || el.contains(hit))) {
        worst = { y: Math.round(r.y + r.height / 2), hit: name(hit) };
        break;
      }
    }
    return {
      found: true,
      selector: sel,
      owns: rects.length > 0 && worst === null,
      y: worst ? worst.y : Math.round(el.getBoundingClientRect().top),
      bottom: Math.round(el.getBoundingClientRect().bottom),
      hit: worst ? worst.hit : "self",
    };
  }, selector);
}

test.describe("phone attribution clearance", () => {
  test("the bottom bar never covers an attribution link", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    for (const phone of PHONES) {
      await page.setViewportSize({
        width: phone.width,
        height: phone.height,
      });
      // Let the toolbar's ResizeObserver publish the new bar height and the
      // overlay re-lay out against it before hit-testing.
      await page.waitForTimeout(250);

      const barTop = await page.evaluate(
        () =>
          document.querySelector(".toolbar")?.getBoundingClientRect().top ?? 0
      );

      for (const selector of ATTRIBUTION) {
        const result = await ownsItsCentre(page, selector);
        expect(result.found, `${selector} missing at ${phone.name}`).toBe(true);
        expect(
          result.owns,
          `${phone.name} ${phone.width}x${phone.height}: ${selector} centre at y=${result.y} hit ${result.hit} (bar top ${Math.round(barTop)})`
        ).toBe(true);
        // Belt and braces: the row must clear the bar outright, not merely
        // win the hit test by z-order.
        expect(
          result.bottom,
          `${phone.name}: ${selector} bottom ${result.bottom} vs bar top ${Math.round(barTop)}`
        ).toBeLessThanOrEqual(Math.round(barTop));
      }
    }
  });

  test("tapping Data providers on a phone opens the modal", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 430, height: 932 });
    await page.goto("/");
    await awaitAppInteractive(page);

    // Drive the real pointer at the button's own coordinates rather than
    // locator.click(), which retries and scrolls; the defect was that the tap
    // at those coordinates reached the toolbar, and only a raw click shows it.
    const box = await page.locator("#providers-link").boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.click(box!.x + box!.width / 2, box!.y + box!.height / 2);

    await expect(page.locator("#providers-page")).toHaveClass(/is-open/);
  });

  test("the reserve tracks the bar instead of a fixed guess", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await awaitAppInteractive(page);
    await page.waitForTimeout(250);

    const measured = await page.evaluate(() => {
      const bar = document.querySelector(".toolbar")!.getBoundingClientRect();
      const published = getComputedStyle(
        document.documentElement
      ).getPropertyValue("--toolbar-height");
      return { barHeight: bar.height, published: published.trim() };
    });

    // The published value is what the lift is computed from, so it has to be
    // the bar's real height — a stale or absent one is how the old constant
    // drifted away from the bar in the first place.
    expect(measured.published).not.toBe("");
    const publishedPx = Number.parseFloat(measured.published);
    expect(Math.abs(publishedPx - measured.barHeight)).toBeLessThanOrEqual(1);
  });

  test("the HUD panel does not move with the bar", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await awaitAppInteractive(page);
    await page.waitForTimeout(250);

    // The first attempt at this fix reserved the bar's height on the
    // bottom-anchored overlay, which lifted the HUD panel along with the
    // credits line and pushed the panel over the globe point
    // hover-tooltip.spec.ts hovers a volcano marker at — green locally, red on
    // CI, where the panel's text wraps taller. Driving the property directly
    // says whether the panel is coupled to the bar at all, without depending
    // on how tall the panel happens to render.
    const moved = await page.evaluate(() => {
      const panel = document.querySelector("#controls")!;
      const credits = document.querySelector(".attribution")!;
      const before = {
        panel: panel.getBoundingClientRect().top,
        credits: credits.getBoundingClientRect().top,
      };
      document.documentElement.style.setProperty("--toolbar-height", "300px");
      const after = {
        panel: panel.getBoundingClientRect().top,
        credits: credits.getBoundingClientRect().top,
      };
      return { before, after };
    });

    expect(
      Math.abs(moved.after.panel - moved.before.panel)
    ).toBeLessThanOrEqual(1);
    // ...while the credits line does follow it, or the lift is not wired up.
    expect(moved.before.credits - moved.after.credits).toBeGreaterThan(100);
  });
});
