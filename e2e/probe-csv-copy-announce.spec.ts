import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The probe's "Copy CSV" is the app's third copy control, and it was the only
 * one that reported nothing an assistive technology could observe.
 *
 * `.share-button` and the imagery-URL button were given a voice for a reason
 * that applies here unchanged (see e2e/copy-announce.spec.ts): a copy flips no
 * state, so there is no `aria-pressed` or value to ride on, and the clipboard
 * writes silently. Their label swap leaves the accessibility tree untouched
 * because an `aria-label` pins their name. This button carries no `aria-label`,
 * so its label swap does move the name — but the swap happens on the button
 * ALREADY HOLDING FOCUS, and a name change under focus is not reliably spoken.
 * Measured on main at 1280x900, keyboard only: the live region stayed empty
 * through both a copy that succeeded and one the browser refused.
 *
 * The refusal is the half that cost something. The other two copies answer a
 * blocked clipboard with a `window.prompt`, which takes focus and reads itself,
 * so they stay deliberately silent. This one opens nothing — it flashes "Copy
 * failed" and stops. A reader who hears nothing cannot tell that outcome from
 * the successful one, and would paste whatever the clipboard held before.
 *
 * Both paths are asserted against ONE finished probe: reaching an enabled CSV
 * costs ~30s of sampling, and a second probe would buy nothing but a second
 * wait. Viewport is taller than the 1280x720 default for the reason
 * probe-keyboard.spec.ts is: at 720 the bottom HUD covers the middle of the
 * window, which is the aim Enter charts.
 */

test.use({
  viewport: { width: 1280, height: 900 },
  permissions: ["clipboard-read", "clipboard-write"],
});
test.setTimeout(120_000);

test("both outcomes of the probe CSV copy are spoken", async ({ page }) => {
  // NDVI rather than the boot default: the CSV enables only once a numeric
  // series has settled, and a categorical layer never enables it at all
  // (land cover counts classes, so there is nothing to chart or export).
  await page.goto("/#layer=ndvi");
  await awaitAppInteractive(page);

  await page.locator("#globe").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".probe.is-open")).toHaveCount(1);

  // Positional, NOT filtered by text. A `hasText` filter goes blind for the
  // 1.6s the confirmation is showing — the very window this test measures —
  // and then matches again once the label reverts, so it reads a copy that
  // worked as one that never happened. The footer appends download then copy;
  // the assertions just below pin that order, so a reorder fails loudly here
  // rather than silently testing the wrong button.
  const download = page.locator(".probe__footer button").nth(0);
  const copy = page.locator(".probe__footer button").nth(1);
  await expect(copy).toBeEnabled({ timeout: 90_000 });
  await expect(download).toHaveText("Download CSV");
  await expect(copy).toHaveText("Copy CSV");

  // Record every distinct announcement, the way copy-announce.spec.ts does.
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
  const announced = () =>
    page.evaluate(
      () => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__
    );

  // --- The copy that works -------------------------------------------------
  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(copy).toHaveText("Copied ✓");

  // The premise: the copy really happened, and focus really did stay on the
  // button whose name changed. Without both, the announcement below could be
  // reporting a copy that never landed, or one whose name change a reader
  // would have heard anyway on arriving at the button.
  expect(
    await page.evaluate(() => navigator.clipboard.readText()),
    "the clipboard did not receive the probe CSV"
  ).toContain("RoamingEye");
  expect(
    await page.evaluate(() =>
      Boolean(document.activeElement?.classList?.contains("probe__download"))
    ),
    "focus left the button, so its label change might have been read"
  ).toBe(true);

  expect(await announced()).toEqual(["Probe CSV copied"]);

  // The flash reverts after 1.6s; wait it out so the refusal below is read off
  // a button in its resting state rather than mid-flash.
  await expect(copy).toHaveText("Copy CSV");

  // --- The copy the browser refuses ---------------------------------------
  await page.evaluate(() => {
    Object.defineProperty(navigator.clipboard, "writeText", {
      configurable: true,
      value: () => Promise.reject(new Error("blocked")),
    });
  });

  await copy.focus();
  await page.keyboard.press("Enter");
  await expect(copy).toHaveText("Copy failed");

  // The spoken failure names the way out, and this is what makes that advice
  // true: the neighbouring download is enabled from the same moment and hands
  // over the identical bytes, which is why this copy needs no prompt fallback.
  await expect(download).toBeEnabled();

  expect(await announced()).toEqual([
    "Probe CSV copied",
    "Copy failed. Use Download CSV instead.",
  ]);
});
