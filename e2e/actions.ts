import { expect, type Page } from "@playwright/test";

/**
 * Everything used less often sits one tap deep, in the actions pill's More
 * menu (src/ui/ActionMenu.ts): the two exports, Find software, the keyboard
 * shortcuts and the theme. A spec that presses one of them opens the menu
 * first, as a person would, rather than reaching past it.
 */
export async function openMoreMenu(page: Page): Promise<void> {
  const trigger = page.locator("#more-button");
  if ((await trigger.getAttribute("aria-expanded")) !== "true") {
    await trigger.click();
  }
  await expect(page.locator("#more-menu")).toBeVisible();
}

/**
 * Open the More menu and press one of its items. Every item but the exports
 * closes the menu as it runs, handing focus back to the More button.
 */
export async function chooseFromMoreMenu(
  page: Page,
  selector: string
): Promise<void> {
  await openMoreMenu(page);
  await page.locator(selector).click();
}
