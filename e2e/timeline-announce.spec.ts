import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The timeline carries its value on the track (`role="slider"`), so a screen
 * reader reads the month back from `aria-valuetext` — but only while the track
 * itself holds focus. The prev/next steppers change that same value from the
 * outside, and after the press focus is still on the BUTTON, so the slider is
 * never read. A whole month of imagery swapped underneath and the only
 * confirmation was the readout's pixels.
 *
 * What must hold is a pair, not a single line. The stepper path speaks, and
 * the track path stays silent: announcing there too would talk over the
 * slider's own `aria-valuetext` and say every month twice.
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

/**
 * Walk the tab ring from the top of the document until the focused element is
 * the requested stepper. Keyboard only — the point is that this control is
 * reached without a pointer, roughly two dozen stops into the page.
 */
async function tabToStepper(page: Page, label: "Previous" | "Next") {
  for (let i = 0; i < 40; i++) {
    await page.keyboard.press("Tab");
    const onTarget = await page.evaluate((want) => {
      const el = document.activeElement;
      return (
        !!el &&
        el.classList.contains("timeline__step") &&
        (el.getAttribute("aria-label") ?? "").startsWith(want)
      );
    }, label);
    if (onTarget) return;
  }
  throw new Error(`${label} stepper never took focus in 40 tab stops`);
}

const readout = (page: Page) => page.locator(".timeline__readout").innerText();

test("stepping the timeline by button announces the month it produced", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  const before = await readout(page);
  await tabToStepper(page, "Previous");
  await page.keyboard.press("Enter");

  // The month really moved, and focus really is still on the button — the two
  // conditions that together leave the slider's own value unread.
  await expect(page.locator(".timeline__readout")).not.toHaveText(before);
  const after = await readout(page);
  await expect(page.locator(".timeline__track")).toHaveAttribute(
    "aria-valuetext",
    after
  );
  expect(
    await page.evaluate(() =>
      document.activeElement?.classList.contains("timeline__step")
    )
  ).toBe(true);

  // Same confirmation the readout gives, in the channel that has none.
  await expect.poll(() => announced(page)).toEqual([after]);
});

test("the track's own arrow keys stay silent", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  await page.locator(".timeline__track").focus();
  const before = await readout(page);
  await page.keyboard.press("ArrowLeft");

  await expect(page.locator(".timeline__readout")).not.toHaveText(before);
  // The focused slider reports itself; a live region here would double it.
  expect(await announced(page)).toEqual([]);
});

test("a press that cannot move the record announces nothing", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  // The app boots on the newest published entry, so the forward stepper is
  // already at the end of the record and declines the press. Its own label
  // carries the reason; there is no new month to report.
  await tabToStepper(page, "Next");
  await expect(page.locator(".timeline__step").last()).toHaveAttribute(
    "aria-disabled",
    "true"
  );
  const before = await readout(page);
  await page.keyboard.press("Enter");

  await expect(page.locator(".timeline__readout")).toHaveText(before);
  expect(await announced(page)).toEqual([]);
});
