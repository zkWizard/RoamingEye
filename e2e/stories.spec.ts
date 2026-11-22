import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive, showWelcome } from "./boot";

/**
 * Stories: curated time-lapses (src/lib/stories.ts) that show a new visitor
 * what RoamingEye is for without first teaching them the controls.
 *
 * Held here: a first visit is offered a short welcome, not a card over the
 * globe; a story switches the layer, turns on the overlays it needs, and
 * plays its months; its link replays it; Next and Close work; closing undoes
 * the overlays it switched on; and a layer the reader picks ends story mode.
 */

const card = (page: Page) => page.locator(".stories__card");
const intro = (page: Page) => page.locator("#intro");
const borders = (page: Page) =>
  page.locator('.toolbar__item[data-overlay="borders"]');

test("a first visit plays a short introduction once", async ({ page }) => {
  // The suite boots as a returning visitor. This spec is the welcome.
  await showWelcome(page);
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(intro(page)).toBeVisible();
  await expect(card(page)).toBeHidden();
  await expect(intro(page).locator(".intro__caption")).toContainText(/green/i);
  await expect(page.locator(".timeline__play")).toHaveClass(/is-playing/, {
    timeout: 15_000,
  });

  await page.locator("#intro-skip").click();
  await expect(intro(page)).toBeHidden();

  // Skipped once, it does not come back.
  await page.reload();
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(intro(page)).toBeHidden();
});

test("a story plays its months on its layer, and closing undoes it", async ({
  page,
}) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await expect(borders(page)).toHaveAttribute("aria-pressed", "false");

  await page.locator("#more-button").click();
  await page.locator("#stories-link").click();
  await expect(card(page).locator(".stories__title")).toHaveText(
    "Canada's smoke summer"
  );
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Smoke & dust in the air"
  );
  // The aerosol field hides the coastlines, so the story draws borders.
  await expect(borders(page)).toHaveAttribute("aria-pressed", "true");
  // It plays from April 2023 onward, and the link names the story.
  await expect(page.locator(".timeline__play")).toHaveClass(/is-playing/, {
    timeout: 10_000,
  });
  await expect(page.locator(".timeline__readout")).toHaveText(/2023/);
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain("story=canada-smoke-2023");

  // Next moves on to the following story.
  await card(page).locator(".stories__button--primary").click();
  await expect(card(page).locator(".stories__title")).toHaveText(
    "The Amazon's burning season"
  );

  // Close ends story mode and switches off what the story switched on.
  await card(page).locator(".stories__close").click();
  await expect(card(page)).toBeHidden();
  await expect(borders(page)).toHaveAttribute("aria-pressed", "false");
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .not.toContain("story=");
});

test("a story link plays its story", async ({ page }) => {
  await page.goto("/#story=saharan-dust-2020");
  await awaitAppInteractive(page);
  await expect(card(page).locator(".stories__title")).toHaveText(
    "Saharan dust crosses the Atlantic"
  );
  await expect(page.locator(".timeline__readout")).toHaveText(/2020/);
});

test("picking a layer yourself ends the story", async ({ page }) => {
  await page.goto("/#story=sahel-monsoon-2024");
  await awaitAppInteractive(page);
  await expect(card(page)).toBeVisible();

  await page.locator(".layer-selector__trigger").click();
  await page
    .locator(".layer-selector__option", { hasText: "Land temperature" })
    .click();
  await expect(card(page)).toBeHidden();
});

test("the stories are one tap away in the More menu", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#more-button").click();
  await page.locator("#stories-link").click();
  await expect(card(page)).toBeVisible();
  await expect(card(page).locator(".stories__eyebrow")).toContainText(
    "Story 1 of 7"
  );
});
