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
 * box, so the layout is untouched, and grows it strictly downward — away from
 * the search field that was already taking from it.
 *
 * Both halves are asserted here, because either one alone is a regression
 * waiting to happen: the target has to be 44px under the thumb, AND it must not
 * have bought that by eating the search field or by growing the header.
 */

/**
 * Widths where the hint renders under a coarse pointer. 560 is the clipped
 * case that was actually broken; 667 is a landscape phone; 820 is a tablet,
 * where the search field is horizontally disjoint and nothing ever clipped.
 */
const SIZES = [
  { name: "560x400 (search field clips the badge)", width: 560, height: 400 },
  { name: "667x375 (landscape phone)", width: 667, height: 375 },
  { name: "820x1180 (tablet)", width: 820, height: 1180 },
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
