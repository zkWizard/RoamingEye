import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The tablet half of the coarse-pointer blind spot.
 *
 * `coarse-pointer-landscape.spec.ts` covers what happens when a touch device
 * has no vertical room: two 44px boxes end up in the same corner and the fix
 * moves one sideways. This is the opposite case. A tablet has room to spare,
 * and the defect there is that `.draw` reserves a FIXED 150px for the column
 * above it — brand, the two links, the theme toggle — while `@media (pointer:
 * coarse)` grows the links 29px -> 44 and the toggle 38px -> 44. The reserve
 * runs 21px short, so the 112px-wide draw button lands across the 44px toggle
 * and covers its centre.
 *
 * On main, `.theme-toggle` hit-tested to BUTTON.draw-button at its centre at
 * every size below except 768x1024, which clears by two pixels of sub-pixel
 * rounding rather than by design — so it is held here as the boundary case it
 * is, not as evidence the layout was sound.
 *
 * The tap did not miss quietly: it armed region drawing instead of switching
 * the theme.
 */

/** Sizes that regressed, plus the boundary that did not. */
const TABLET_SIZES = [
  { name: "820x1180", width: 820, height: 1180, blockedOnMain: true },
  { name: "834x1112", width: 834, height: 1112, blockedOnMain: true },
  { name: "1024x1366", width: 1024, height: 1366, blockedOnMain: true },
  { name: "1180x820", width: 1180, height: 820, blockedOnMain: true },
  { name: "1024x600", width: 1024, height: 600, blockedOnMain: true },
  { name: "768x1024", width: 768, height: 1024, blockedOnMain: false },
];

/** A tap aimed at the centre of the element has to land on the element. */
const hitCentre = (page: import("@playwright/test").Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { reachable: false, blockedBy: "missing" };
    const r = el.getBoundingClientRect();
    const at = document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)
    );
    if (at && (at === el || el.contains(at)))
      return { reachable: true, blockedBy: null };
    const owner = at?.closest("button,a,[id]");
    return {
      reachable: false,
      blockedBy: owner
        ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
        : (at?.tagName ?? "outside the window"),
    };
  }, selector);

for (const size of TABLET_SIZES) {
  test(`a touch device can reach the theme toggle at ${size.name}`, async ({
    browser,
  }) => {
    const context = await browser.newContext({
      viewport: { width: size.width, height: size.height },
      isMobile: true,
      hasTouch: true,
    });
    const page = await context.newPage();
    try {
      await page.goto("/");
      await awaitAppInteractive(page);

      // The premise: this really is the coarse layout, not the fine one.
      expect(
        await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
        "the context is not emulating a coarse pointer"
      ).toBe(true);

      // The control that was covered.
      expect(
        await hitCentre(page, ".theme-toggle"),
        "the theme toggle is covered on a touch device"
      ).toMatchObject({ reachable: true });

      // The control that was covering it keeps its own target: the fix moves
      // it down, it does not trade one blocked button for another.
      expect(
        await hitCentre(page, ".draw-button"),
        "the draw button lost its own target to the fix"
      ).toMatchObject({ reachable: true });

      // Both stay real 44px targets rather than merely uncovered ones.
      for (const sel of [".theme-toggle", ".draw-button"]) {
        const box = await page.locator(sel).boundingBox();
        expect(box!.width, `${sel} width`).toBeGreaterThanOrEqual(44);
        expect(box!.height, `${sel} height`).toBeGreaterThanOrEqual(44);
      }

      // The button is pushed DOWN, so the thing it must not reach is the panel
      // below it. Nothing in this rule may buy the toggle back by burying the
      // draw button in #controls.
      const clearsPanel = await page.evaluate(() => {
        const draw = document
          .querySelector<HTMLElement>(".draw")!
          .getBoundingClientRect();
        const controls = document
          .querySelector<HTMLElement>("#controls")!
          .getBoundingClientRect();
        return (
          draw.bottom <= controls.top ||
          draw.right <= controls.left ||
          draw.left >= controls.right
        );
      });
      expect(clearsPanel, "the draw button was pushed into #controls").toBe(
        true
      );

      // And the theme toggle actually works end to end, which is the
      // user-visible claim: a tap on it changes the theme rather than arming
      // region drawing.
      const before = await page.evaluate(() =>
        document.documentElement.getAttribute("data-theme")
      );
      await page.locator(".theme-toggle").click();
      await expect
        .poll(async () =>
          page.evaluate(() =>
            document.documentElement.getAttribute("data-theme")
          )
        )
        .not.toBe(before);

      // The draw button must not have been armed by that tap.
      await expect(page.locator(".draw-button")).toHaveAttribute(
        "aria-pressed",
        "false"
      );
    } finally {
      await context.close();
    }
  });
}
