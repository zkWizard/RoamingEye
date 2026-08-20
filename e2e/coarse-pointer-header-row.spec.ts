import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A phone held in landscape can reach the theme toggle.
 *
 * The header's left column ends in the theme toggle, and the HUD's fold
 * control (#hud-collapse) sits at the panel's top-left corner directly below
 * it. The two are drawn by different rules: the column's height follows the
 * WIDTH, because the brand and hint fonts are vw-clamped, while the panel's
 * top follows the HEIGHT. Below ~360px of viewport height they meet.
 *
 * On main under touch emulation, `.theme-toggle` hit-tested to
 * BUTTON#hud-collapse at its centre at 568x320 — a size
 * coarse-pointer-landscape.spec.ts already drives, where it asserts
 * #hud-collapse and .draw-button but never the toggle. So the tap did not miss
 * quietly: it folded the HUD instead of switching the theme, the third time a
 * 44px box has grown into that corner unobserved (see the two rules above this
 * one in style.css). A 10-width x 13-height sweep found the dead band
 * contiguous — every width tested at 320 and 340, eight of ten at 350, and
 * 800x360 — and at 740x360 the centre survived while the reachable area
 * clipped to ~23px, under the WCAG 2.5.8 floor of 24.
 *
 * The fix spends no space: #software-link and #fleet-link are already
 * inline-block and already share a row, and the toggle's mount is the only
 * block among the three, so it took a row of its own. Inline, it joins theirs
 * and returns 52px to the gap above the panel.
 *
 * The sizes below are real landscape phones. Every one rides in a single
 * browser context via setViewportSize — a fresh context per size costs ~1
 * minute and this suite is the blocking gate.
 */

const SIZES = [
  { name: "568x320", width: 568, height: 320 }, // iPhone SE / 5s
  { name: "667x375", width: 667, height: 375 }, // iPhone 6-8
  { name: "740x360", width: 740, height: 360 }, // common Android
  { name: "800x360", width: 800, height: 360 }, // the widest 360 phone
  { name: "812x375", width: 812, height: 375 }, // iPhone X / 11 Pro
  { name: "844x390", width: 844, height: 390 }, // iPhone 12-14
  { name: "932x430", width: 932, height: 430 }, // iPhone 15 Pro Max
];

/** The WCAG 2.2 AA 2.5.8 floor. */
const AA_FLOOR = 24;

/**
 * What can actually be pressed, not how big the box is.
 *
 * `boundingBox() >= 24` is not a target-size assertion: it passes while a
 * later-painted sibling owns half the pixels. So walk out from the centre in
 * 0.5px steps until the hit test stops returning the element, in all four
 * directions, and report the rect that survives — plus whoever took the rest.
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

test("the theme toggle and its row survive a landscape phone", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: SIZES[0].width, height: SIZES[0].height },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await awaitAppInteractive(page);

    // The premise: this really is the coarse layout the rule is scoped to.
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context is not emulating a coarse pointer"
    ).toBe(true);

    for (const size of SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      // Let the media query and the reflow it triggers settle.
      await page.waitForFunction((w) => window.innerWidth === w, size.width, {
        timeout: 5_000,
      });

      const toggle = await reachable(page, ".theme-toggle");
      expect(toggle.found, `${size.name}: no theme toggle`).toBe(true);
      expect(
        toggle.centre,
        `${size.name}: the theme toggle's centre belongs to ${toggle.thief} — a tap there does something else`
      ).toBe(true);
      expect(
        toggle.height,
        `${size.name}: the theme toggle is reachable over only ${toggle.height}px vertically (${toggle.thief} takes the rest)`
      ).toBeGreaterThanOrEqual(AA_FLOOR);
      expect(
        toggle.width,
        `${size.name}: the theme toggle is reachable over only ${toggle.width}px horizontally`
      ).toBeGreaterThanOrEqual(AA_FLOOR);

      // Did the fix eat a neighbour? The toggle moved onto a row two other
      // controls already occupied, and it sits above two more.
      for (const sel of [
        "#software-link",
        "#fleet-link",
        "#hud-collapse",
        ".draw-button",
      ]) {
        const n = await reachable(page, sel);
        expect(
          n.centre,
          `${size.name}: ${sel} lost its centre to ${n.thief} — the fix traded one blocked control for another`
        ).toBe(true);
        expect(
          n.height,
          `${size.name}: ${sel} is reachable over only ${n.height}px vertically`
        ).toBeGreaterThanOrEqual(AA_FLOOR);
      }

      // The mechanism itself: one row, not two. Tops within a pixel of each
      // other is what "shares a row" means, and it is what returns the 52px.
      const tops = await page.evaluate(() =>
        ["#software-link", "#fleet-link", ".theme-toggle"].map((s) => {
          const el = document.querySelector<HTMLElement>(s);
          return el ? +el.getBoundingClientRect().top.toFixed(1) : NaN;
        })
      );
      expect(
        Math.max(...tops) - Math.min(...tops),
        `${size.name}: the header controls are not on one row (tops ${tops.join(", ")})`
      ).toBeLessThanOrEqual(1);
    }

    // And the control still does its job, at the size that was broken.
    await page.setViewportSize({ width: 568, height: 320 });
    const before = await page.evaluate(
      () => document.documentElement.dataset.theme ?? ""
    );
    await page.locator(".theme-toggle").click();
    await expect
      .poll(() =>
        page.evaluate(() => document.documentElement.dataset.theme ?? "")
      )
      .not.toBe(before);
  } finally {
    await context.close();
  }
});
