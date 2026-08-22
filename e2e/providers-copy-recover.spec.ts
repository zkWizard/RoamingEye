import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The four citation buttons must come back to their own names.
 *
 * These buttons carry no `aria-label`, so — unlike `.share-button` and the
 * imagery-URL button — their visible text IS their accessible name. A label
 * left behind does not merely look wrong: it renames the control for the rest
 * of the session, and "Copy failed" is not a name anyone can find "Copy
 * BibTeX" by. The four sit side by side and compose four different artifacts,
 * so the name is the only thing telling them apart.
 *
 * Two ways to strand one, both from the same missing piece — the restore never
 * pinned the button's canonical label:
 *
 *  - A refused clipboard (permissions policy, insecure context, a denied
 *    prompt) took the `.catch`, which set "Copy failed" and scheduled nothing.
 *    The rename was permanent, while the artifact it names sat one working
 *    press away.
 *  - Two presses inside the 1.6s window pinned "Copied ✓". The success path
 *    read the label to restore back off the LIVE `textContent`, so the second
 *    press captured the confirmation itself as the resting text; the first
 *    timer restored the real label, and the second then overwrote it with
 *    "Copied ✓" for good.
 *
 * `ProbePanel.flashCopyLabel` already had the shape both needed: restore the
 * canonical label, and let a fresh press restart the window rather than stack
 * on it.
 *
 * Both assertions snapshot the label after the window has fully elapsed rather
 * than polling for it. On main the double press passes through the correct
 * label for the 800ms between the two timers, and a polling assertion would
 * catch that window and call the defect fixed.
 */

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

const FLASH_MS = 1600;

async function openProviders(page: Page) {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();
  await expect(page.locator("#providers-page")).toHaveClass(/is-open/);
}

/** Positional, not by text: a `hasText` filter goes blind mid-flash — the very
 *  window these tests measure. First of the four is "Copy BibTeX". */
const firstCiteBtn = (page: Page) =>
  page.locator(".providers__cite-actions button").nth(0);

test("a refused copy does not rename the button for good", async ({ page }) => {
  await openProviders(page);

  const btn = firstCiteBtn(page);
  await expect(btn).toHaveText("Copy BibTeX");

  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("blocked")),
    });
  });

  await btn.click();
  await expect(btn).toHaveText("Copy failed");

  await page.waitForTimeout(FLASH_MS + 900);
  expect(
    await btn.textContent(),
    "the refusal was never cleared, so the button is now named 'Copy failed'"
  ).toBe("Copy BibTeX");

  // The harm named directly: the control is findable by its own name again.
  await expect(page.getByRole("button", { name: "Copy BibTeX" })).toHaveCount(
    1
  );
});

test("a second press inside the flash window does not pin the confirmation", async ({
  page,
}) => {
  await openProviders(page);

  const btn = firstCiteBtn(page);
  await expect(btn).toHaveText("Copy BibTeX");

  await btn.click();
  await expect(btn).toHaveText("Copied ✓");
  // Well inside the 1.6s window, so the two timers overlap.
  await page.waitForTimeout(700);
  await btn.click();
  await expect(btn).toHaveText("Copied ✓");

  // Past BOTH the first press's timer and the second's.
  await page.waitForTimeout(FLASH_MS + 900);
  expect(
    await btn.textContent(),
    "overlapping presses left the confirmation pinned as the button's name"
  ).toBe("Copy BibTeX");
  await expect(page.getByRole("button", { name: "Copy BibTeX" })).toHaveCount(
    1
  );
});
