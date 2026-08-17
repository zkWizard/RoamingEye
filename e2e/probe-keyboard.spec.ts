import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The probe panel is a dialog a keyboard can get out of.
 *
 * It carries `role="dialog"`, and the globe opens it with Enter on the aim —
 * but it honoured neither half of what that implies. Escape did nothing, so
 * the only exit was the close button 20 Tabs along the ring; and because the
 * panel is `display:none` when closed, pressing that button destroyed the
 * focused element and dropped focus on `<body>` — 9 further Tabs from the
 * globe the user had just been steering. Both exits now hand focus back to
 * whatever opened the panel.
 *
 * The viewport is taller than the 1280x720 default: at 720 the bottom HUD sits
 * over the middle of the window, and the aim Enter charts is the middle of the
 * view.
 */

test.use({ viewport: { width: 1280, height: 900 } });

/** Open the probe the way a keyboard does: focus the globe, press Enter. */
async function openProbeByKeyboard(page: Page): Promise<void> {
  await page.locator("#globe").focus();
  await page.keyboard.press("Enter");
  await expect(page.locator(".probe.is-open")).toHaveCount(1);
}

/** Tab forward until `.probe__close` holds focus; fails if the ring runs out. */
async function tabToCloseButton(page: Page): Promise<void> {
  for (let i = 0; i < 60; i++) {
    await page.keyboard.press("Tab");
    const onClose = await page.evaluate(() =>
      Boolean(document.activeElement?.classList?.contains("probe__close"))
    );
    if (onClose) return;
  }
  throw new Error("probe close button never took focus in 60 Tabs");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("Escape closes the probe and returns focus to the globe", async ({
  page,
}) => {
  await openProbeByKeyboard(page);

  // Escape must be answered from INSIDE the panel — that is the state a user
  // is trapped in. Tabbing there first also proves focus was somewhere real
  // before the assertion that it comes back.
  await tabToCloseButton(page);
  await expect(page.locator(".probe__close")).toBeFocused();

  await page.keyboard.press("Escape");

  await expect(page.locator(".probe.is-open")).toHaveCount(0);
  await expect(page.locator("#globe")).toBeFocused();
});

test("the close button returns focus to the globe", async ({ page }) => {
  await openProbeByKeyboard(page);
  await tabToCloseButton(page);

  await page.keyboard.press("Enter");

  await expect(page.locator(".probe.is-open")).toHaveCount(0);
  await expect(page.locator("#globe")).toBeFocused();
});

test("switching layer closes the probe without stealing focus", async ({
  page,
}) => {
  await openProbeByKeyboard(page);

  // The layer selector closes the probe as a side effect of its own gesture.
  // Focus belongs to the control the user actually used: pulling it back to
  // the globe here would undo their gesture, so the restore is deliberately
  // scoped to the panel dismissing itself.
  await page.locator(".layer-selector__trigger").click();
  await page.locator(".layer-selector__option").nth(1).click();

  await expect(page.locator(".probe.is-open")).toHaveCount(0);
  await expect(page.locator(".layer-selector__trigger")).toBeFocused();
});
