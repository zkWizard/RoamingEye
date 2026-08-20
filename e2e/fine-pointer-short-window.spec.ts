import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A desktop window dragged short can still reach the theme toggle.
 *
 * The header's left column ends in the theme toggle and the HUD panel's
 * top-left corner — #hud-collapse — sits directly below it. The column's
 * height follows the WIDTH, because the brand and hint fonts are vw-clamped,
 * while the panel's top follows the HEIGHT, so below some height the two meet.
 *
 * coarse-pointer-header-row.spec.ts fixed that for a landscape phone and
 * stopped there, on the reasoning that mouse chrome is 52px shorter and so
 * could not reach. It reaches: measured on main through this suite's own
 * fine-pointer context, `.theme-toggle` lost its centre to DIV#controls or to
 * BUTTON#hud-collapse across a contiguous 300-335px band — nine of eleven
 * widths at 300, 310 and 315, eight at 320, seven at 325, and 800/812 still
 * blocked at 330 and 335. A click there folded the HUD or hit the panel
 * instead of switching the theme.
 *
 * This is a window, not a device: no phone is 320px tall in portrait, and a
 * phone in landscape is coarse and covered by the other spec. But
 * probe-overlap-landscape.spec.ts already drives 568x320 with a fine pointer,
 * so the band is surface this suite touches.
 *
 * The fix inlines the toggle onto the row its two siblings already share,
 * returning 46px to the gap above the panel. Every size below runs in one
 * context via setViewportSize — a fresh context per size costs ~1 minute.
 */

/** Widths that bracket the vw-clamped column: 800/812 are its longest. */
const WIDTHS = [568, 667, 740, 800, 812, 932, 1280];

/** The band the collision was measured across, plus a clear size above it. */
const HEIGHTS = [310, 320, 330, 335, 340, 400];

/** The WCAG 2.2 AA 2.5.8 floor. */
const AA_FLOOR = 24;

/**
 * Wait until the layout has stopped moving, not merely until the viewport
 * reports the new width.
 *
 * `setViewportSize` resolves as soon as the resize is applied, and on the
 * FIRST resize after boot the HUD is still assembling behind it: measured
 * under the suite's own config, #timeline is briefly laid out in flow at
 * 78-150 across the header — right over the toggle — before it collapses to
 * the zero box it holds for the rest of the run. A hit test taken in that
 * window blames whatever happens to be mid-reflow, which is how this spec
 * first failed against a fix that was working.
 *
 * Two consecutive identical samples of every box this spec asserts on mean no
 * reflow is still in flight, so the geometry now describes the settled page.
 */
const settled = (page: import("@playwright/test").Page) =>
  page.waitForFunction(
    () => {
      const key = [
        "#software-link",
        "#fleet-link",
        ".theme-toggle",
        "#controls",
        "#timeline",
      ]
        .map((s) => {
          const el = document.querySelector(s);
          if (!el) return "-";
          const b = el.getBoundingClientRect();
          return `${b.top}|${b.left}|${b.width}|${b.height}`;
        })
        .join(";");
      const store = window as unknown as { __settleKey?: string };
      const previous = store.__settleKey;
      store.__settleKey = key;
      return previous === key;
    },
    null,
    { timeout: 10_000, polling: 100 }
  );

/**
 * What can actually be pressed, not how big the box is — a boundingBox check
 * passes while a later-painted sibling owns half the pixels. Walk out from the
 * centre in 0.5px steps until the hit test stops returning the element, and
 * report the rect that survives plus whoever took the rest.
 */
const reachable = (page: import("@playwright/test").Page, selector: string) =>
  page.evaluate(
    ({ sel, limit }) => {
      const el = document.querySelector<HTMLElement>(sel);
      if (!el)
        return {
          found: false,
          width: 0,
          height: 0,
          centre: false,
          thief: "missing",
        };
      const r = el.getBoundingClientRect();
      const cx = Math.round(r.left + r.width / 2);
      const cy = Math.round(r.top + r.height / 2);
      const owns = (x: number, y: number) => {
        const at = document.elementFromPoint(Math.round(x), Math.round(y));
        return !!at && (at === el || el.contains(at));
      };
      const name = (x: number, y: number) => {
        const at = document.elementFromPoint(Math.round(x), Math.round(y));
        const owner = at?.closest("button,a,[id]");
        return owner
          ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
          : (at?.tagName ?? "outside the window");
      };
      const walk = (dx: number, dy: number) => {
        let d = 0;
        for (let step = 0.5; step <= limit; step += 0.5) {
          if (!owns(cx + dx * step, cy + dy * step)) break;
          d = step;
        }
        return d;
      };
      const centre = owns(cx, cy);
      return {
        found: true,
        centre,
        width: centre ? walk(-1, 0) + walk(1, 0) : 0,
        height: centre ? walk(0, -1) + walk(0, 1) : 0,
        thief: centre ? name(cx, cy + walk(0, 1) + 1) : name(cx, cy),
      };
    },
    { sel: selector, limit: 60 }
  );

test("the theme toggle and its row survive a short desktop window", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  // The premise: this really is the fine layout the rule is scoped to. If a
  // project ever runs this spec under touch emulation the other spec governs,
  // and these assertions would be measuring someone else's rule.
  expect(
    await page.evaluate(() => matchMedia("(pointer: fine)").matches),
    "the context is not emulating a fine pointer"
  ).toBe(true);

  for (const height of HEIGHTS) {
    for (const width of WIDTHS) {
      const name = `${width}x${height}`;
      await page.setViewportSize({ width, height });
      await page.waitForFunction((w) => window.innerWidth === w, width, {
        timeout: 5_000,
      });
      await settled(page);

      const toggle = await reachable(page, ".theme-toggle");
      expect(toggle.found, `${name}: no theme toggle`).toBe(true);
      expect(
        toggle.centre,
        `${name}: the theme toggle's centre belongs to ${toggle.thief} — a click there does something else`
      ).toBe(true);
      expect(
        toggle.height,
        `${name}: the theme toggle is reachable over only ${toggle.height}px vertically (${toggle.thief} takes the rest)`
      ).toBeGreaterThanOrEqual(AA_FLOOR);
      expect(
        toggle.width,
        `${name}: the theme toggle is reachable over only ${toggle.width}px horizontally`
      ).toBeGreaterThanOrEqual(AA_FLOOR);

      // Did the fix eat a neighbour? The toggle moved onto a row these two
      // already occupied.
      //
      // #hud-collapse is deliberately NOT asserted here. It is blocked on
      // unmodified main across a 320-340 band under a fine pointer —
      // BUTTON.draw-button owns its centre at 932x320, at five widths at 330
      // and at seven at 340 — because `.draw` reserves a fixed 150px that the
      // panel's top slides under. That is the same shape as the two rules
      // above it in style.css and wants the same one-line fix, but it is a
      // second defect this change neither causes nor repairs: the rule here
      // moves nothing but the toggle. Asserting it would make this spec fail
      // for someone else's reason. Filed for its own PR.
      for (const sel of ["#software-link", "#fleet-link"]) {
        const n = await reachable(page, sel);
        expect(
          n.centre,
          `${name}: ${sel} lost its centre to ${n.thief} — the fix traded one blocked control for another`
        ).toBe(true);
      }

      // The mechanism, asserted only where the rule applies. It is 38px
      // against the links' 29 and centred on them, so the test is that their
      // boxes overlap vertically, not that their tops match. Above the
      // threshold the toggle keeps its own row and only the reachability
      // assertions above are in force — 400 is here to hold that line.
      const rows = await page.evaluate(() =>
        ["#software-link", ".theme-toggle"].map((s) => {
          const el = document.querySelector<HTMLElement>(s);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left };
        })
      );
      const [link, tog] = rows;
      expect(link && tog, `${name}: a header control is missing`).toBeTruthy();
      const shares = tog!.top < link!.bottom && link!.top < tog!.bottom;
      if (height <= 340) {
        expect(
          shares,
          `${name}: the theme toggle is not on the links' row (link ${link!.top}-${link!.bottom}, toggle ${tog!.top}-${tog!.bottom})`
        ).toBe(true);
        expect(
          tog!.left,
          `${name}: the toggle did not move to the right of the links`
        ).toBeGreaterThan(link!.left);
      } else {
        expect(
          shares,
          `${name}: the toggle joined the links' row above the threshold — the rule is leaking out of its band`
        ).toBe(false);
      }
    }
  }

  // And the control still does its job, at a size that was blocked on main.
  await page.setViewportSize({ width: 812, height: 320 });
  const before = await page.evaluate(
    () => document.documentElement.dataset.theme ?? ""
  );
  await page.locator(".theme-toggle").click();
  await expect
    .poll(() =>
      page.evaluate(() => document.documentElement.dataset.theme ?? "")
    )
    .not.toBe(before);
});
