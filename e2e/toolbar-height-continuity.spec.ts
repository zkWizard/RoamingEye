import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The toolbar column is capped so that centring it always leaves the 200px the
 * top-right buttons occupy (`100vh - 400px`, see toolbar-collision.spec.ts).
 * Short windows anchor it at that 200px outright, and that rule used to carry a
 * second, tighter cap — `100vh - 530px` — reserving 130px more on the grounds
 * that the bottom HUD needed it. The panel is centred and 880px wide, so it
 * never occupied the bar's column; what the reserve produced instead was a step
 * at the breakpoint, where a window one pixel shorter than 821px lost 131px of
 * column and two of the nine toggles.
 *
 * These specs hold both halves of removing it: the column shortens smoothly
 * with the window, and the overlap the single cap allows at narrow widths still
 * leaves every control in the HUD panel owning its own centre.
 *
 * The 400px that cap reserves is one decision, not two: the column is centred,
 * so holding back the 200px the top-right buttons occupy mirrors the same 200px
 * below, where nothing lives. Above 1100px wide — the width at which the bar
 * clears the HUD panel's flank outright — the band is stated directly instead,
 * running from under the buttons to 80px short of the bottom so the credits
 * line keeps its own air. The column still centres within that band. Below
 * 1100px the original cap stands, because a longer column there would run down
 * the panel's side and reach the timeline steppers.
 */

/** Reserve above and below the centred column, at widths under the band gate. */
const RESERVE = 400;
/** The stated band at 1100px wide and up: 200px of buttons, 80px of credits. */
const BAND_RESERVE = 280;
/** Width at and above which the band applies. */
const BAND_WIDTH = 1366;
/** A width below the gate, where the centred cap still governs. */
const NARROW = 1024;

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await awaitAppInteractive(page);
}

async function resize(
  page: Page,
  width: number,
  height: number
): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.waitForFunction((h) => window.innerHeight === h, height);
}

interface Column {
  height: number;
  top: number;
  natural: number;
  /** Toggles whose box lies wholly inside the scroll port. */
  visible: number;
}

async function column(page: Page): Promise<Column> {
  return page.evaluate(() => {
    const el = document.querySelector("#toolbar");
    if (!el) throw new Error("no toolbar");
    const box = el.getBoundingClientRect();
    const visible = [...el.querySelectorAll(".toolbar__item")].filter((b) => {
      const r = b.getBoundingClientRect();
      return r.top >= box.top - 1 && r.bottom <= box.bottom + 1;
    }).length;
    return {
      height: Math.round(box.height),
      top: Math.round(box.top),
      natural: Math.round(el.scrollHeight),
      visible,
    };
  });
}

test.describe("toolbar column height is continuous", () => {
  // Every test here walks the window through a series of viewport sizes, and
  // each step is a `setViewportSize` plus the wait for the app’s own relayout
  // to publish. That is slow under CI’s SwiftShader rendering: the fifteen-step
  // walk below measures 6.8s locally and 16-29s on CI, against Playwright’s 30s
  // default — close enough to the cap that it expired mid-walk twice, with no
  // assertion involved and nothing wrong with the layout it was measuring. The
  // headroom is what the other viewport-walking specs already take (see
  // attribution-contrast.spec.ts), and it buys legibility as well as stability:
  // a step that genuinely hangs now fails on `waitForFunction`’s own 30s
  // timeout, naming the height it stuck at, instead of the whole test expiring
  // at an arbitrary point in the loop.
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  // Driven at a width below the band gate, which is where the centred cap and
  // the anchored short-window rule still meet. At 1366px the band replaces both
  // and the seam is gone rather than smooth, which would pass this spec without
  // exercising it.
  test("no step at the short-window breakpoint", async ({ page }) => {
    await boot(page, NARROW, 821);
    const above = await column(page);
    await resize(page, NARROW, 820);
    const below = await column(page);

    // Premise: the breakpoint is real — the anchored layout applies at 820 and
    // not at 821 — so this is measuring the seam and not two copies of one rule.
    expect(
      await page.evaluate(
        () => getComputedStyle(document.querySelector("#toolbar")!).top
      )
    ).toBe("200px");

    // One pixel of window may cost one pixel of column, and nothing more. The
    // old reserve made this difference 131px.
    expect(
      Math.abs(above.height - below.height),
      "the column steps at the breakpoint"
    ).toBeLessThanOrEqual(2);
    expect(
      below.visible,
      "toggles disappear when the window shortens by one pixel"
    ).toBe(above.visible);
    expect(above.top).toBe(below.top);
  });

  test("the column tracks the window across the breakpoint", async ({
    page,
  }) => {
    await boot(page, BAND_WIDTH, 900);
    let previous = 0;
    for (let height = 620; height <= 900; height += 20) {
      await resize(page, BAND_WIDTH, height);
      const col = await column(page);

      // The band is the whole rule: as much column as the window leaves after
      // the buttons above and the credits below, and never more than the column
      // needs.
      expect(
        Math.abs(col.height - Math.min(col.natural, height - BAND_RESERVE)),
        `column is not the banded height at ${BAND_WIDTH}x${height}`
      ).toBeLessThanOrEqual(2);
      expect(
        col.height,
        `column shrank as the window grew at ${BAND_WIDTH}x${height}`
      ).toBeGreaterThanOrEqual(previous);
      // The top edge never rises past the buttons. It may sit lower, because a
      // column with room to spare centres itself inside the band.
      expect(
        col.top,
        `column rose above 200px at ${BAND_WIDTH}x${height}`
      ).toBeGreaterThanOrEqual(200);
      previous = col.height;
    }
  });

  test("the band leaves the credits line its own air", async ({ page }) => {
    // The lower 80px is the half of the band that is new, so this is the spec
    // that says what it is for. The credits sit in the last 48px of the window
    // and are pointer-events:none, so no hit test would ever report the bar
    // reaching them — only the boxes tell the truth.
    await boot(page, BAND_WIDTH, 800);
    for (const height of [720, 800, 900, 1080]) {
      await resize(page, BAND_WIDTH, height);
      const gap = await page.evaluate(() => {
        const bar = document.querySelector("#toolbar")!.getBoundingClientRect();
        const credits = document
          .querySelector(".attribution")!
          .getBoundingClientRect();
        return Math.round(credits.top - bar.bottom);
      });
      expect(
        gap,
        `the column reaches the credits at ${BAND_WIDTH}x${height}`
      ).toBeGreaterThan(0);
    }
  });

  test("more of the column is on screen at a laptop height", async ({
    page,
  }) => {
    // The user-facing point of the band. 1366x768 is the commonest laptop
    // panel: the original reserve left three toggles of nine on screen there,
    // dropping it took that to five, and the band takes it to seven.
    await boot(page, BAND_WIDTH, 768);
    expect((await column(page)).visible).toBeGreaterThanOrEqual(7);
    await resize(page, BAND_WIDTH, 720);
    expect((await column(page)).visible).toBeGreaterThanOrEqual(6);
    // A window with room now shows the whole set rather than seven of it.
    await resize(page, BAND_WIDTH, 900);
    expect((await column(page)).visible).toBe(9);
  });

  test("nothing moves below the band's width gate", async ({ page }) => {
    // The gate is arithmetic: the panel is 880px wide and centred and the bar's
    // left edge sits at `100vw - 91px`, so below ~1062px the two boxes share
    // real estate and a longer column would reach the timeline steppers. A
    // 1024x600 netbook keeps exactly the column it has today.
    await boot(page, NARROW, 600);
    const col = await column(page);
    expect(
      Math.abs(col.height - Math.min(col.natural, 600 - RESERVE)),
      "the band leaked below its width gate"
    ).toBeLessThanOrEqual(2);
    expect(col.top).toBe(200);
  });
});

test.describe("the HUD panel keeps its clicks where the boxes overlap", () => {
  // Same walk, same reason as the block above: five widths of resize plus a
  // hit test over every control, 4.8s locally and so on the same CI multiple.
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  // Widths where the panel's box reaches under the bar: 66px of overlap at
  // 560px wide down to 18px at 1024px. The shared region is the panel's empty
  // right margin, and this spec is what says so. One boot, then resizes — the
  // layout is CSS, and nine boots would be most of the suite's budget.
  test("no control is covered at the narrow desktop widths", async ({
    page,
  }) => {
    await boot(page, 1024, 700);
    for (const width of [560, 700, 800, 900, 1024]) {
      await resize(page, width, 700);

      const report = await page.evaluate(() => {
        const panel = document.querySelector("#controls");
        const bar = document.querySelector("#toolbar");
        if (!panel || !bar) throw new Error("no panel or toolbar");
        const owner = (x: number, y: number): string => {
          const hit = document.elementFromPoint(x, y);
          if (!hit) return "nothing";
          if (panel.contains(hit)) return "panel";
          return hit.closest("#toolbar") ? "toolbar" : "other";
        };
        const covered: string[] = [];
        const controls = [
          ...panel.querySelectorAll("button, input, select, a[href]"),
        ].filter((el) => (el as HTMLElement).offsetParent !== null);
        for (const el of controls) {
          const r = el.getBoundingClientRect();
          const name =
            el.getAttribute("title") ??
            el.getAttribute("aria-label") ??
            el.textContent?.trim().slice(0, 24) ??
            el.className;
          // Centre, and — for anything wide like the timeline track — the ends
          // too, since the bar meets the panel from the right.
          const xs = [r.left + r.width / 2, r.left + 4, r.right - 4];
          for (const x of xs) {
            if (
              owner(Math.round(x), Math.round(r.top + r.height / 2)) !== "panel"
            ) {
              covered.push(`${name} @${Math.round(x)}`);
            }
          }
        }
        const panelBox = panel.getBoundingClientRect();
        const barBox = bar.getBoundingClientRect();
        return {
          covered,
          overlap: Math.round(panelBox.right - barBox.left),
        };
      });

      // Premise: the two boxes really do overlap here, so a future layout that
      // separates them turns this spec into an honest no-op rather than a
      // silent one.
      expect(
        report.overlap,
        `the panel and the bar do not overlap at ${width}px wide`
      ).toBeGreaterThan(0);
      expect(
        report.covered,
        `the bar covers a control in the HUD at ${width}x700`
      ).toEqual([]);
    }
  });
});
