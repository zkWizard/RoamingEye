import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The overlay toolbar scrolls on a different axis in each layout — sideways as
 * the phone bottom bar, downward as the capped column in a short desktop
 * window — and `data-overflow` drives the edge fade that says so. Measuring
 * only one axis left the desktop case silently truncated: at 1280x800 four of
 * the nine toggles are on screen, at 1366x768 three, and the overlay scrollbar
 * is painted only while scrolling, so at rest the bar looked complete.
 *
 * These specs assert their own premise — that the bar really does overflow at
 * the size in question — so a future layout change that gives the column room
 * fails here loudly instead of quietly turning the tests into no-ops.
 */

const TOOLBAR = "#toolbar";

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await awaitAppInteractive(page);
}

/** Toggles whose box is not wholly inside the toolbar's own scroll port. */
async function offScreenLabels(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const el = document.querySelector("#toolbar");
    if (!el) throw new Error("no toolbar");
    const box = el.getBoundingClientRect();
    return [...el.querySelectorAll(".toolbar__item")]
      .filter((b) => {
        const r = b.getBoundingClientRect();
        return r.top < box.top - 1 || r.bottom > box.bottom + 1;
      })
      .map((b) => b.querySelector(".toolbar__label")?.textContent ?? "?");
  });
}

async function maskImage(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.querySelector("#toolbar")!).maskImage
  );
}

test.describe("toolbar overflow affordance", () => {
  test("a short desktop window fades the column's hidden end", async ({
    page,
  }) => {
    await boot(page, 1280, 800);
    const toolbar = page.locator(TOOLBAR);

    // Premise: the column is capped and genuinely has toggles below the fold.
    const hidden = await offScreenLabels(page);
    expect(
      hidden.length,
      "toolbar fits at 1280x800 — the fade is no longer needed here"
    ).toBeGreaterThan(0);

    // At rest the hidden items are below, so only the bottom edge fades.
    await expect(toolbar).toHaveAttribute("data-overflow", "end");
    // Chromium drops the default `to bottom` when serializing the gradient,
    // so assert the fade's presence and geometry rather than its direction.
    expect(await maskImage(page)).toContain("calc(100% - 32px)");

    // Scrolled to the bottom, the fade moves to the top edge.
    await toolbar.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(toolbar).toHaveAttribute("data-overflow", "start");
    expect(await maskImage(page)).toContain("rgb(0, 0, 0) 32px");

    // Midway both edges have items behind them.
    await toolbar.evaluate((el) => {
      el.scrollTop = Math.round((el.scrollHeight - el.clientHeight) / 2);
    });
    await expect(toolbar).toHaveAttribute("data-overflow", "both");
  });

  test("a tall desktop window shows every toggle and fades nothing", async ({
    page,
  }) => {
    await boot(page, 1440, 900);
    // Premise: above the 820px breakpoint the column is uncapped.
    expect(await offScreenLabels(page)).toEqual([]);
    await expect(page.locator(TOOLBAR)).toHaveAttribute(
      "data-overflow",
      "none"
    );
    expect(await maskImage(page)).toBe("none");
  });

  test("the phone bar still fades sideways", async ({ page }) => {
    await boot(page, 390, 844);
    const toolbar = page.locator(TOOLBAR);

    // Premise: the bar is the horizontal scroller here, not the column.
    const axes = await toolbar.evaluate((el) => ({
      x: el.scrollWidth - el.clientWidth,
      y: el.scrollHeight - el.clientHeight,
    }));
    expect(axes.x).toBeGreaterThan(2);
    expect(axes.y).toBeLessThanOrEqual(2);

    await expect(toolbar).toHaveAttribute("data-overflow", "end");
    expect(await maskImage(page)).toContain("to right");

    await toolbar.evaluate((el) => {
      el.scrollLeft = el.scrollWidth;
    });
    await expect(toolbar).toHaveAttribute("data-overflow", "start");
  });
});
