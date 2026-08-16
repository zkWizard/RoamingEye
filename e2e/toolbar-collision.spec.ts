import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The overlay toolbar is centred vertically, so its top edge climbs as the
 * column grows. Issue #93 fixed it colliding with the top-right button column
 * (Share / Save / Compare) by anchoring the bar below those buttons — but only
 * under a hardcoded 820px window height, and the column has since grown to
 * nine toggles and 609px, which puts its top edge over the Compare button on
 * any window shorter than ~987px. That left a band above the breakpoint —
 * 1440x900 and 1280x900 among the commonest laptop viewports — where clicking
 * the middle of Compare hit the HD tiles toggle instead, switching imagery
 * resolution rather than opening comparison mode.
 *
 * These specs drive the pointer at the buttons' real on-screen centres, which
 * is what a person does; `locator.click()` would refuse the click outright
 * because Playwright's actionability check spots the interception, and a
 * refusal is a weaker signal than the wrong control firing.
 */

const BAND = [
  { w: 1440, h: 900 },
  { w: 1280, h: 900 },
  { w: 1366, h: 960 },
];

async function boot(page: Page, width: number, height: number): Promise<void> {
  await page.setViewportSize({ width, height });
  await page.goto("/");
  await awaitAppInteractive(page);
}

/** The control that would actually receive a click at `sel`'s visual centre. */
async function ownerAtCentre(page: Page, sel: string): Promise<string> {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (!el) throw new Error(`no ${s}`);
    const b = el.getBoundingClientRect();
    const hit = document.elementFromPoint(
      Math.round(b.left + b.width / 2),
      Math.round(b.top + b.height / 2)
    ) as HTMLElement | null;
    if (!hit) return "nothing";
    if (hit === el || el.contains(hit)) return "itself";
    const toolbarItem = hit.closest(".toolbar__item") as HTMLElement | null;
    if (toolbarItem) return `toolbar: ${toolbarItem.title}`;
    return hit.closest(".toolbar") ? "toolbar" : hit.tagName.toLowerCase();
  }, sel);
}

test.describe("toolbar never steals the top-right buttons", () => {
  for (const { w, h } of BAND) {
    test(`Compare opens rather than toggling an overlay at ${w}x${h}`, async ({
      page,
    }) => {
      await boot(page, w, h);

      // Premise: this viewport is above the short-window breakpoint, so the
      // column is centred here — the layout the collision lived in. Without
      // this the spec would keep passing if the breakpoint simply swallowed
      // the whole band, which is a different fix with a different cost.
      const centred = await page.evaluate(
        () =>
          getComputedStyle(document.querySelector("#toolbar")!).top !== "200px"
      );
      expect(
        centred || h > 820,
        `${h}px should be above the short-window breakpoint`
      ).toBeTruthy();

      expect(await ownerAtCentre(page, ".compare-button")).toBe("itself");

      // The user-facing outcome: press Compare where it is drawn and comparison
      // mode opens, with the imagery toggles left alone.
      const hd = page.locator('.toolbar__item[title="HD tiles"]');
      const before = await hd.getAttribute("aria-pressed");
      const box = (await page.locator(".compare-button").boundingBox())!;
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);

      await expect(page.locator(".compare-button")).toHaveAttribute(
        "aria-pressed",
        "true"
      );
      await expect(hd).toHaveAttribute("aria-pressed", before ?? "true");
    });
  }

  test("the whole top-right column stays clickable across the band", async ({
    page,
  }) => {
    await boot(page, 1440, 900);
    for (let height = 830; height <= 1000; height += 30) {
      await page.setViewportSize({ width: 1440, height });
      // The column is repositioned by CSS alone, but `data-overflow` is written
      // from a ResizeObserver, so give the frame a beat before measuring.
      await page.waitForFunction(
        (expected) => window.innerHeight === expected,
        height
      );
      for (const sel of [
        ".compare-button",
        ".share-button",
        ".export__button",
      ]) {
        expect(
          await ownerAtCentre(page, sel),
          `${sel} is covered at 1440x${height}`
        ).toBe("itself");
      }
    }
  });

  test("a window with room keeps the column centred and whole", async ({
    page,
  }) => {
    await boot(page, 1440, 1080);
    const box = await page.locator("#toolbar").evaluate((el) => ({
      top: el.getBoundingClientRect().top,
      // The integer pair Toolbar.updateOverflow() measures — a fractional
      // getBoundingClientRect height never equals the rounded scrollHeight.
      client: el.clientHeight,
      scroll: el.scrollHeight,
    }));
    // Nothing is capped or scrolled once the window is tall enough, and the
    // bar still clears the buttons.
    expect(box.scroll - box.client).toBeLessThanOrEqual(2);
    expect(box.top).toBeGreaterThan(189);
    await expect(page.locator("#toolbar")).toHaveAttribute(
      "data-overflow",
      "none"
    );
    expect(await ownerAtCentre(page, ".compare-button")).toBe("itself");
  });
});
