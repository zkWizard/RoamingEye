import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The citation list must not turn the providers modal into a sideways
 * scroller on a phone.
 *
 * Dataset short names are single unbreakable tokens — CSS does not break at
 * underscores — and the longest one,
 * MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0, lays out 388px wide.
 * The list is narrower than that on every phone, and `.providers__body` is a
 * horizontal scroller whether or not anyone asked for one: it sets
 * `overflow-y: auto`, and CSS computes the other axis to `auto` as soon as one
 * axis is not `visible`. So a single over-wide line made a sideways scroller
 * of the entire "Citing the data" list.
 *
 * The damage was not confined to the long line. Focusing that link — or any
 * sideways swipe — scrolled the body right by its full 72px at 390px, and
 * because the offset applies to the whole container it clipped the LEFT edge
 * of everything else: the list bullets and the opening characters of the
 * paragraph above disappeared off-screen. This is the app's provenance
 * surface, the list a reader copies a DOI out of, so a citation that has to be
 * scrolled sideways to read costs more than a row of small print.
 *
 * These are geometry tests rather than screenshots because the line was always
 * *drawn* — it simply extended past the viewport, and only the measurement
 * says by how much.
 */

const PHONES = [
  { name: "small Android", width: 360, height: 740 },
  { name: "iPhone SE", width: 375, height: 667 },
  { name: "iPhone 14", width: 390, height: 844 },
  { name: "iPhone Pro Max", width: 430, height: 932 },
];

/**
 * The widest single LINE BOX in the dataset list, not the widest element.
 * A wrapped anchor's bounding rect is the union of its lines, so an element
 * rect cannot say whether any one line overflows — and the union is what made
 * the original defect readable as "one link is wide" when the real question is
 * "does any line leave the column".
 */
async function widestLine(page: Page) {
  return page.evaluate(() => {
    const body = document.querySelector(".providers__body") as HTMLElement;
    const bodyRect = body.getBoundingClientRect();
    let worst = { text: "", right: -Infinity, width: 0 };
    for (const el of document.querySelectorAll<HTMLElement>(
      ".providers__datasets a"
    )) {
      for (const r of el.getClientRects()) {
        if (r.right > worst.right) {
          worst = {
            text: (el.textContent ?? "").trim().slice(0, 60),
            right: r.right,
            width: r.width,
          };
        }
      }
    }
    return {
      worst,
      bodyRight: bodyRect.right,
      overflow: body.scrollWidth - body.clientWidth,
      viewport: window.innerWidth,
    };
  });
}

async function openProviders(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();
  await expect(page.locator("#providers-page")).toHaveClass(/is-open/);
  await page.waitForTimeout(200);
}

test.describe("providers citation list on a phone", () => {
  test("no dataset line overflows the list column", async ({ page }) => {
    await openProviders(page, PHONES[2].width, PHONES[2].height);

    for (const phone of PHONES) {
      await page.setViewportSize({
        width: phone.width,
        height: phone.height,
      });
      await page.waitForTimeout(150);

      const m = await widestLine(page);
      expect(
        Math.round(m.worst.right),
        `${phone.name} ${phone.width}px: "${m.worst.text}" ends at ${Math.round(m.worst.right)} past the body's right edge ${Math.round(m.bodyRight)}`
      ).toBeLessThanOrEqual(Math.round(m.bodyRight));
      // The container-level statement of the same fact: with every line inside
      // the column there is nothing to scroll sideways to.
      expect(
        m.overflow,
        `${phone.name} ${phone.width}px: .providers__body still scrolls ${m.overflow}px sideways`
      ).toBe(0);
    }
  });

  test("the list cannot drift sideways and clip its own left edge", async ({
    page,
  }) => {
    await openProviders(page, 390, 844);

    // Drive the scroll the way focus or a swipe would, then measure something
    // that has nothing to do with the long line: if an unrelated heading moves,
    // the whole citation list moved with it. This is the assertion that names
    // the actual harm — the original defect shifted it by 72px.
    const drift = await page.evaluate(() => {
      const body = document.querySelector(".providers__body") as HTMLElement;
      const heading = document.querySelector(
        ".providers__group-title"
      ) as HTMLElement;
      const before = heading.getBoundingClientRect().left;
      body.scrollLeft = 9999;
      const after = heading.getBoundingClientRect().left;
      body.scrollLeft = 0;
      return Math.abs(before - after);
    });

    expect(
      drift,
      `an unrelated heading moved ${drift}px when the body was scrolled right`
    ).toBeLessThanOrEqual(1);
  });

  test("the long dataset id is wrapped, never truncated", async ({ page }) => {
    await openProviders(page, 390, 844);

    // Wrapping is the fix; hiding the tail behind an ellipsis would also make
    // the geometry tests above pass while quietly costing the reader the
    // identifier they came for. Both halves of the token must still be here,
    // and on more than one line.
    const link = page.locator(".providers__datasets a", {
      hasText: "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME",
    });
    await expect(link).toHaveText(
      "MODIS_AQUA_L3_SST_THERMAL_MONTHLY_9KM_DAYTIME_V2019.0 v2019.0"
    );

    const lines = await link.evaluate((el) => el.getClientRects().length);
    expect(
      lines,
      "the id should occupy more than one line at 390px"
    ).toBeGreaterThan(1);
  });

  test("desktop layout is untouched", async ({ page }) => {
    await openProviders(page, 1280, 800);

    // Above the phone widths nothing overflowed to begin with, so the fix must
    // be inert here: no wrapping change, no reflow. 540px is the first width
    // where the column is already wide enough for the token.
    for (const width of [540, 768, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await page.waitForTimeout(150);
      const m = await widestLine(page);
      expect(m.overflow, `${width}px should not scroll sideways`).toBe(0);
      expect(
        Math.round(m.worst.width),
        `${width}px: the id should still lay out on one unwrapped line`
      ).toBeGreaterThan(380);
    }
  });
});
