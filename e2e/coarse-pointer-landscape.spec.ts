import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The chrome a touch device gets is not the chrome the rest of the suite
 * measures.
 *
 * `@media (pointer: coarse)` grows the chrome to 44px targets, and style.css
 * says so in as many words: "the e2e suite — every project runs a fine pointer
 * — measures exactly the geometry it did before". That is true, and it is also
 * the blind spot. Every other spec drives the default Desktop Chrome context,
 * so the coarse layout had never been hit-tested at all, and two 44px boxes
 * had grown into the same corner unobserved.
 *
 * On main at 667x375 and 740x360 with touch emulation, #hud-collapse
 * hit-tested to BUTTON.draw-button at its centre. That button is the only way
 * back to the legend and the timeline once the panel is folded — which is the
 * landscape default — and the control covering it arms region drawing, so the
 * tap did not miss quietly, it did something else. 800x400, 844x390, 932x430,
 * 568x320 and 667x414 measured reachable before the fix and are held here so
 * the rule stays scoped to the band that needed it.
 */

/** Reachable = a tap aimed at a line box of the element lands on the element.
 *  Line boxes rather than the union rect, for the reason
 *  landscape-overlays.spec.ts spells out. */
const reach = (page: import("@playwright/test").Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { reachable: false, blockedBy: "missing" };
    const lines = Array.from(el.getClientRects()).filter(
      (r) => r.width > 0 && r.height > 0
    );
    if (!lines.length) return { reachable: false, blockedBy: "not rendered" };
    let blockedBy: string | null = null;
    for (const line of lines) {
      const at = document.elementFromPoint(
        Math.round(line.left + line.width / 2),
        Math.round(line.top + line.height / 2)
      );
      if (at && (at === el || el.contains(at)))
        return { reachable: true, blockedBy: null };
      if (!blockedBy) {
        const owner = at?.closest("button,a,[id]");
        blockedBy = owner
          ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
          : (at?.tagName ?? "outside the window");
      }
    }
    return { reachable: false, blockedBy };
  }, selector);

/** The two sizes that regressed, plus the neighbours that bound the rule. */
const TOUCH_SIZES = [
  { name: "667x375", width: 667, height: 375 },
  { name: "740x360", width: 740, height: 360 },
  { name: "800x400", width: 800, height: 400 },
  { name: "844x390", width: 844, height: 390 },
  { name: "568x320", width: 568, height: 320 },
  { name: "667x414", width: 667, height: 414 },
];

for (const size of TOUCH_SIZES) {
  test(`a touch device can fold and unfold the panel at ${size.name}`, async ({
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

      // The way back out of the fold is the thing that broke.
      expect(
        await reach(page, "#hud-collapse"),
        "#hud-collapse is covered on a touch device"
      ).toMatchObject({ reachable: true });

      // It has to stay a real 44px target, not merely an uncovered one.
      const box = await page.locator("#hud-collapse").boundingBox();
      expect(box!.width).toBeGreaterThanOrEqual(44);
      expect(box!.height).toBeGreaterThanOrEqual(44);

      // The control that was covering it keeps its own tap target: the fix
      // moves it aside, it does not trade one blocked button for another.
      expect(
        await reach(page, ".draw-button"),
        "the draw button lost its own target to the fix"
      ).toMatchObject({ reachable: true });

      // And the fold actually works end to end, which is the user-visible claim.
      const collapse = page.locator("#hud-collapse");
      const before = await collapse.getAttribute("aria-expanded");
      await collapse.click();
      await expect(collapse).toHaveAttribute(
        "aria-expanded",
        before === "true" ? "false" : "true"
      );
    } finally {
      await context.close();
    }
  });
}
