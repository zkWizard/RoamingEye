import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Enabling an overlay flips `aria-pressed` on the press — correct for the
 * control, but on a slow feed it claims the overlay is drawn seconds before
 * its data exists. `aria-busy` covered the wait and then simply vanished, so
 * the markers arriving on the globe — the thing actually asked for — reached
 * nobody who could not see them. Failure had a voice (the error toast);
 * success did not.
 *
 * What must hold is a pair, not a single line: the outcome is announced when
 * the app admitted to waiting, and stays silent when it did not. An announcer
 * that fires on every toggle would talk over `aria-pressed` on each of the
 * nine toolbar buttons, which is its own defect.
 */

/** Observe the announcer, recording the text of every distinct announcement. */
async function watchAnnouncements(page: import("@playwright/test").Page) {
  await page.evaluate(() => {
    const region = document.querySelector(".announcer");
    if (!region) throw new Error("no announcer region");
    const seen: string[] = [];
    (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__ = seen;
    new MutationObserver(() => {
      seen.push((region.textContent ?? "").trim());
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
}

const announced = (page: import("@playwright/test").Page) =>
  page.evaluate(
    () => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__
  );

test("a slow overlay enable announces that it landed", async ({ page }) => {
  test.setTimeout(60_000);
  // Hold the feed long enough that the toggle passes the pending threshold and
  // commits to telling the user it is waiting.
  await page.route("**earthquake.usgs.gov**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });

  await page.goto("/");
  await awaitAppInteractive(page);

  // Rendered and live at rest — a region toggled with `hidden` is outside the
  // accessibility tree, so text written into it announces nothing.
  const region = page.locator(".announcer");
  await expect(region).toHaveAttribute("role", "status");
  await expect(region).toHaveText("");

  await watchAnnouncements(page);
  const quakes = page.getByRole("button", { name: "Quakes" });
  await quakes.click();

  // Nothing yet: the data has not arrived, and saying so early would be the
  // same premature claim `aria-pressed` already makes.
  await expect(page.locator(".toolbar__item[aria-busy='true']")).toBeVisible();
  expect(await announced(page)).toEqual([]);

  await expect(region).toHaveText("Quakes shown", { timeout: 15_000 });
  expect(await announced(page)).toEqual(["Quakes shown"]);
});

test("toggling without a wait announces nothing", async ({ page }) => {
  test.setTimeout(60_000);
  // Delay only the first (and only) request, so priming reliably crosses the
  // pending threshold instead of depending on how fast the real feed answers.
  await page.route("**earthquake.usgs.gov**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });

  await page.goto("/");
  await awaitAppInteractive(page);

  const quakes = page.getByRole("button", { name: "Quakes" });
  // Prime the overlay so its loader is memoized and the next enable resolves
  // from cache rather than the network.
  await quakes.click();
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".announcer")).toHaveText("Quakes shown", {
    timeout: 15_000,
  });

  await watchAnnouncements(page);

  // A disable never waits on anything...
  await quakes.click();
  await expect(quakes).toHaveAttribute("aria-pressed", "false");
  // ...and the re-enable is served from the memoized load, so it settles in a
  // microtask — well inside the threshold at which the app would claim to be
  // busy. Neither may produce a second announcement.
  await quakes.click();
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
  await page.waitForTimeout(1000);

  expect(await announced(page)).toEqual([]);
});
