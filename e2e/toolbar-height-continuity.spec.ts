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

/** Width at and above which the laptop checks apply. */
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

    // One pixel of window may cost one pixel of panel, and nothing more. The
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

      expect(
        col.height,
        `panel shrank as the window grew at ${BAND_WIDTH}x${height}`
      ).toBeGreaterThanOrEqual(previous);
      // Anchored under the actions pill, never centred up into it.
      expect(
        col.top,
        `panel rose into the actions pill at ${BAND_WIDTH}x${height}`
      ).toBeGreaterThanOrEqual(120);
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

  test("map details stay reachable at a laptop height", async ({ page }) => {
    // 1366x768 is the common laptop. The picture cards lead, so the labeled
    // rows sit further down — scrolling the panel body is what reaches them,
    // and each one has to land inside that body when asked.
    await boot(page, BAND_WIDTH, 768);
    const missed = await page.evaluate(() => {
      const body = document.querySelector("#toolbar-body");
      if (!body) return ["no body"];
      const box = body.getBoundingClientRect();
      const missed: string[] = [];
      for (const id of [
        "borders",
        "cities",
        "timezones",
        "plates",
        "volcanoes",
        "quakes",
      ]) {
        const el = body.querySelector(`[data-overlay="${id}"]`);
        if (!el) {
          missed.push(id);
          continue;
        }
        el.scrollIntoView({ block: "nearest" });
        const r = el.getBoundingClientRect();
        if (r.top < box.top - 1 || r.bottom > box.bottom + 1) missed.push(id);
      }
      return missed;
    });
    expect(missed).toEqual([]);
  });

  test("a narrow window still stops the panel above the dock", async ({
    page,
  }) => {
    await boot(page, NARROW, 600);
    const gap = await page.evaluate(() => {
      const bar = document.querySelector("#toolbar")!.getBoundingClientRect();
      const dock = document.querySelector(".controls")!.getBoundingClientRect();
      return Math.round(dock.top - bar.bottom);
    });
    expect(
      gap,
      "the panel runs into the dock at 1024x600"
    ).toBeGreaterThanOrEqual(0);
  });
});

test.describe("the HUD panel keeps its clicks beside the bar", () => {
  // Same walk, same reason as the block above: five widths of resize plus a
  // hit test over every control, 4.8s locally and so on the same CI multiple.
  test.beforeEach(() => {
    test.setTimeout(120_000);
  });

  // The narrow desktop widths are where the bar and the panel meet. The old
  // panel's box reached under the bar (66px at 560px wide down to 18px at
  // 1024px), across an empty right margin this spec kept empty. The dock now
  // keeps a gutter for the bar on both sides, so the boxes do not meet at all,
  // and the premise below is the stronger claim. One boot, then resizes — the
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

      // The panel is wider than the old icon column, so the boxes share
      // horizontal range. What has to hold is that the panel stops above the
      // dock, and that no dock control's own point lands on the panel.
      expect(
        report.covered,
        `the bar covers a control in the HUD at ${width}x700`
      ).toEqual([]);
    }
  });
});
