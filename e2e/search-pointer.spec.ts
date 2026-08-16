import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { openResults, stubGeocoder } from "./search-fixture";

/**
 * A search result must be clickable everywhere it is drawn.
 *
 * The popup drops down over the chrome stacked below the field — the share
 * button, the export row, the toolbar. Those are siblings of `.search` at the
 * same z-index, and `.search` comes first in the DOM, so the tie went to them
 * and the buttons kept the pointer while the popup merely looked like it was on
 * top. Measured at 1280x800, seven of twenty-seven sample points across the
 * three rows resolved to other controls: the right end of the first match was
 * "Share view", the top of the second was "Export image" and "Compare", and the
 * bottom of the third was a toolbar overlay toggle. A click there did that
 * control's job instead of choosing the place — the worst kind of miss, because
 * the row highlights under the cursor right up until the moment it is pressed.
 *
 * These specs pin hit-testing, not painting: a screenshot looked correct the
 * whole time.
 */

/** Every point where a row is drawn must belong to that row. */
async function assertRowsOwnTheirPixels(page: Page): Promise<void> {
  const strays = await page.evaluate(() => {
    const list = document.querySelector(".search__results") as HTMLElement;
    const rows = Array.from(
      document.querySelectorAll<HTMLElement>(".search__result")
    );
    const found: string[] = [];
    rows.forEach((row, i) => {
      const r = row.getBoundingClientRect();
      // A grid rather than the centre alone: the overlapping controls are
      // right-aligned bars, so they clip corners and edges a centre probe misses.
      for (const fy of [0.25, 0.5, 0.75]) {
        for (const fx of [0.15, 0.5, 0.85]) {
          const x = r.left + r.width * fx;
          const y = r.top + r.height * fy;
          const hit = document.elementFromPoint(x, y);
          if (!hit || !list.contains(hit)) {
            const tag = hit
              ? `${hit.tagName.toLowerCase()}.${hit.className}`
              : "nothing";
            found.push(`row ${i} at ${fx * 100}%/${fy * 100}% hit ${tag}`);
          }
        }
      }
    });
    return found;
  });
  expect(strays).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  await stubGeocoder(page);
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("no chrome steals the pixels an open result row is drawn on", async ({
  page,
}) => {
  await openResults(page);
  await assertRowsOwnTheirPixels(page);
});

test("the popup owns its pixels at phone width too", async ({ page }) => {
  // The field narrows to 70vw here while the share and export buttons stay
  // right-aligned, so the overlap is a different shape, not a smaller one.
  await page.setViewportSize({ width: 390, height: 844 });
  await openResults(page);
  await assertRowsOwnTheirPixels(page);
});

test("clicking the right end of the first match selects that place", async ({
  page,
}) => {
  await openResults(page);
  const row = page.locator(".search__result").first();
  const box = await row.boundingBox();
  if (!box) throw new Error("the first result has no box to click");

  // Deliberately near the right edge — the pixels the share button used to own.
  await page.mouse.click(box.x + box.width * 0.9, box.y + box.height / 2);

  // The outcome, not the bookkeeping: the field took the name and the globe
  // flew to Quito. Both would be untouched if the click had gone to "Share
  // view", which copies a link and leaves the popup open.
  await expect(page.locator(".search__input")).toHaveValue("Quito");
  await expect(page.locator(".search__results")).not.toHaveClass(/is-open/);
  await expect
    .poll(() => page.evaluate(() => location.hash), { timeout: 20_000 })
    .toContain("lat=-0.23&lon=-78.52");
});

test("the field only outranks its neighbours while the popup is open", async ({
  page,
}) => {
  // The lift is scoped to the open state so a collapsed field keeps its usual
  // place in the stack — a permanent raise would put the search box over chrome
  // it has no business covering.
  const search = page.locator(".search");
  await expect(search).not.toHaveClass(/is-open/);

  await openResults(page);
  await expect(search).toHaveClass(/is-open/);

  await page.locator(".search__input").press("Escape");
  await expect(search).not.toHaveClass(/is-open/);
});
