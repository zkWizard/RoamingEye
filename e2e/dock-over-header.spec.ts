import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The unfolded dock and the header on a short screen.
 *
 * A phone held on its side opens with the dock folded, and folded it clears
 * the header. Unfolded, the two-row dock can run up into it: at 568x320 it
 * reached y=22, under the search field and the actions pill, and at 740x360
 * the pill's Compare button received the taps meant for the timeline's
 * next-month stepper, so stepping the month switched on comparison mode.
 *
 * While the unfolded dock would meet the header, the header now yields
 * (main.ts measures the overlap and sets `dock-over-header`; style.css fades
 * the wordmark, search field and pill out). This spec holds the invariant at
 * every size — no header control is visible where the dock is, and every dock
 * control receives its own taps — plus both ends of it: at 568x320 the header
 * does step aside, and at 932x430, where the dock is one row and clears it,
 * the header stays. A breakpoint was tried first and failed both ways across
 * 180 sizes, which is why the overlap is measured and why this is swept.
 */

const settle = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) =>
        requestAnimationFrame(() => requestAnimationFrame(() => done()))
      )
  );

/** The header yields and returns with a 0.2 s fade (style.css). */
const FADE_MS = 400;

const headerHidden = (page: Page) =>
  page.evaluate(
    () => getComputedStyle(document.querySelector("#actions")!).visibility
  );

/** Visible header parts that share pixels with the dock. */
const collisions = (page: Page) =>
  page.evaluate(() => {
    const dock = document.querySelector("#controls")!.getBoundingClientRect();
    return [".search__field", "#actions"].filter((sel) => {
      const el = document.querySelector<HTMLElement>(sel)!;
      if (getComputedStyle(el).visibility === "hidden") return false;
      const b = el.getBoundingClientRect();
      return (
        b.left < dock.right &&
        b.right > dock.left &&
        b.top < dock.bottom &&
        b.bottom > dock.top
      );
    });
  });

/** Dock controls whose centre hit-tests to something else. */
const deadDockControls = (page: Page) =>
  page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#controls button, #controls [role=slider]"
      ),
    ]
      .filter((el) => el.getBoundingClientRect().width > 0)
      .filter((el) => {
        const b = el.getBoundingClientRect();
        const at = document.elementFromPoint(
          b.left + b.width / 2,
          b.top + b.height / 2
        );
        return !(at && (at === el || el.contains(at)));
      })
      .map((el) => el.getAttribute("aria-label") || el.className)
  );

async function unfoldAt(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await settle(page);
  const fold = page.locator("#hud-collapse");
  if ((await fold.getAttribute("aria-expanded")) === "false") {
    await fold.click();
  }
  await expect(fold).toHaveAttribute("aria-expanded", "true");
  await settle(page);
  await page.waitForTimeout(FADE_MS);
}

test("an unfolded dock never runs under the header on a touch device", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 568, height: 320 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await awaitAppInteractive(page);

    // Folded, as it opens here, the dock clears the header and nothing hides.
    await expect(page.locator("#hud-collapse")).toHaveAttribute(
      "aria-expanded",
      "false"
    );
    expect(await headerHidden(page)).toBe("visible");

    const failures: string[] = [];
    for (const [w, h] of [
      [568, 320],
      [667, 375],
      [740, 360],
      [844, 390],
      [932, 430],
    ]) {
      await unfoldAt(page, w, h);
      const at = `${w}x${h}`;
      const hit = await collisions(page);
      if (hit.length) failures.push(`${at}: dock runs under ${hit.join(", ")}`);
      const dead = await deadDockControls(page);
      if (dead.length) failures.push(`${at}: taps lost by ${dead.join(", ")}`);

      // Both ends of the rule, so it cannot pass by never hiding, or by
      // always hiding.
      if (at === "568x320")
        expect(await headerHidden(page), "568x320 kept the header").toBe(
          "hidden"
        );
      if (at === "932x430")
        expect(await headerHidden(page), "932x430 hid the header").toBe(
          "visible"
        );
    }
    expect(failures).toEqual([]);

    // Folding brings the header straight back, and it works again.
    await page.setViewportSize({ width: 568, height: 320 });
    await unfoldAt(page, 568, 320);
    await page.locator("#hud-collapse").click();
    await page.waitForTimeout(FADE_MS);
    expect(await headerHidden(page)).toBe("visible");
    await page.locator("#more-button").click();
    await expect(page.locator("#more-menu")).toBeVisible();
  } finally {
    await context.close();
  }
});

test("an unfolded dock never runs under the header in a short window", async ({
  page,
}) => {
  await page.setViewportSize({ width: 740, height: 335 });
  await page.goto("/");
  await awaitAppInteractive(page);

  // A desktop window dragged short: the one mouse size where the Compare
  // button took the next-month stepper's clicks.
  await unfoldAt(page, 740, 335);
  expect(await collisions(page)).toEqual([]);
  expect(await deadDockControls(page)).toEqual([]);
  expect(await headerHidden(page)).toBe("hidden");

  // And a short window with room for both keeps its header.
  await unfoldAt(page, 1280, 400);
  expect(await headerHidden(page)).toBe("visible");
});
