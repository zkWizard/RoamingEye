import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The layer options were the last coarse target left on the AA floor.
 *
 * `@media (pointer: coarse)` grows every other piece of chrome to the 44px
 * touch guidance, but `.layer-selector__option` was never on that list, and on
 * main it measured 197x30.2 at 667x375, 768x1024, 820x1180 and 1024x1366 —
 * i.e. at every size that gets the panel's two-column layout. Picking a data
 * layer is the primary action of the app, so this was the smallest target on
 * the most-used control.
 *
 * Why a width-keyed check never caught it: below 541px the panel drops to one
 * column and turns the layer caption on, which pushes each option to 47-62px
 * on its own. The blind spot is exactly the widths where the caption is off,
 * so the phone sizes are asserted here too — as the regression guard for the
 * layout that was already correct, not as the defect.
 *
 * The fix is real height rather than the transparent `::after` used for the
 * keyboard-hint badge: options are block children of `.layer-selector__group`
 * with no gap between them, so the vertical pitch IS the box, and any area
 * grown downward is taken back by the next option, which wins on DOM order.
 */

/** Every option in the panel is a target; the smallest one is the claim. */
const measure = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const opts = [
      ...document.querySelectorAll<HTMLElement>(".layer-selector__option"),
    ];
    return opts.map((el) => {
      const r = el.getBoundingClientRect();
      return {
        label: el.textContent?.slice(0, 20) ?? "",
        width: r.width,
        height: r.height,
      };
    });
  });

/**
 * Size is only half of a target-size claim — the box has to be pressable too.
 * The panel scrolls, so an option below the fold is clipped rather than
 * covered; scroll it into view first, then hit-test its centre the way a tap
 * would land, and name whatever is really on top.
 */
const reachAll = (page: import("@playwright/test").Page) =>
  page.evaluate(() => {
    const bad: string[] = [];
    const opts = [
      ...document.querySelectorAll<HTMLElement>(".layer-selector__option"),
    ];
    for (const el of opts) {
      el.scrollIntoView({ block: "center" });
      const r = el.getBoundingClientRect();
      const at = document.elementFromPoint(
        Math.round(r.left + r.width / 2),
        Math.round(r.top + r.height / 2)
      );
      if (at && (at === el || el.contains(at))) continue;
      const owner = at?.closest("button,a,[id]");
      const name = owner
        ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
        : (at?.tagName ?? "outside the window");
      bad.push(`${el.textContent?.slice(0, 16)}: ${name}`);
    }
    return bad;
  });

const openPanel = async (page: import("@playwright/test").Page) => {
  await page.locator(".layer-selector__trigger").click();
  await page.waitForSelector(".layer-selector__panel.is-open");
};

/** The two-column sizes are the defect; the one-column ones are the guard. */
const COARSE_SIZES = [
  { name: "667x375 (phone landscape)", width: 667, height: 375, columns: 2 },
  { name: "768x1024 (tablet)", width: 768, height: 1024, columns: 2 },
  { name: "820x1180 (tablet)", width: 820, height: 1180, columns: 2 },
  { name: "1024x1366 (tablet)", width: 1024, height: 1366, columns: 2 },
  { name: "390x844 (phone)", width: 390, height: 844, columns: 1 },
  { name: "360x740 (phone)", width: 360, height: 740, columns: 1 },
];

test.describe("layer options on a coarse pointer", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "coarse-pointer emulation is only verified for Chromium"
  );
  test.use({
    hasTouch: true,
    isMobile: true,
    viewport: { width: 820, height: 1180 },
  });

  // One context, resized across the sweep: `hasTouch` is a context-level
  // setting but the viewport is not, and re-booting the app per size costs
  // far more than the six measurements are worth.
  test("every layer option meets the 44px touch guidance", async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "emulation must actually select the coarse-pointer rules"
    ).toBe(true);

    const undersized: string[] = [];
    const unreachable: string[] = [];

    for (const size of COARSE_SIZES) {
      await page.setViewportSize({ width: size.width, height: size.height });
      await openPanel(page);

      // The premise of the sweep: these really are the two layouts claimed.
      const cols = await page.evaluate(
        () =>
          getComputedStyle(
            document.querySelector<HTMLElement>(".layer-selector__panel")!
          ).gridTemplateColumns.split(" ").length
      );
      expect(cols, `${size.name} column count`).toBe(size.columns);

      for (const o of await measure(page)) {
        if (o.height < 44)
          undersized.push(
            `${size.name} ${o.label}: ${o.width.toFixed(0)}x${o.height.toFixed(1)}`
          );
      }

      for (const miss of await reachAll(page))
        unreachable.push(`${size.name} ${miss}`);

      await page.keyboard.press("Escape");
    }

    expect(undersized, "layer options under the 44px touch guidance").toEqual(
      []
    );
    expect(
      unreachable,
      "layer options whose centre is covered by something else"
    ).toEqual([]);
  });

  // Growing the options must not cost the globe any chrome. The panel is
  // absolutely positioned with its own scroll, which is what makes the height
  // affordable — assert that rather than trusting it, because a later change
  // putting the panel back in flow would grow the HUD upward over the globe
  // and break the fixed-point specs instead of this one.
  test("the taller options grow the dropdown, not the HUD", async ({
    page,
  }) => {
    await page.goto("/");
    await awaitAppInteractive(page);

    const closed = await page.locator("#controls").boundingBox();
    await openPanel(page);
    const open = await page.locator("#controls").boundingBox();

    expect(open, "opening the panel resized the HUD").toEqual(closed);

    const panel = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>(".layer-selector__panel")!;
      const s = getComputedStyle(el);
      return {
        position: s.position,
        overflowY: s.overflowY,
        withinViewport: el.getBoundingClientRect().top >= 0,
      };
    });
    expect(panel.position).toBe("absolute");
    expect(panel.overflowY).toBe("auto");
    expect(
      panel.withinViewport,
      "the taller panel overflowed the top of the viewport"
    ).toBe(true);
  });
});

/**
 * The rule is scoped to `pointer: coarse`, so a mouse must see exactly the
 * geometry it saw before. This is what lets the rest of the suite — every
 * project of which runs a fine pointer — stand as evidence that nothing moved.
 */
test("a fine pointer keeps the compact option height", async ({ page }) => {
  test.skip(
    test.info().project.name !== "chromium",
    "paired with the coarse assertions above"
  );
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto("/");
  await awaitAppInteractive(page);

  expect(
    await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
    "this context must NOT be coarse"
  ).toBe(false);

  await openPanel(page);
  const heights = (await measure(page)).map((o) => o.height);
  expect(
    Math.max(...heights),
    "a mouse must keep the compact rows"
  ).toBeLessThan(44);
});
