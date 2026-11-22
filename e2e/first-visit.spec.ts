import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The first 30 seconds: a short story plays on its own, three plain searches
 * are one tap away, and the time slider says what it does until it is used.
 * A shared link and a reduced-motion preference skip the autoplay.
 */

declare global {
  interface Window {
    __reLog?: string[];
    __reAnalytics?: (event: string) => void;
  }
}

function watchEvents(page: Page): Promise<unknown> {
  return page.addInitScript(() => {
    window.__reLog = [];
    window.__reAnalytics = (event) => {
      window.__reLog?.push(event);
    };
  });
}

async function events(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__reLog ?? []);
}

function centreCovered(
  cover: { x: number; y: number; width: number; height: number },
  target: { x: number; y: number; width: number; height: number }
): boolean {
  const cx = target.x + target.width / 2;
  const cy = target.y + target.height / 2;
  return (
    cover.x <= cx &&
    cx <= cover.x + cover.width &&
    cover.y <= cy &&
    cy <= cover.y + cover.height
  );
}

test("a first visit autoplays, and Stop keeps the slider hint until a scrub", async ({
  page,
}) => {
  await watchEvents(page);
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });

  const intro = page.locator("#intro");
  await expect(intro).toBeVisible();
  await expect(intro.locator(".intro__caption")).toContainText(/green/i);
  await expect(page.locator("#intro-skip")).toHaveText("Stop");
  await expect(page.locator("#time-hint")).toHaveText(
    "Drag to travel through time"
  );
  await expect(page.locator(".stories__card")).toBeHidden();

  const introBox = await intro.boundingBox();
  const globe = await page.locator("#globe").boundingBox();
  expect(centreCovered(introBox!, globe!)).toBe(false);

  await expect(page.locator(".timeline__play")).toHaveClass(/is-playing/, {
    timeout: 15_000,
  });
  await expect.poll(() => events(page)).toContain("story_autoplay_start");

  await page.locator("#intro-skip").click();
  await expect(intro).toBeHidden();
  await expect(page.locator(".timeline__play")).not.toHaveClass(/is-playing/);
  await expect.poll(() => events(page)).toContain("story_autoplay_skip");
  await expect(page.locator("#time-hint")).toBeVisible();

  await page.getByRole("button", { name: /Previous month/ }).click();
  await expect(page.locator("#time-hint")).toBeHidden();

  await page.reload();
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(intro).toBeHidden();
});

test("an example search opens Houston and Austin rainfall", async ({
  page,
}) => {
  await watchEvents(page);
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await page
    .locator(".intro__example", { hasText: "Houston vs Austin rainfall" })
    .click();
  await expect(page.locator("#intro")).toBeHidden();
  await expect(page.locator(".place-compare__title")).toContainText("Houston", {
    timeout: 30_000,
  });
  await expect(page.locator(".place-compare__title")).toContainText("Austin");
  await expect(page.locator(".layer-selector__current")).toHaveText("Rain");
  await expect
    .poll(() => events(page))
    .toEqual(expect.arrayContaining(["example_search_tap", "first_search"]));
});

test("Watch the Arctic ice plays that story", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await page
    .locator(".intro__example", { hasText: "Watch the Arctic ice" })
    .click();
  await expect(page.locator(".stories__title")).toHaveText(
    "Ice returns to the Arctic",
    { timeout: 15_000 }
  );
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Snow & ice"
  );
  await expect(page.locator(".timeline__play")).toHaveClass(/is-playing/, {
    timeout: 15_000,
  });
});

test("a shared link and a query string skip the welcome", async ({ page }) => {
  await page.goto("/#layer=snow&t=2024-01&lat=70&lon=-40&alt=1.6");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(page.locator("#intro")).toBeHidden();
  await expect(page.locator("#time-hint")).toBeHidden();
  await expect(page.locator(".timeline__play")).not.toHaveClass(/is-playing/);

  await page.goto("/?ref=friend");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(page.locator("#intro")).toBeHidden();
});

test("reduced motion shows a still invitation", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await watchEvents(page);
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(page.locator("#intro")).toBeVisible();
  await expect(page.locator(".intro__caption")).toContainText(
    "Try one of these"
  );
  await expect(page.locator("#intro-skip")).toHaveText("Close");
  await page.waitForTimeout(2500);
  await expect(page.locator(".timeline__play")).not.toHaveClass(/is-playing/);
  expect(await events(page)).not.toContain("story_autoplay_start");
});

test("a phone welcome keeps 44px targets off the middle of the globe", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await awaitAppInteractive(page, 30_000, { keepIntro: true });
  await expect(page.locator("#intro")).toBeVisible();

  for (const name of [
    "Stop",
    "Houston vs Austin rainfall",
    "Watch the Arctic ice",
    "Then vs now: a fast-growing city",
  ]) {
    const box = await page
      .getByRole("button", { name, exact: true })
      .boundingBox();
    expect(box!.width, name).toBeGreaterThanOrEqual(44);
    expect(box!.height, name).toBeGreaterThanOrEqual(44);
  }

  const introBox = await page.locator("#intro").boundingBox();
  const actions = await page.locator("#actions").boundingBox();
  const dock = await page.locator("#controls").boundingBox();
  // A clear band of the planet stays open between the top controls and the
  // card, and the card stays above the time slider.
  expect(introBox!.y).toBeGreaterThan(actions!.y + actions!.height + 120);
  expect(introBox!.y + introBox!.height).toBeLessThan(dock!.y);
});
