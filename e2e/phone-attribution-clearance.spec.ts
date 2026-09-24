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
 * The overlay now stands on the bar's measured height, which Toolbar.ts
 * publishes as `--toolbar-height`. That covers the home indicator too:
 * `env(safe-area-inset-bottom)` is inside the bar's own padding, so a notched
 * phone grows the bar and the reserve together.
 *
 * For a while only the credits line was lifted by the shortfall, because the
 * overlay is bottom-anchored and raising all of it carried the old 373px HUD
 * panel over the globe point hover-tooltip.spec.ts hovers. The compact dock
 * that replaced the panel has room to take the full offset, and the lifted
 * credits line had begun to overlap the dock's last row. The last test here
 * pins the current coupling: the credits follow the bar, and the dock rides
 * above the credits at any bar height.
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

  test("the credits follow the bar, and the dock never sits on them", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/");
    await awaitAppInteractive(page);
    await page.waitForTimeout(250);

    // Driving the property directly says whether the credits are coupled to
    // the bar at all, and whether the dock keeps clear of them at a bar height
    // far from today's, without depending on how tall anything renders. The
    // credits' plate reaches 0.3rem above the line's own box (see
    // `.attribution::before`), so the dock has to clear that too.
    const read = await page.evaluate(() => {
      const panel = document.querySelector("#controls")!;
      const credits = document.querySelector(".attribution")!;
      const plateReach =
        0.3 *
        Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
      const sample = () => ({
        panelBottom: panel.getBoundingClientRect().bottom,
        plateTop: credits.getBoundingClientRect().top - plateReach,
        credits: credits.getBoundingClientRect().top,
      });
      const before = sample();
      document.documentElement.style.setProperty("--toolbar-height", "300px");
      const after = sample();
      return { before, after };
    });

    // The credits line follows the bar, or the reserve is not wired up.
    expect(read.before.credits - read.after.credits).toBeGreaterThan(100);
    // And the dock rides above the credits' plate at both bar heights.
    expect(read.before.panelBottom).toBeLessThanOrEqual(read.before.plateTop);
    expect(read.after.panelBottom).toBeLessThanOrEqual(read.after.plateTop);
  });
});
