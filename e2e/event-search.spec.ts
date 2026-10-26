import { expect, test } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Picking a named event flies to it, switches to the layer that shows it,
 * and seeks the timeline to its month. Nominatim is stubbed empty so the
 * row under test is the bundled index, not a place that happens to share
 * the words.
 */
test("picking Hurricane Ian opens precipitation in 2022", async ({ page }) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" })
  );
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("Hurricane Ian");
  const row = page
    .locator(".search__result", { hasText: "Hurricane Ian" })
    .first();
  await expect(row).toBeVisible({ timeout: 15_000 });
  await expect(row.locator(".search__result-sub")).toContainText("Storm");
  await row.click();

  // The camera keeps moving after the pick, so the hash is rewritten for the
  // whole flight. The layer and the month are stable from the first write.
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=precip/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/t=2022-(09|10)/);
  await expect(page.locator(".search__input")).toHaveValue(/Hurricane Ian/);
});

test("picking a story event plays that story", async ({ page }) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" })
  );
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("Black Summer");
  // The story and the event both match. The event row is the one whose
  // subtitle names the category; picking it plays the linked story.
  const row = page
    .locator(".search__result", { hasText: "Black Summer" })
    .filter({ hasText: "Wildfire" });
  await expect(row).toBeVisible({ timeout: 15_000 });
  await row.click();

  await expect(page.locator(".stories__title")).toHaveText(
    "Australia's Black Summer",
    { timeout: 15_000 }
  );
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=aerosol/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/story=black-summer-2019/);
});
