import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * "Share view" and "Imagery URL" both confirm a copy by swapping their own
 * visible label — "Link copied!", "Copied!" — for 1.6 s.
 *
 * For a screen reader that confirmation does not exist. A copy flips no state,
 * so there is no `aria-pressed` or value change to ride on; the clipboard
 * writes silently; and both buttons pin their accessible name with an
 * `aria-label`, so the swapped inner text is not the name and the label change
 * leaves the accessibility tree byte-identical. Measured at 1280x900 on the
 * pressed button, keyboard only: `aria-label` the same before and after, the
 * clipboard holding the URL, and the live region empty. The copy worked and
 * said nothing.
 *
 * The pair that must hold: a copy that SUCCEEDS speaks, and the fallback for a
 * copy the browser refuses stays silent — that path opens a `window.prompt`,
 * which takes focus and reads itself, so a second announcement would talk over
 * a modal already holding the user.
 */

test.use({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});

/** Observe the announcer, recording the text of every distinct announcement. */
async function watchAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const region = document.querySelector(".announcer");
    if (!region) throw new Error("no announcer region");
    const seen: string[] = [];
    (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__ = seen;
    new MutationObserver(() => {
      const text = (region.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
}

const announced = (page: Page) =>
  page.evaluate(
    () => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__
  );

/**
 * Walk the tab ring from the top of the document to a button, keyboard only —
 * the point is what a user who never touches a pointer hears when they press.
 */
async function tabTo(page: Page, selector: string): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const onTarget = await page.evaluate(
      (sel) => Boolean(document.activeElement?.matches(sel)),
      selector
    );
    if (onTarget) return;
  }
  throw new Error(`${selector} never took focus in 40 tab stops`);
}

test("copying the share link says so", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  const button = page.locator(".share-button");
  const nameBefore = await button.getAttribute("aria-label");

  await tabTo(page, ".share-button");
  await page.keyboard.press("Enter");

  // The premise: the copy really happened, and it really did leave nothing an
  // assistive technology could observe. Without these the announcement below
  // could be reporting a copy that never landed.
  await expect(button.locator(".share-button__label")).toHaveText(
    "Link copied!"
  );
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
    "the clipboard did not receive the share URL"
  ).toContain("#layer=");
  expect(
    await button.getAttribute("aria-label"),
    "the accessible name changed, so the label swap was not silent after all"
  ).toBe(nameBefore);
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.matches(".share-button"))
    ),
    "focus left the button, so its label change might have been read"
  ).toBe(true);

  expect(await announced(page)).toEqual(["Link copied"]);
});

test("copying the imagery URL names what was copied", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  const button = page.locator('.export__button[aria-label*="imagery URL"]');
  const nameBefore = await button.getAttribute("aria-label");

  await tabTo(page, '.export__button[aria-label*="imagery URL"]');
  await page.keyboard.press("Enter");

  await expect(button.locator(".export__label")).toHaveText("Copied!");
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
    "the clipboard did not receive the GIBS URL"
  ).toContain("wms.cgi");
  expect(
    await button.getAttribute("aria-label"),
    "the accessible name changed, so the label swap was not silent after all"
  ).toBe(nameBefore);

  // "Copied!" alone has lost its subject once the label is not the accessible
  // name, so the spoken form names what went to the clipboard.
  expect(await announced(page)).toEqual(["Imagery URL copied"]);
});

test("a copy the browser refuses stays silent", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);

  // Drive the fallback: a rejected write is how a blocked clipboard behaves.
  // The prompt is dismissed automatically by Playwright's default handler.
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("blocked")),
    });
  });
  await watchAnnouncements(page);

  await tabTo(page, ".share-button");
  await page.keyboard.press("Enter");

  // The refusal took the fallback: no confirmation flashed.
  await expect(page.locator(".share-button__label")).toHaveText("Share view");

  // The prompt is a modal that takes focus and reads itself. Announcing here
  // would talk over it.
  expect(await announced(page)).toEqual([]);
});
