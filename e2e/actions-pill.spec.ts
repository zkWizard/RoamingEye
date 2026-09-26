import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { openMoreMenu } from "./actions";

/**
 * The actions pill: Draw region, Compare and Share view in one row under the
 * search field, and everything used less often one tap deeper behind More
 * (src/ui/ActionMenu.ts).
 *
 * It replaces two columns of chrome. On the left, under the wordmark: the hint
 * sentence with its `?` badge, Find software and the theme toggle. On the
 * right, under the search field: Share, the two exports, Compare and Draw,
 * stacked. Their collisions with each other and with the dock's fold control
 * took four specs to hold apart — coarse-pointer-hint-badge,
 * coarse-pointer-header-row, coarse-pointer-tablet and
 * fine-pointer-short-window — each pinning a rule that moved one control out
 * of another's way at one band of sizes. Those controls all live in the pill
 * now, so this spec inherits their sizes and asks what the new layout can get
 * wrong:
 *
 *  - every action is a real target: a press at its centre lands on it, and
 *    what a press can reach through that centre is 44px under a thumb and the
 *    24px AA floor (WCAG 2.5.8) under a mouse;
 *  - the pill takes nothing from its neighbours: the search field above it,
 *    the dock and its fold control, and the overlay toolbar;
 *  - it stays out of the globe's upper middle, where
 *    probe-overlap-landscape.spec.ts aims a probe at (width/2, height*0.3). On
 *    a short window the labelled pill (~380px) reached across that point,
 *    which is why it drops to icons below 500px of height;
 *  - the open menu sits over whatever it overlaps (the toolbar comes later in
 *    the document at the same z-index, and on first build it covered the
 *    menu), and every row can be reached, scrolling on a window too short to
 *    show them all.
 *
 * The sizes ride in one context per pointer type via setViewportSize — a
 * fresh context costs a full boot (~1 min), and this is the blocking suite.
 */

type Size = { width: number; height: number };

const COARSE_SIZES: Size[] = [
  // Phones, portrait. 320 and 360 are where a labelled pill overflowed.
  { width: 320, height: 568 },
  { width: 360, height: 740 },
  { width: 375, height: 667 },
  { width: 390, height: 844 },
  { width: 430, height: 932 },
  // Phones on their side.
  { width: 568, height: 320 },
  { width: 667, height: 375 },
  { width: 740, height: 360 },
  { width: 844, height: 390 },
  { width: 932, height: 430 },
  // Tablets, both ways up.
  { width: 768, height: 1024 },
  { width: 820, height: 1180 },
  { width: 1024, height: 1366 },
  { width: 1180, height: 820 },
  { width: 1024, height: 600 },
];

const FINE_SIZES: Size[] = [
  // Desktop windows dragged short: the band fine-pointer-short-window held.
  ...[568, 740, 800, 932, 1280].flatMap((width) =>
    [310, 335, 400].map((height) => ({ width, height }))
  ),
  { width: 667, height: 375 },
  { width: 1024, height: 600 },
  { width: 1280, height: 720 },
  { width: 1440, height: 900 },
];

const SEGMENTS = [
  ".draw-button",
  ".compare-button",
  ".share-button",
  "#more-button",
];

const MENU_ROWS = [
  '.export__button[aria-label*="PNG"]',
  '.export__button[aria-label*="imagery URL"]',
  "#software-link",
  "#shortcuts-link",
  ".theme-toggle",
];

/**
 * What a press can actually receive, not how big the box is: walk out from
 * the centre in 0.5px steps until the hit test stops naming the element, and
 * report the span that survives, plus whoever owns the centre if it is not the
 * element itself. Scrolls the element into view first, for the rows of a menu
 * that scrolls on a short window.
 */
const reachable = (page: Page, selector: string) =>
  page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel);
    if (!el) return { centre: false, width: 0, height: 0, thief: "missing" };
    el.scrollIntoView({ block: "nearest" });
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    const owns = (x: number, y: number) => {
      const at = document.elementFromPoint(x, y);
      return !!at && (at === el || el.contains(at));
    };
    const walk = (dx: number, dy: number) => {
      let d = 0;
      while (d < 60 && owns(cx + dx * (d + 0.5), cy + dy * (d + 0.5))) d += 0.5;
      return d;
    };
    if (!owns(cx, cy)) {
      const at = document.elementFromPoint(cx, cy);
      const owner = at?.closest("button,a,[id]");
      return {
        centre: false,
        width: 0,
        height: 0,
        thief: owner
          ? `${owner.tagName}${owner.id ? "#" + owner.id : "." + String(owner.className).split(" ")[0]}`
          : (at?.tagName ?? "outside the window"),
      };
    }
    return {
      centre: true,
      width: walk(-1, 0) + walk(1, 0),
      height: walk(0, -1) + walk(0, 1),
      thief: null as string | null,
    };
  }, selector);

/** Boxes the pill must not share a pixel with, and the probe's aim point. */
const neighbours = (page: Page) =>
  page.evaluate(() => {
    const rect = (sel: string) => {
      const el = document.querySelector<HTMLElement>(sel);
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    };
    const pill = rect("#actions")!;
    const meets = (r: DOMRect | null) =>
      !!r &&
      r.left < pill.right &&
      r.right > pill.left &&
      r.top < pill.bottom &&
      r.bottom > pill.top;
    const aim = { x: innerWidth / 2, y: innerHeight * 0.3 };
    return {
      search: meets(rect(".search__field")),
      controls: meets(rect("#controls")),
      toolbar: meets(rect("#toolbar")),
      overflows: pill.left < 0 || pill.right > innerWidth,
      coversAim:
        aim.x >= pill.left &&
        aim.x <= pill.right &&
        aim.y >= pill.top &&
        aim.y <= pill.bottom,
    };
  });

async function sweep(page: Page, sizes: Size[], floor: number) {
  const failures: string[] = [];
  for (const size of sizes) {
    await page.setViewportSize(size);
    await page.waitForFunction((w) => innerWidth === w, size.width);
    const at = `${size.width}x${size.height}`;

    for (const sel of SEGMENTS) {
      const r = await reachable(page, sel);
      if (!r.centre) failures.push(`${at} ${sel}: centre is ${r.thief}`);
      else if (r.width < floor || r.height < floor)
        failures.push(`${at} ${sel}: only ${r.width}x${r.height} reachable`);
    }

    const n = await neighbours(page);
    if (n.overflows) failures.push(`${at}: the pill runs off the screen`);
    if (n.search) failures.push(`${at}: the pill meets the search field`);
    if (n.controls) failures.push(`${at}: the pill meets the dock`);
    if (n.toolbar) failures.push(`${at}: the pill meets the toolbar`);
    if (n.coversAim)
      failures.push(`${at}: the pill covers the globe's upper middle`);

    const fold = await page.locator("#hud-collapse").boundingBox();
    if (fold && fold.width > 0) {
      const r = await reachable(page, "#hud-collapse");
      if (!r.centre) failures.push(`${at} #hud-collapse: centre is ${r.thief}`);
    }

    await openMoreMenu(page);
    for (const sel of MENU_ROWS) {
      const r = await reachable(page, sel);
      if (!r.centre) failures.push(`${at} ${sel}: centre is ${r.thief}`);
      else if (r.height < floor)
        failures.push(`${at} ${sel}: only ${r.height}px tall`);
    }
    await page.keyboard.press("Escape");
    await expect(page.locator("#more-menu")).toBeHidden();
  }
  return failures;
}

test("every action is a 44px target on a touch device, phone to tablet", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: COARSE_SIZES[0],
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await page.goto("/");
    await awaitAppInteractive(page);
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "the context is not emulating a coarse pointer"
    ).toBe(true);

    expect(await sweep(page, COARSE_SIZES, 44)).toEqual([]);

    // End to end, at the smallest phone on its side, where the menu has to
    // scroll: the theme row switches the theme and nothing else fires.
    await page.setViewportSize({ width: 568, height: 320 });
    const before = await page.evaluate(
      () => document.documentElement.dataset.theme
    );
    await openMoreMenu(page);
    await page.locator(".theme-toggle").click();
    await expect
      .poll(() => page.evaluate(() => document.documentElement.dataset.theme))
      .not.toBe(before);
    await expect(page.locator("#more-menu")).toBeHidden();
    await expect(page.locator(".draw-button")).toHaveAttribute(
      "aria-pressed",
      "false"
    );
  } finally {
    await context.close();
  }
});

test("every action clears the AA floor in a short desktop window", async ({
  page,
}) => {
  await page.setViewportSize(FINE_SIZES[0]);
  await page.goto("/");
  await awaitAppInteractive(page);
  expect(await sweep(page, FINE_SIZES, 24)).toEqual([]);
});

test.describe("the More menu", () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await awaitAppInteractive(page);
  });

  test("opens, and closes by every way out", async ({ page }) => {
    const trigger = page.locator("#more-button");
    const menu = page.locator("#more-menu");

    // The trigger toggles it, and says which.
    await trigger.click();
    await expect(menu).toBeVisible();
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    await trigger.click();
    await expect(menu).toBeHidden();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");

    // Escape from inside it hands focus back to the trigger, not to <body>.
    await trigger.focus();
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    await page.keyboard.press("Tab");
    expect(
      await page.evaluate(() =>
        document.querySelector("#more-menu")!.contains(document.activeElement)
      ),
      "Tab from the open trigger walks into the menu"
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toBeHidden();
    await expect(trigger).toBeFocused();

    // Tabbing off the last row closes it rather than leaving it hanging open
    // behind the focus.
    await page.keyboard.press("Enter");
    await expect(menu).toBeVisible();
    for (let i = 0; i < MENU_ROWS.length; i++) await page.keyboard.press("Tab");
    await expect(page.locator(".theme-toggle")).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(menu).toBeHidden();

    // A press outside closes it and still lands where it was aimed.
    await trigger.click();
    await expect(menu).toBeVisible();
    await page.locator(".search__input").click();
    await expect(menu).toBeHidden();
    await expect(page.locator(".search__input")).toBeFocused();
  });

  test("a row that opens a panel returns focus to More when it closes", async ({
    page,
  }) => {
    // The row itself is hidden by then, so the panel's focus trap has to have
    // recorded the trigger, not the row, as where focus came from.
    await openMoreMenu(page);
    await page.locator("#software-link").click();
    await expect(page.locator("#software-page")).toHaveClass(/is-open/);
    await expect(page.locator("#more-menu")).toBeHidden();
    await page.keyboard.press("Escape");
    await expect(page.locator("#software-page")).not.toHaveClass(/is-open/);
    await expect(page.locator("#more-button")).toBeFocused();
  });

  test("an export keeps the menu open to show its result", async ({ page }) => {
    await openMoreMenu(page);
    const copy = page.locator('.export__button[aria-label*="imagery URL"]');
    await copy.click();
    // "Copied!" (or the refusal) reports in place, so the menu stays up.
    await expect(page.locator("#more-menu")).toBeVisible();
    await expect(copy).toBeFocused();
  });
});
