import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A window that is short but not narrow can still work the panel while a probe
 * is open — and keeps every row of it while doing so.
 *
 * probe-overlap-phone.spec.ts settles the narrow case, where the panel yields by
 * folding, and probe-overlap-landscape.spec.ts the short-AND-narrow one, where
 * it has already folded and the probe yields instead. The band between them was
 * never hit-tested: the note in main.ts had it that above 540px of width the
 * probe is anchored left at `top: 50%` and so never reaches the bottom-centre
 * panel.
 *
 * It reaches it. Vertically centred the probe is 346px on the middle of the
 * viewport, and on a short window the panel's top is above that middle whatever
 * the width. Measured on main with a probe open, #hud-collapse returned
 * CANVAS.probe__chart at 1280x720, 1366x700, 1024x680, 1440x640, 1024x600 and
 * 800x700 — six of six — and at 800x700 the layer selector went with it. That
 * button is the only way back to the legend and the timeline.
 *
 * The probe is what moves here, not the panel, and that is the whole point of
 * the case. A phone folds the panel because it has no room for both; a laptop
 * does, so folding it would take the colour ramp and the timeline away from a
 * reader every time they clicked the globe. The probe takes the room above the
 * panel instead and the panel is untouched — which is also why this suite
 * asserts the panel is NOT collapsed, the mirror image of the phone spec.
 */

const SHORT = [
  { name: "1280x720", width: 1280, height: 720 },
  { name: "1440x640", width: 1440, height: 640 },
  { name: "1024x600", width: 1024, height: 600 },
  { name: "800x700", width: 800, height: 700 },
  { name: "560x700", width: 560, height: 700 },
];

/**
 * Reachable = a tap aimed at some line box of the element lands on it. Line
 * boxes rather than the union `getBoundingClientRect` returns: an inline
 * element that wraps has a union box whose centre is the empty middle of the
 * row.
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
  // Aim well above centre. The bottom HUD grows upward over the globe, so a
  // fixed centre point can hit-test the panel rather than the sphere.
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

for (const size of SHORT) {
  test(`a probe leaves the panel workable at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);
    await probeAPoint(page);

    // The probe clears the panel outright rather than merely winning a z-index
    // argument with it.
    const clearance = await page.evaluate(() => {
      const c = document.querySelector("#controls")!.getBoundingClientRect();
      const p = document.querySelector(".probe")!.getBoundingClientRect();
      return Math.round(c.top - p.bottom);
    });
    expect(clearance, "the probe is standing on the panel").toBeGreaterThan(0);

    // The way back to the legend and the timeline, the name of the layer, and
    // the citation — all three answer with the probe open.
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

    // The panel pays nothing for this. It is the probe that moved, so the
    // reader keeps the colour ramp and the timeline they already had — the
    // difference between this case and the phone's.
    await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);
    await expect(page.locator("#timeline")).toBeVisible();

    // What the probe pays instead is height: its header and close button stay
    // on screen and the rest scrolls.
    expect(await reach(page, ".probe__close")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, ".probe__title")).toMatchObject({
      reachable: true,
    });
    const box = await page.evaluate(() => {
      const p = document.querySelector(".probe")!.getBoundingClientRect();
      return { top: Math.round(p.top), left: Math.round(p.left) };
    });
    expect(box.top).toBeGreaterThanOrEqual(0);
    expect(box.left).toBeGreaterThanOrEqual(0);
  });
}

test("a window above the height arm is untouched", async ({ page }) => {
  // 1280x800 clears the arm, so the probe stays vertically centred and keeps
  // its full-height chart. It still overlaps the panel there — what it covers
  // is a stretch of the legend rather than a control, and closing that is a
  // question about a reader's default that docs/BACKLOG.md carries.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await awaitAppInteractive(page);
  await probeAPoint(page);

  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".probe")!);
    const chart = document.querySelector(".probe__chart");
    return {
      maxHeight: s.maxHeight,
      overflowY: s.overflowY,
      chart: chart ? Math.round(chart.getBoundingClientRect().height) : 0,
    };
  });
  expect(style.maxHeight).toBe("none");
  expect(style.overflowY).toBe("visible");
  expect(style.chart).toBeGreaterThan(96);
  await expect(page.locator("#controls")).not.toHaveClass(/is-collapsed/);
});

test("a phone keeps the answer it already had", async ({ page }) => {
  // The rule is held above the width arm so it cannot undo #1039: at 540px and
  // below the panel still folds and the probe still takes the middle.
  await page.setViewportSize({ width: 540, height: 700 });
  await page.goto("/");
  await awaitAppInteractive(page);
  await probeAPoint(page);

  await expect(page.locator("#controls")).toHaveClass(/is-collapsed/);
  expect(await reach(page, "#hud-collapse")).toMatchObject({ reachable: true });
  expect(await reach(page, ".layer-selector__trigger")).toMatchObject({
    reachable: true,
  });
  await expect(page.locator("#provenance")).toBeVisible();
});
