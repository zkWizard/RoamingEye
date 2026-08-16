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
 */

/** Cap the column shares with the centred layout: 200px top + 200px bottom. */
const RESERVE = 400;

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
  test("no step at the short-window breakpoint", async ({ page }) => {
    await boot(page, 1366, 821);
    const above = await column(page);
    await resize(page, 1366, 820);
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
    await boot(page, 1366, 900);
    let previous = 0;
    for (let height = 620; height <= 900; height += 20) {
      await resize(page, 1366, height);
      const col = await column(page);

      // The cap is the whole rule: as much column as the window leaves after
      // the 200px above and below, and never more than the column needs.
      expect(
        Math.abs(col.height - Math.min(col.natural, height - RESERVE)),
        `column is not the capped height at 1366x${height}`
      ).toBeLessThanOrEqual(2);
      expect(
        col.height,
        `column shrank as the window grew at 1366x${height}`
      ).toBeGreaterThanOrEqual(previous);
      // The anchor holds throughout, so the top-right buttons stay clear.
      expect(col.top, `column rose above 200px at 1366x${height}`).toBe(200);
      previous = col.height;
    }
  });

  test("more of the column is on screen at a laptop height", async ({
    page,
  }) => {
    // The user-facing point of dropping the reserve. 1366x768 is the commonest
    // laptop panel; the reserve left three toggles of nine on screen there.
    await boot(page, 1366, 768);
    expect((await column(page)).visible).toBeGreaterThanOrEqual(5);
    await resize(page, 1366, 720);
    expect((await column(page)).visible).toBeGreaterThanOrEqual(4);
  });
});

test.describe("the HUD panel keeps its clicks where the boxes overlap", () => {
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
