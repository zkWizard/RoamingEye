import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The error toast dismisses itself on an 8s clock by REMOVING its box from the
 * DOM. The close button is that box's only control, and it is 30 tab stops into
 * the document — so a reader who arrives there by keyboard is standing on a node
 * a timer is about to delete, and deleting a focused node hands focus to <body>.
 * Measured on main before this fix: focus went `.error-toast__close` → BODY,
 * which restarts tabbing from the top of a 30-stop document.
 *
 * Three guarantees are pinned here: the clock stops while the reader is inside,
 * dismissing hands focus back to where they came from, and a toast nobody
 * touches still clears itself — the last so the pause cannot become a leak.
 */

/** The production clock (ErrorToast.AUTO_HIDE_MS). Waits are relative to it. */
const AUTO_HIDE_MS = 8000;

let pageErrors: string[] = [];

/** Raise a toast the way an uncaught failure does. */
async function raiseToast(page: Page, message: string): Promise<void> {
  await page.evaluate((m) => {
    setTimeout(() => {
      throw new Error(m);
    }, 0);
  }, message);
  await expect(page.locator(".error-toast__box")).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  pageErrors = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  await page.goto("/");
  await awaitAppInteractive(page);
});

test.afterEach(() => {
  // The throws below are deliberate; anything else is a real fault.
  expect(pageErrors.filter((m) => !m.includes("e2e toast failure"))).toEqual(
    []
  );
});

test("the auto-hide clock stops while the reader is inside the toast", async ({
  page,
}) => {
  await raiseToast(page, "e2e toast failure");

  const close = page.locator(".error-toast__close");
  await close.focus();
  await expect(close).toBeFocused();

  // Well past the clock: unpaused, the timer would have deleted the very node
  // focus is sitting on. It must still be here, and still focused.
  await page.waitForTimeout(AUTO_HIDE_MS + 2000);
  await expect(page.locator(".error-toast__box")).toHaveCount(1);
  await expect(close).toBeFocused();
});

test("dismissing hands focus back rather than dropping it on <body>", async ({
  page,
}) => {
  // Somewhere a reader could plausibly be working when the failure arrives.
  const origin = page.locator(".search__input");
  await origin.focus();
  await expect(origin).toBeFocused();

  await raiseToast(page, "e2e toast failure");

  const close = page.locator(".error-toast__close");
  await close.focus();
  await close.press("Enter");
  await expect(page.locator(".error-toast__box")).toHaveCount(0);

  // The whole point: not BODY.
  expect(await page.evaluate(() => document.activeElement?.tagName)).not.toBe(
    "BODY"
  );
  await expect(origin).toBeFocused();
});

test("a toast nobody touches still clears itself", async ({ page }) => {
  await raiseToast(page, "e2e toast failure");
  // Never focused, so the clock was never paused.
  await expect(page.locator(".error-toast__box")).toHaveCount(0, {
    timeout: AUTO_HIDE_MS + 4000,
  });
});

test("stepping out of the toast restarts the clock", async ({ page }) => {
  await raiseToast(page, "e2e toast failure");

  const close = page.locator(".error-toast__close");
  await close.focus();
  await expect(close).toBeFocused();

  // Leaving must re-arm what entering suspended, or a toast touched once would
  // sit over the globe for the rest of the session.
  await page.locator(".theme-toggle").focus();
  await expect(page.locator(".error-toast__box")).toHaveCount(0, {
    timeout: AUTO_HIDE_MS + 4000,
  });
});
