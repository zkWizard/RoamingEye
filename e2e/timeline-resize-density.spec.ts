import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The timeline's year labels thin out to fit the track: a 320px phone gets far
 * fewer than a desktop, so they never collide. That budget used to be spent
 * once, in the constructor, and the window it was spent for is not the window
 * the reader ends up in — rotating a phone into portrait, or dragging a desktop
 * window narrow, kept the wide layout's labels in a third of the space.
 *
 * Measured on the unfixed build at 320px wide: fourteen labels sized for an
 * 823px track, overlapping by 3px, where a fresh boot at that width lays out
 * six with 26px of air between them.
 */

/** Label count and the tightest horizontal gap between neighbouring labels. */
async function ruler(page: Page) {
  return page.evaluate(() => {
    const rects = [...document.querySelectorAll<HTMLElement>(".timeline__year")]
      .map((l) => l.getBoundingClientRect())
      .sort((a, b) => a.left - b.left);
    let minGap = Infinity;
    for (let i = 1; i < rects.length; i++) {
      minGap = Math.min(minGap, rects[i].left - rects[i - 1].right);
    }
    return {
      count: rects.length,
      minGap: minGap === Infinity ? null : minGap,
      trackWidth:
        document.querySelector<HTMLElement>(".timeline__track")!.clientWidth,
    };
  });
}

let pageErrors: string[] = [];

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/");
  await awaitAppInteractive(page);
});

test.afterEach(() => {
  expect(pageErrors).toEqual([]);
});

test("year labels re-thin when the window narrows, and never overlap", async ({
  page,
}) => {
  const wide = await ruler(page);
  expect(wide.count).toBeGreaterThan(2);
  expect(wide.minGap).toBeGreaterThan(0);

  // Portrait phone, then the narrowest phone still in service.
  for (const width of [390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await expect
      .poll(async () => (await ruler(page)).count, { timeout: 4000 })
      .toBeLessThan(wide.count);

    const narrow = await ruler(page);
    expect(
      narrow.minGap,
      `year labels overlap at ${width}px (track ${narrow.trackWidth}px, ${narrow.count} labels)`
    ).toBeGreaterThan(0);
  }
});

test("widening the window restores the denser ruler", async ({ page }) => {
  const wide = await ruler(page);

  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(async () => (await ruler(page)).count, { timeout: 4000 })
    .toBeLessThan(wide.count);

  await page.setViewportSize({ width: 1280, height: 800 });
  await expect
    .poll(async () => (await ruler(page)).count, { timeout: 4000 })
    .toBe(wide.count);
});

test("the handle stays above the ruler and still scrubs after a re-render", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 844 });
  await expect
    .poll(async () => (await ruler(page)).count, { timeout: 4000 })
    .toBeLessThan(20);

  // The re-render appends ticks, which would otherwise paint over the handle.
  const handleIsLast = await page.evaluate(() => {
    const track = document.querySelector<HTMLElement>(".timeline__track")!;
    return track.lastElementChild?.className ?? "";
  });
  expect(handleIsLast).toContain("timeline__handle");

  // And the rebuilt ruler is still a working scrubber.
  const track = page.locator(".timeline__track");
  const before = await page.locator(".timeline__readout").textContent();
  await track.focus();
  await page.keyboard.press("ArrowLeft");
  await expect(page.locator(".timeline__readout")).not.toHaveText(before ?? "");
});
