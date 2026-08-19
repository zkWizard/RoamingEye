import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A tall window wider than a phone can still change the layer while a probe is
 * open.
 *
 * probe-overlap-short-window.spec.ts settles the window that is short but not
 * narrow, and probe-overlap-landscape.spec.ts the phone held sideways. Both are
 * cases where the probe descends onto the panel because the window is short.
 * This one is the opposite: the window has all the height it needs, and the
 * probe reaches the panel sideways instead — its column runs from the left
 * inset to 400px, and the bottom-centre panel is wide enough at these widths to
 * put the layer selector underneath it.
 *
 * Measured on main with a probe open at 900px of height, a tap aimed at
 * `.layer-selector__trigger` returned CANVAS.probe__chart at 560, 600 and 640px
 * of width, P.probe__status at 660, 700 and 760, and DIV#probe-panel at 820. No
 * fold control is rendered above 540px of width, so there was no way to recover
 * the selector without dismissing the probe first. It clears at 840 — where the
 * trigger's centre passes the probe's right edge by 3px — and by 880.
 *
 * The probe top-anchors instead, and above 780px of height that costs nothing:
 * the panel's height does not follow the window's, so there is 391px or more
 * above it against the 346px the probe stands. Below 780 the chart gives up its
 * fixed 150px, as it does in the rules on either side of this one.
 */

/**
 * Reachable = a tap aimed at some line box of the element lands on it. Line
 * boxes rather than the union getBoundingClientRect returns, for the reason
 * probe-overlap-landscape.spec.ts spells out: an inline element that wraps has
 * a union box whose centre is the empty middle of the row.
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
  const size = page.viewportSize()!;
  // Well above centre: the bottom HUD grows upward, so an aim at the middle of
  // a window this size can hit the panel rather than the globe.
  const aim = {
    x: Math.round(size.width / 2),
    y: Math.round(size.height * 0.28),
  };
  await expect
    .poll(() =>
      page.evaluate((a) => document.elementFromPoint(a.x, a.y)?.id ?? "", aim)
    )
    .toBe("globe");
  await page.locator("#globe").click({ position: aim });
  await expect(page.locator(".probe")).toHaveClass(/is-open/, {
    timeout: 20_000,
  });
}

// One width per blocking element measured on main, plus the floor of the band
// where the chart pays and the top width where it is closest to clearing.
const TALL = [
  { name: "560x900", width: 560, height: 900 }, // covered by the chart canvas
  { name: "700x900", width: 700, height: 900 }, // by the status line
  { name: "820x900", width: 820, height: 900 }, // by the dialog itself
  { name: "560x721", width: 560, height: 721 }, // the floor: chart at 96px
];

for (const size of TALL) {
  test(`a probe leaves the layer selector reachable at ${size.name}`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: size.width, height: size.height });
    await page.goto("/");
    await awaitAppInteractive(page);
    await probeAPoint(page);

    // No fold control at these widths, so the panel has no move of its own —
    // which is why the probe has to be the one that yields.
    await expect(page.locator("#hud-collapse")).toBeHidden();

    // The probe clears the panel outright rather than merely losing a z-index
    // argument with it.
    const clearance = await page.evaluate(() => {
      const c = document.querySelector("#controls")!.getBoundingClientRect();
      const p = document.querySelector(".probe")!.getBoundingClientRect();
      return Math.round(c.top - p.bottom);
    });
    expect(clearance, "the probe is standing on the panel").toBeGreaterThan(0);

    // The control this closes, and the citation that must survive with it.
    expect(await reach(page, ".layer-selector__trigger")).toMatchObject({
      reachable: true,
    });
    expect(await reach(page, "#provenance")).toMatchObject({ reachable: true });
    await expect(page.locator("#provenance")).toContainText(
      "MODIS_Terra_L3_NDVI_Monthly"
    );

    // The probe keeps its own header on screen while it yields.
    expect(await reach(page, ".probe__close")).toMatchObject({
      reachable: true,
    });

    // And the reader can actually work the control, not merely touch it.
    await page.locator(".layer-selector__trigger").click();
    await expect(page.locator(".layer-selector__trigger")).toHaveAttribute(
      "aria-expanded",
      "true"
    );
  });
}

test("the tall-window rule does not reach the widths above it", async ({
  page,
}) => {
  // 900px is the first width past the 880px arm. The probe keeps the centred
  // position it has on main, where the trigger is already reachable — the
  // legend overlap there is the open question docs/BACKLOG.md is holding, and
  // this rule deliberately does not answer it.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.goto("/");
  await awaitAppInteractive(page);
  await probeAPoint(page);

  const style = await page.evaluate(() => {
    const s = getComputedStyle(document.querySelector(".probe")!);
    return { top: s.top, maxHeight: s.maxHeight, overflowY: s.overflowY };
  });
  expect(style.top).toBe("450px"); // still `top: 50%` of the window
  expect(style.maxHeight).toBe("none");
  expect(style.overflowY).toBe("visible");
  expect(await reach(page, ".layer-selector__trigger")).toMatchObject({
    reachable: true,
  });
});
