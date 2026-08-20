import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The third coarse-pointer blind spot: the `?` badge in the header hint.
 *
 * `@media (pointer: coarse)` grows every other piece of chrome to 44px, but it
 * cannot list this one — the badge sits inline in the hint sentence, so a
 * `min-height` would grow that line and push the header down. It was therefore
 * left at 24x24, which reads as "clears the WCAG 2.2 AA floor (2.5.8) exactly".
 *
 * It did not clear it. `.search__field` is 38px tall and, between 541px (the
 * narrowest width that still renders the hint — below that `.hint` is
 * `display: none`) and roughly 600px, its box overhangs the badge's top edge by
 * up to 3.8px. `#search` comes after `<header>` in the document, so it wins
 * those pixels: on main the badge hit-tested to `.search__field` one pixel
 * below its own top edge, and its reachable area measured 25x21 — UNDER the
 * 24px floor, on the only control in the app that was already at the floor.
 *
 * The fix gives the button a transparent `::after` hit area instead of a bigger
 * box, so the layout is untouched.
 *
 * Both halves are asserted here, because either one alone is a regression
 * waiting to happen: the target has to be 44px under the thumb, AND it must not
 * have bought that by eating the search field or by growing the header.
 *
 * THE 541-660 BAND, and why it is now asserted rather than filed. This spec
 * originally promised 44px only at >=667, because the badge sat at the END of
 * the hint sentence: its x was a pure function of how wide that sentence
 * RENDERED, so as text metrics widened (CI's fonts are wider than a typical
 * local box) it drifted right into the absolutely positioned search/share
 * column and was squeezed from both sides at once — search field above, share
 * button below. Measured across letter-spacing 0/0.5/1.0/1.5px as a proxy for
 * that spread, the badge's own CENTRE hit-tested to `.share-button` at 620-660.
 * No hit area can fix an occlusion from both directions.
 *
 * The layout change that fixed it: the badge now LEADS the hint sentence, so
 * it is anchored to the header's left padding and its x no longer depends on
 * the text at all. That is what makes the band assertable, and it is why the
 * sweep below is part of this spec rather than a separate one — the promise
 * being made is that no text metric can move this control into another
 * control's lane.
 */

/**
 * Sizes booted individually, spanning the band floor (541, the narrowest width
 * that still renders the hint) to a large tablet. Each pays a full boot, so the
 * width sweep across the rest of the band shares a single context instead.
 */
const SIZES = [
  { name: "541x800 (band floor)", width: 541, height: 800 },
  { name: "667x375 (landscape phone)", width: 667, height: 375 },
  { name: "768x1024 (tablet portrait)", width: 768, height: 1024 },
  { name: "1024x1366 (large tablet)", width: 1024, height: 1366 },
];

/**
 * The size of the target actually under the thumb: walk out from the badge's
 * centre in each direction until the hit test stops naming the button, and
 * return the span through that centre. This measures the union of the button
 * box and its `::after`, minus whatever a later sibling paints on top — which
 * is the whole point, since the defect was an occlusion rather than a size.
 */
const reachableThroughCentre = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const btn = document.querySelector<HTMLElement>("#shortcuts-link");
    if (!btn) return { width: 0, height: 0, centreBlockedBy: "missing" };
    const r = btn.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;

    const hits = (x: number, y: number) => {
      const at = document.elementFromPoint(x, y);
      return !!at && (at === btn || btn.contains(at));
    };

    if (!hits(cx, cy)) {
      const at = document.elementFromPoint(cx, cy);
      const owner = at?.closest("button,a,[id],[class]");
      return {
        width: 0,
        height: 0,
        centreBlockedBy: owner
          ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
          : (at?.tagName ?? "outside the window"),
      };
    }

    // 0.5px steps: fine enough that a 44px box never reads as 43, coarse
    // enough that the walk stays cheap. Capped so a bug cannot spin here.
    const walk = (dx: number, dy: number) => {
      let d = 0;
      while (d < 120 && hits(cx + dx * (d + 0.5), cy + dy * (d + 0.5)))
        d += 0.5;
      return d;
    };

    return {
      width: walk(-1, 0) + walk(1, 0),
      height: walk(0, -1) + walk(0, 1),
      centreBlockedBy: null as string | null,
    };
  });

for (const size of SIZES) {
  test(`the shortcuts badge is a 44px target at ${size.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await awaitAppInteractive(page);

      // The premise: this really is the coarse layout, and the hint renders.
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        "the context is not emulating a coarse pointer"
      ).toBe(true);
      await expect(page.locator("#shortcuts-link")).toBeVisible();

      // The defect: on main this measured 25x21 at 560 wide.
      const reach = await reachableThroughCentre(page);
      expect(
        reach.centreBlockedBy,
        "the badge's own centre is covered"
      ).toBeNull();
      expect(
        reach.width,
        "the reachable width under a thumb"
      ).toBeGreaterThanOrEqual(44);
      expect(
        reach.height,
        "the reachable height under a thumb"
      ).toBeGreaterThanOrEqual(44);

      // The fix must stay invisible: a hit area, not a bigger badge. This is
      // what catches a later "just add it to the 44px selector list", which
      // would grow the hint line and push the whole header down.
      const box = await page.locator("#shortcuts-link").boundingBox();
      expect(box!.width, "the visible badge grew").toBeCloseTo(24, 1);
      expect(box!.height, "the visible badge grew").toBeCloseTo(24, 1);

      // And it must not have been bought from the neighbour. The search
      // field's own bottom edge, directly above the badge, still belongs to
      // the search field.
      const searchIntact = await page.evaluate(() => {
        const field = document.querySelector<HTMLElement>(".search__field");
        const btn = document.querySelector<HTMLElement>("#shortcuts-link");
        if (!field || !btn) return "missing";
        const f = field.getBoundingClientRect();
        const b = btn.getBoundingClientRect();
        const x = b.left + b.width / 2;
        // Only meaningful where the two actually share an x range.
        if (x < f.left || x > f.right) return "ok";
        const at = document.elementFromPoint(x, f.bottom - 1);
        return at && (at === field || field.contains(at))
          ? "ok"
          : `stolen by ${at?.id || at?.className || at?.tagName}`;
      });
      expect(searchIntact, "the fix ate into the search field").toBe("ok");

      // The user-visible claim, end to end: a tap on the badge opens the
      // shortcuts overlay rather than landing in the search box.
      const overlay = page.locator("#shortcuts-page");
      await expect(overlay).not.toHaveClass(/is-open/);
      await page.locator("#shortcuts-link").click();
      await expect(overlay).toHaveClass(/is-open/);
    } finally {
      await context.close();
    }
  });
}

/**
 * The band, swept in ONE context. Every width here used to fail at some text
 * metric, and 620-660 failed outright at the widest: the badge's centre landed
 * on `.share-button`, so a tap opened the share menu instead of the shortcuts
 * overlay.
 *
 * Resizing rather than re-booting is deliberate: each fresh context re-pays the
 * GIBS boot gate (~1 min), which is what keeps this affordable in the required
 * smoke suite. Layout here is a pure function of viewport width, so a resize
 * measures the same thing a boot would.
 *
 * `letter-spacing` stands in for CI's wider font metrics — the same proxy that
 * originally exposed the defect, and the reason a local-only check would have
 * called this band healthy.
 */
const BAND = [541, 560, 580, 600, 620, 640, 660];
const METRICS = [0, 0.5, 1, 1.5];

test("the shortcuts badge clears the search/share column across 541-660", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 700, height: 800 },
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await awaitAppInteractive(page);

    const failures: string[] = [];
    for (const spacing of METRICS) {
      await page.evaluate((value) => {
        const id = "metric-proxy";
        let style = document.querySelector<HTMLStyleElement>(`#${id}`);
        if (!style) {
          style = document.createElement("style");
          style.id = id;
          document.head.appendChild(style);
        }
        style.textContent = `.hint { letter-spacing: ${value}px; }`;
      }, spacing);

      for (const width of BAND) {
        await page.setViewportSize({ width, height: 800 });
        const reach = await reachableThroughCentre(page);
        const at = `${width}px @ letter-spacing ${spacing}px`;
        if (reach.centreBlockedBy) {
          failures.push(`${at}: centre covered by ${reach.centreBlockedBy}`);
        } else if (reach.width < 44 || reach.height < 44) {
          failures.push(`${at}: only ${reach.width}x${reach.height} reachable`);
        }
      }
    }

    expect(failures, "the badge is occluded somewhere in the band").toEqual([]);
  } finally {
    await context.close();
  }
});
