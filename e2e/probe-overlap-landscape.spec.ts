import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A phone held sideways can still work the panel while a probe is open.
 *
 * probe-overlap-phone.spec.ts settles the upright case, where the panel yields
 * by folding. Sideways it cannot: below 460px of height the panel already opens
 * folded to its 75px floor — the landscape default landscape-overlays.spec.ts
 * pins — so the fold that rescues a portrait phone has nothing left to give,
 * and the assertion in main.ts that a probe never reaches the bottom-centre
 * panel above 540px of width was written from the CSS rather than hit-tested.
 *
 * It does reach it. Measured on main at 667x375, 740x360, 844x390 and 932x430,
 * the probe stood 346px in a 360-430px window and, centred, covered the folded
 * panel over 391-393px of width and the whole of its 75px height. #hud-collapse
 * returned CANVAS.probe__chart at all four — and that button is the only way
 * back to the legend and the timeline, so a reader who probed a point could not
 * unfold the panel again without dismissing the probe first. At 667x375 and
 * 740x360 the layer selector and #provenance were covered with it, which costs
 * the product ID and the month: the citation survives the fold by design, and
 * this was taking it away after the fold had already been paid for.
 *
 * So the probe yields instead — top-anchored, capped at the room above the
 * bottom overlay, scrolling for the rest, and the chart gives up its fixed
 * 150px first. Clearance measured 26px at 375px and 360px of height and 42px at
 * 390px, 430px and 440px.
 */

const LANDSCAPE = [
  { name: "667x375", width: 667, height: 375 },
  { name: "740x360", width: 740, height: 360 },
  { name: "844x390", width: 844, height: 390 },
  { name: "932x430", width: 932, height: 430 },
];

/**
 * Reachable = a tap aimed at some line box of the element lands on it.
 * Line boxes rather than the union getBoundingClientRect returns, for the
 * reason landscape-overlays.spec.ts spells out: an inline element that wraps
 * has a union box whose centre is the empty middle of the row.
 */
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
      if (!blockedBy)
        blockedBy = at
          ? `${at.tagName}${at.id ? "#" + at.id : ""}`
          : "outside the window";
    }
    return { reachable: false, blockedBy };
  }, selector);

async function probeAPoint(page: import("@playwright/test").Page) {
  // Aim well above centre: at 667x375 the viewport centre hit-tests the panel,
  // not the globe, even folded.
  const size = page.viewportSize()!;
  const aim = {
    x: Math.round(size.width / 2),
    y: Math.round(size.height * 0.3),
  };
  await expect
    .poll(() =>
      page.evaluate((a) => {
        const at = document.elementFromPoint(a.x, a.y);
        return at ? at.id : "";
      }, aim)
    )
    .toBe("globe");
  await page.locator("#globe").click({ position: aim });
  await expect(page.locator(".probe")).toHaveClass(/is-open/, {
    timeout: 20_000,
  });
}

for (const size of LANDSCAPE) {
  test(`a probe leaves the panel workable at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);

    // The landscape default: folded already, so the panel is out of moves.
    await expect(page.locator("#hud-collapse")).toHaveAttribute(
      "aria-expanded",
      "false"
    );

    await probeAPoint(page);

    // The probe clears the panel outright rather than merely losing a z-index
    // argument with it.
    const clearance = await page.evaluate(() => {
      const c = document.querySelector("#controls")!.getBoundingClientRect();
      const p = document.querySelector(".probe")!.getBoundingClientRect();
      return Math.round(c.top - p.bottom);
    });
    expect(
      clearance,
      "the probe is standing on the folded panel"
    ).toBeGreaterThan(0);

    // The three things the fold keeps have to survive the probe too: the way
    // back, the name of the layer, and the citation.
    expect(await reach(page, "#hud-collapse")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, ".layer-selector__trigger")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, "#provenance")).toMatchObject({ reachable: true });
    await expect(page.locator("#provenance")).toContainText(
      "MODIS_Terra_L3_NDVI_Monthly"
    );

    // The probe pays for that in height, not in reachability: its own header
    // and close button stay on screen, and the rest scrolls.
    expect(await reach(page, ".probe__close")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, ".probe__title")).toMatchObject({
      reachable: true,
    });
    const scrolls = await page.evaluate(() => {
      const p = document.querySelector<HTMLElement>(".probe")!;
      return {
        scrollable: p.scrollHeight > p.clientHeight,
        overflowY: getComputedStyle(p).overflowY,
      };
    });
    expect(scrolls.overflowY).toBe("auto");
    expect(scrolls.scrollable).toBe(true);

    // The reader can still get the legend and the timeline back.
    await page.locator("#hud-collapse").click();
    await expect(page.locator("#hud-collapse")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
    await expect(page.locator("#timeline")).toBeVisible();
  });
}

test("a narrow short window keeps the probe on screen", async ({ page }) => {
  // 568x320 gets BOTH the 640px width rule and the 460px height rule. The
  // width rule bottom-centres the probe with left: 50% and a translate, so the
  // height rule has to restore the left anchor when it drops the transform —
  // without that the close button sat at x=654 in a 568px window.
  await page.setViewportSize({ width: 568, height: 320 });
  await page.goto("/");
  await awaitAppInteractive(page);
  await probeAPoint(page);

  const box = await page.evaluate(() => {
    const p = document.querySelector(".probe")!.getBoundingClientRect();
    return { left: Math.round(p.left), right: Math.round(p.right) };
  });
  expect(box.left).toBeGreaterThanOrEqual(0);
  expect(box.right).toBeLessThanOrEqual(568);
  expect(await reach(page, ".probe__close")).toMatchObject({ reachable: true });
});

test("a window with the room for it is untouched", async ({ page }) => {
  // 1024x600 is the netbook toolbar-height-continuity.spec.ts holds at exactly
  // the layout it has today, and it is above the 460px arm. The probe stays
  // vertically centred there — this rule does not leak upward into the band
  // where the panel opens expanded and the fold question is still open.
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto("/");
  await awaitAppInteractive(page);
  await probeAPoint(page);

  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".probe")!);
    return { top: s.top, maxHeight: s.maxHeight, overflowY: s.overflowY };
  });
  expect(style.top).toBe("300px");
  expect(style.maxHeight).toBe("none");
  expect(style.overflowY).toBe("visible");
});
