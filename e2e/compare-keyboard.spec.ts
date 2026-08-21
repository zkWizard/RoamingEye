import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The comparison divider has to be operable by keyboard.
 *
 * It advertised `role="separator"` and named itself "drag to sweep", but
 * carried no `tabindex`, no key handler and no `aria-valuenow`: a walk of the
 * whole tab ring with compare active never reached the handle, and arrow keys
 * left the seam at exactly 50%. Enabling compare therefore worked by keyboard
 * while the gesture it exists for did not — sweeping IS the comparison, so
 * pre/post eruption and drought-year reads were pointer-only.
 *
 * These specs pin the splitter contract rather than a pixel: reachable by Tab,
 * moved by arrows, clamped at both ends, and announcing its position as the
 * two months rather than a bare number.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const HANDLE = ".compare-divider__handle";

/** Enable compare and put focus on the handle the way a keyboard user must. */
async function sweepReady(page: import("@playwright/test").Page) {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.click(".compare-button");
  await expect(page.locator("#compare-divider")).toHaveClass(/is-visible/);
  return page.locator(HANDLE);
}

/** The split the app is actually rendering, as an integer percentage. */
async function splitPercent(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const left = (document.querySelector("#compare-divider") as HTMLElement)
      .style.left;
    return Math.round(parseFloat(left));
  });
}

test("the divider handle is reachable by Tab while comparing", async ({
  page,
}) => {
  const handle = await sweepReady(page);

  // Walk the ring from the top rather than assuming a position in it: the
  // point is that SOME number of Tabs reaches the handle, not how many.
  await page.evaluate(() => document.body.focus());
  let reached = false;
  for (let i = 0; i < 40 && !reached; i++) {
    await page.keyboard.press("Tab");
    reached = await handle.evaluate((el) => el === document.activeElement);
  }
  expect(reached, "handle never received focus in a full tab ring").toBe(true);

  // Focusable is only half of a splitter — it must carry its position too.
  await expect(handle).toHaveAttribute("aria-valuenow", "50");
  await expect(handle).toHaveAttribute("aria-orientation", "vertical");
  await expect(handle).toHaveAttribute("aria-valuemin", "8");
  await expect(handle).toHaveAttribute("aria-valuemax", "92");
});

test("arrows sweep the seam and Home/End reach the clamped extremes", async ({
  page,
}) => {
  const handle = await sweepReady(page);
  await handle.focus();
  expect(await splitPercent(page)).toBe(50);

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  expect(await splitPercent(page)).toBe(52);
  await expect(handle).toHaveAttribute("aria-valuenow", "52");

  await page.keyboard.press("ArrowLeft");
  expect(await splitPercent(page)).toBe(51);

  // Shift takes the coarse step, so crossing the globe doesn't take 84 presses.
  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowLeft");
  await page.keyboard.up("Shift");
  expect(await splitPercent(page)).toBe(41);

  // Both sides stay visible at the extremes (MIN_SPLIT/MAX_SPLIT), so End must
  // stop at 92 rather than running the seam off the edge of the viewport.
  await page.keyboard.press("End");
  expect(await splitPercent(page)).toBe(92);
  await page.keyboard.press("ArrowRight");
  expect(await splitPercent(page)).toBe(92);

  await page.keyboard.press("Home");
  expect(await splitPercent(page)).toBe(8);
  await page.keyboard.press("ArrowLeft");
  expect(await splitPercent(page)).toBe(8);
});

test("the handle announces its position as the two months, not a bare number", async ({
  page,
}) => {
  const handle = await sweepReady(page);
  await handle.focus();

  // Both sides pin the same month the instant compare is enabled (main.ts pins
  // months[currentIndex]), so the two labels match here — what this asserts is
  // that the percentages are read out against MONTH LABELS and that they track
  // the seam, which is what makes each arrow press mean something aloud.
  const at50 = await handle.getAttribute("aria-valuetext");
  expect(at50).toMatch(/^50% .+, 50% .+$/);

  await page.keyboard.down("Shift");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");
  const at60 = await handle.getAttribute("aria-valuetext");
  expect(at60).toMatch(/^60% .+, 40% .+$/);
});

test("leaving compare while sweeping returns focus to the Compare button", async ({
  page,
}) => {
  const handle = await sweepReady(page);
  await handle.focus();
  // Assert the premise: without a tabindex, focus() is a no-op and focus never
  // left <body>, so clicking the button below would "pass" without the divider
  // ever having held focus at all.
  expect(await handle.evaluate((el) => el === document.activeElement)).toBe(
    true
  );

  // The divider is display:none the moment compare exits, so focus would
  // otherwise be dropped on <body> mid-task.
  await page.click(".compare-button");
  await expect(page.locator("#compare-divider")).not.toHaveClass(/is-visible/);
  const onButton = await page
    .locator(".compare-button")
    .evaluate((el) => el === document.activeElement);
  expect(onButton, "focus was dropped when compare exited").toBe(true);
});

test("Escape leaves compare mode while sweeping, and returns focus", async ({
  page,
}) => {
  const handle = await sweepReady(page);
  await handle.focus();
  // Assert the premise, as the test above does: if focus never reached the
  // handle, Escape would be landing on <body> and this would pass for the
  // wrong reason.
  expect(await handle.evaluate((el) => el === document.activeElement)).toBe(
    true
  );

  // Sweeping first, so this is Escape from a mode genuinely in use rather than
  // from the instant it was switched on.
  await page.keyboard.press("ArrowLeft");
  expect(await splitPercent(page)).toBe(49);

  await page.keyboard.press("Escape");

  // The mode is off by every channel it is published on: the divider is gone,
  // and the toggle reads unpressed for assistive tech.
  await expect(page.locator("#compare-divider")).not.toHaveClass(/is-visible/);
  await expect(page.locator(".compare-button")).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  // Escape must not drop focus on <body> any more than the toggle may.
  const onButton = await page
    .locator(".compare-button")
    .evaluate((el) => el === document.activeElement);
  expect(onButton, "focus was dropped when Escape left compare").toBe(true);
});
