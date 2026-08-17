import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

// Tall enough that the bottom HUD cannot grow over the window centre.
test.use({ viewport: { width: 1280, height: 900 } });

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

/** Tab from <body> until `predicate` matches the focused element, or give up. */
async function tabUntil(
  page: import("@playwright/test").Page,
  predicate: string,
  limit = 60
): Promise<number> {
  await page.evaluate(() => document.body.focus());
  for (let i = 1; i <= limit; i++) {
    await page.keyboard.press("Tab");
    if (await page.evaluate(predicate)) return i;
  }
  return -1;
}

const FOCUS_IS_NEXT_STEP = `document.activeElement?.getAttribute("aria-label")?.startsWith("Next") ?? false`;
const FOCUS_IS_PREV_STEP = `document.activeElement?.getAttribute("aria-label")?.startsWith("Previous") ?? false`;

test("the end-of-record stepper stays in the tab ring", async ({ page }) => {
  const next = page.locator('.timeline__step[aria-label^="Next"]');

  // Boot lands on the newest published month, so the forward stepper is at its
  // dead end from the first paint — and carries the label that explains why.
  await expect(next).toHaveAttribute("aria-label", /is the newest published$/);

  // That explanation is worthless if Tab can never land on it.
  expect(
    await tabUntil(page, FOCUS_IS_NEXT_STEP),
    "forward stepper reachable by Tab while at the end of the record"
  ).toBeGreaterThan(0);
});

test("pressing a stepper into the end of the record keeps focus on it", async ({
  page,
}) => {
  const readout = page.locator(".timeline__readout");
  const newest = await readout.textContent();

  // Walk the real tab ring to the back stepper — no programmatic focus.
  expect(await tabUntil(page, FOCUS_IS_PREV_STEP)).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await expect(readout).not.toHaveText(newest ?? "");

  // Forward again returns to the newest month, which is the moment the button
  // hits its dead end. Focus must survive the user's own keypress.
  await page.keyboard.press("Tab");
  await expect(page.locator(".timeline__step").nth(1)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(readout).toHaveText(newest ?? "");
  await expect(page.locator(".timeline__step").nth(1)).toBeFocused();
});

test("a stepper at its dead end declines the press", async ({ page }) => {
  const readout = page.locator(".timeline__readout");
  const newest = await readout.textContent();
  const next = page.locator(".timeline__step").nth(1);

  await expect(next).toBeDisabled();
  // Focus it the way a keyboard user would, then press it — a dead-ended
  // stepper must not step, and must not wrap round to the other end.
  expect(await tabUntil(page, FOCUS_IS_NEXT_STEP)).toBeGreaterThan(0);
  await page.keyboard.press("Enter");
  await page.keyboard.press("Enter");
  await expect(readout).toHaveText(newest ?? "");
});
