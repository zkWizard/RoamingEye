import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A phone held in landscape can reach the nine map overlays.
 *
 * The overlay bar is a vertical column whose height is capped so that centring
 * it always clears the top-right buttons, and a toggle stands 60.6px, so the
 * column shows its first one only above 460px of height. A phone in landscape
 * is 360-430px tall: the cap resolved to 0px at 390, 375 and 360 and to 30px at
 * 430, leaving a sliver of bar still wearing the fade that says there is more
 * this way. A hit test reached 0 of 9 toggles at every size below.
 *
 * The set has no substitute on screen. The layer selector in the HUD chooses
 * the base data layer; borders, cities, earthquakes, volcanoes, plate
 * boundaries, the graticule, the atmosphere, HD tiles and "my location" are on
 * this bar alone, so they were unreachable rather than merely cramped — in the
 * orientation a globe invites.
 *
 * The fix keys the existing bottom-bar layout on height as well as width. That
 * costs the vertical budget the 3.6rem the bar reserves, which is why the panel
 * opens folded at these sizes: expanded it is 266px against a 360-430px
 * viewport and its own top goes off the screen, taking the control that would
 * bring it back. Folded it keeps the layer selector and the provenance line, so
 * these tests assert the product ID and the month are rendered in the default
 * state — the space is bought from the colour ramp and the timeline, never from
 * a citation.
 */

const LANDSCAPE = [
  { name: "844x390", width: 844, height: 390 },
  { name: "932x430", width: 932, height: 430 },
  { name: "740x360", width: 740, height: 360 },
  { name: "667x375", width: 667, height: 375 },
];

/** The count is the assertion: nine is the whole overlay set. */
const OVERLAY_COUNT = 9;

/* A control is reached when a tap aimed at it lands on it. The point aimed at
   is the centre of a LINE box rather than the centre of the union box
   `getBoundingClientRect` returns, because the credits row is inline text that
   wraps: an <a> that straddles the wrap has a union box spanning from where it
   starts on one line to where it ends on the next, and the centre of that box
   is the empty middle of the row — over the HUD panel, which is centred there.
   CI's wider text metrics wrap that row where local metrics do not, so the
   union-box form of this test named one link dead at 844x390 and another at
   932x430 while every glyph of both was tappable on both of its lines. Any line
   box reaching the element is the honest answer; a control genuinely under the
   bar has none. The nine toggles are block-level and yield a single rect, so
   they read exactly as before. */
const hitTest = (page: import("@playwright/test").Page, selector: string) =>
  page.evaluate((sel) => {
    const out: { label: string; reached: boolean }[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const label =
        el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "(unnamed)";
      const lines = Array.from(el.getClientRects()).filter(
        (r) => r.width > 0 && r.height > 0
      );
      const reached = lines.some((line) => {
        const at = document.elementFromPoint(
          Math.round(line.left + line.width / 2),
          Math.round(line.top + line.height / 2)
        );
        return Boolean(at && el.contains(at));
      });
      out.push({ label, reached });
    }
    return out;
  }, selector);

for (const size of LANDSCAPE) {
  test(`every overlay toggle takes its own tap at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);

    const toggles = await hitTest(page, ".toolbar__item");
    expect(
      toggles.length,
      "the overlay set is nine toggles; a change to the set needs this number"
    ).toBe(OVERLAY_COUNT);
    expect(
      toggles.filter((t) => !t.reached).map((t) => t.label),
      "an overlay toggle that another box receives the tap for"
    ).toEqual([]);

    // Reachable without a swipe as well: the row fits inline at these widths,
    // so the fade is telling the truth when it does not appear.
    const scroll = await page.evaluate(() => {
      const bar = document.querySelector(".toolbar") as HTMLElement;
      return { w: bar.scrollWidth, client: bar.clientWidth };
    });
    expect(scroll.w).toBeLessThanOrEqual(scroll.client);
  });

  test(`the panel and its citation stay on screen at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);

    const panel = page.locator(".controls");
    const top = await panel.evaluate((el) => el.getBoundingClientRect().top);
    expect(
      top,
      "the panel's top edge is off the screen, so the fold control is unreachable"
    ).toBeGreaterThan(0);

    // The default is folded, and what folding keeps is the point of it: the
    // layer selector names what is on the globe, and the provenance line
    // carries the product ID and the month.
    await expect(page.locator("#hud-collapse")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    await expect(page.locator(".layer-selector__trigger")).toBeVisible();
    const provenance = page.locator("#provenance");
    await expect(provenance).toBeVisible();
    await expect(provenance).toContainText("MODIS_Terra_L3_NDVI_Monthly");

    // The fold is an offer, not a verdict: the control that undoes it is on
    // screen and unfolding restores the rows.
    const button = page.locator("#hud-collapse");
    await expect(button).toBeInViewport();
    await button.click();
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#timeline")).toBeVisible();
  });

  test(`the credits row keeps its own taps at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);

    // The bar is pinned across the bottom here, which is what put the credits
    // under it at phone widths (#983). The same lift has to carry over, or the
    // providers link, the repository link and the feedback link go dead.
    const credits = await hitTest(page, ".attribution a, .attribution button");
    expect(credits.length).toBeGreaterThan(0);
    expect(
      credits.filter((c) => !c.reached).map((c) => c.label),
      "a credits control the overlay bar receives the tap for"
    ).toEqual([]);
  });
}

test("a viewport tall enough for the column keeps the column", async ({
  page,
}) => {
  // 1024x600 is the netbook toolbar-height-continuity.spec.ts holds at exactly
  // the layout it has today; the height arm of the new rule is 460px, so this
  // is the guard that says the two do not meet.
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/");
  await awaitAppInteractive(page);

  const bar = await page.evaluate(() => {
    const el = document.querySelector(".toolbar") as HTMLElement;
    const style = getComputedStyle(el);
    return { direction: style.flexDirection, bottom: style.bottom };
  });
  expect(bar.direction).toBe("column");
  expect(bar.bottom).not.toBe("0px");

  // And the panel opens with every row showing, as it does on any window with
  // the room for it.
  await expect(page.locator("#hud-collapse")).toHaveAttribute(
    "aria-expanded",
    "true"
  );
});
