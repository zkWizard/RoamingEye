import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The providers, software and fleet panels each load as their own chunk on first
 * open. These specs drive that request into failure, which is what a flaky
 * connection does, and pin what the reader is told, whether pressing again is
 * worth anything, and that a successful open still says nothing.
 */

const CHUNK = "**/assets/ProvidersPage*";

test.use({ viewport: { width: 1280, height: 900 } });

test("a failed panel chunk is worded, and pressing again is not the remedy", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(CHUNK, (route) => {
    attempts++;
    return route.abort();
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();

  // Premise: the chunk really was requested and really did fail.
  await expect.poll(() => attempts, { timeout: 15_000 }).toBeGreaterThan(0);

  const toast = page.locator(".error-toast");
  await expect(toast).toContainText(
    "Couldn't load the data providers. Reload the page to try again.",
    { timeout: 15_000 }
  );
  // The reader is not handed a hashed bundle URL.
  await expect(toast).not.toContainText("assets/");
  await expect(page.locator("#providers-page")).toBeHidden();

  // Pressing again is NOT the remedy, and the copy must not imply it is: a
  // rejected dynamic import stays rejected in the browser's module map, so the
  // second press re-requests nothing and repeats the same worded failure. The
  // cache reset in `lazyPanel` cannot reach the network.
  await page.locator(".error-toast__close").click();
  const before = attempts;
  await page.locator("#providers-link").click();
  await expect(toast).toContainText("Reload the page to try again.", {
    timeout: 15_000,
  });
  expect(attempts).toBe(before);
  await expect(page.locator("#providers-page")).toBeHidden();

  // The remedy the message names does work.
  await page.unroute(CHUNK);
  await page.reload();
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();
  await expect(page.locator("#providers-page")).toBeVisible({
    timeout: 20_000,
  });
});

test("a panel that loads its chunk shows no error toast", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();

  await expect(page.locator("#providers-page")).toBeVisible({
    timeout: 20_000,
  });
  // The panel opening is the report; a toast on the success path would be noise.
  await expect(page.locator(".error-toast")).toHaveText("");
});
