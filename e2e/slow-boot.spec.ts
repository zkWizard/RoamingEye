import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The boot curtain covers the viewport at z-index 3, so everything the app
 * says about a failing load — "Imagery failed to load", the retry button — is
 * painted behind it and reaches nobody until it lifts. With GIBS stalled that
 * takes the full 15 s request timeout, and measurement showed the whole
 * user-visible event until then was a spinner and "Loading Earth…": exactly
 * what a healthy boot looks like. These tests pin the notice that fills the
 * gap, and — just as important — pin that an ordinary boot never sees it.
 */

const NOTICE = /NASA GIBS is slow to answer/;

test("a stalled upstream says so instead of spinning silently", async ({
  page,
}) => {
  test.setTimeout(60_000);
  // Hang, don't fail: a rejected request would surface the failure path early,
  // and the silent window is precisely what this is about.
  await page.route(/gibs\.earthdata\.nasa\.gov/, () => {});

  const notice = page.locator("#loader-slow");
  // The region itself is always present and always live, so the line is
  // announced when it lands rather than arriving in a hidden subtree.
  await page.goto("/");
  await expect(notice).toHaveAttribute("role", "status");

  // Nothing at two seconds — a boot that is merely a moment slow must not be
  // told an upstream is misbehaving.
  await page.waitForTimeout(2000);
  await expect(notice).toHaveText("");

  await expect(notice).toHaveText(NOTICE, { timeout: 10_000 });
  // ...and it is still the curtain the user is looking at, which is the whole
  // reason the status line underneath could not do this job.
  await expect(page.locator("#loader")).toBeVisible();
});

test("an ordinary boot never shows the slow notice", async ({ page }) => {
  test.setTimeout(60_000);
  const started = Date.now();
  await page.goto("/");
  await awaitAppInteractive(page);
  // Sit past the threshold. Two independent things keep the notice away here —
  // the curtain lifting cancels the timer, and the timer re-checks the boot
  // flag before it writes — so this fails only if both are lost. That is the
  // point: what must never regress is the outcome, not either mechanism.
  await page.waitForTimeout(Math.max(0, started + 8000 - Date.now()));
  await expect(page.locator("#loader-slow")).toHaveText("");
});
