import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Compare refuses the one static layer (terrain — a single image, so there is
 * no second month to sweep against), and it reported that refusal by swapping
 * its own label to "No time dimension" for 1.6 s.
 *
 * That was the entire answer, and it is visual only. The refusal changes no
 * state: `aria-pressed` stays "false", no divider appears, focus never leaves
 * the button — and a rewrite of the accessible name of the element already
 * holding focus is not re-announced. Measured at 1280x900: 18 tab stops to the
 * button, Enter, and the live region stayed empty. Silence is what a dead
 * control sounds like.
 *
 * What must hold is a pair, not a single line. The refusal speaks, and the
 * press that SUCCEEDS stays silent — that outcome is already carried by
 * `aria-pressed` flipping on the focused button, so announcing it too would
 * talk over a state the control holds.
 */

test.use({ viewport: { width: 1280, height: 900 } });

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

/** Pick a base layer through the listbox, by its visible label. */
async function selectLayer(page: Page, label: string): Promise<void> {
  await page.click(".layer-selector__trigger");
  await page.locator(".layer-selector__option", { hasText: label }).click();
  await expect(page.locator(".layer-selector__current")).toHaveText(label);
}

/**
 * Walk the tab ring from the top of the document to the Compare button —
 * keyboard only, since the point is what a user who never touches a pointer
 * hears when they press it.
 */
async function tabToCompare(page: Page): Promise<void> {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const onTarget = await page.evaluate(() =>
      Boolean(document.activeElement?.classList?.contains("compare-button"))
    );
    if (onTarget) return;
  }
  throw new Error("the Compare button never took focus in 40 tab stops");
}

test("a refused Compare press says why", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await selectLayer(page, "Terrain (shaded relief)");
  await watchAnnouncements(page);

  await tabToCompare(page);
  await page.keyboard.press("Enter");

  // Assert the premise: this really is the refusal path, and it really does
  // leave nothing for assistive tech to read on its own. Without these the
  // announcement below could be coming from a press that actually worked.
  await expect(page.locator(".compare-button__label")).toHaveText(
    "No time dimension"
  );
  await expect(page.locator(".compare-button")).toHaveAttribute(
    "aria-pressed",
    "false"
  );
  await expect(page.locator("#compare-divider")).not.toHaveClass(/is-visible/);
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.classList?.contains("compare-button"))
    ),
    "focus left the button, so its label change might have been read"
  ).toBe(true);

  // Both channels carry the same words, so they cannot drift apart.
  expect(await announced(page)).toEqual(["Compare: No time dimension"]);
});

test("a Compare press that succeeds stays silent", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  await tabToCompare(page);
  await page.keyboard.press("Enter");

  // The default layer is time-varying, so this press takes: the divider opens
  // and the button reports itself pressed.
  await expect(page.locator("#compare-divider")).toHaveClass(/is-visible/);
  await expect(page.locator(".compare-button")).toHaveAttribute(
    "aria-pressed",
    "true"
  );

  // `aria-pressed` on the focused button is the announcement. Adding a second
  // one here would say the same thing twice.
  expect(await announced(page)).toEqual([]);
});
