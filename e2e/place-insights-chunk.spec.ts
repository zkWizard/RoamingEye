import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The place-insights subsystem loads as its own chunk on the first search that
 * resolves an area. These specs drive the chunk request into failure, which is
 * what a flaky connection does, and pin what the reader is told and whether the
 * feature ever comes back.
 */

const CHUNK = "**/assets/*laceInsights*";

/**
 * One match with a real polygon: `runPlaceInsights` needs area geometry, so the
 * shared search fixture's bounding-box-only entries close the panel instead of
 * opening it and would hide the very difference these specs measure.
 */
const AREA_MATCH = [
  {
    name: "Quito",
    display_name: "Quito, Pichincha, Ecuador",
    lat: "-0.2295",
    lon: "-78.5243",
    type: "city",
    category: "place",
    boundingbox: ["-0.4", "-0.1", "-78.6", "-78.4"],
    geojson: {
      type: "Polygon",
      coordinates: [
        [
          [-78.6, -0.4],
          [-78.4, -0.4],
          [-78.4, -0.1],
          [-78.6, -0.1],
          [-78.6, -0.4],
        ],
      ],
    },
  },
];

async function stubAreaGeocoder(page: Page): Promise<void> {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(AREA_MATCH),
    })
  );
}

async function searchQuito(page: Page): Promise<void> {
  await page.locator(".search__input").fill("Quito");
  await expect(page.locator(".search__result")).toHaveCount(1, {
    timeout: 15_000,
  });
  await page.locator(".search__result").first().click();
}

test.use({ viewport: { width: 1280, height: 900 } });

test("a failed place-insights load is worded, and a reload recovers it", async ({
  page,
}) => {
  await stubAreaGeocoder(page);
  let blocked = 0;
  await page.route(CHUNK, (route) => {
    blocked++;
    return route.abort();
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await searchQuito(page);

  // Premise: the chunk really was requested and really did fail.
  await expect.poll(() => blocked, { timeout: 15_000 }).toBeGreaterThan(0);

  const toast = page.locator(".error-toast");
  await expect(toast).toContainText(
    "Couldn't load place details. Reload the page to try again.",
    { timeout: 15_000 }
  );
  // The reader is not handed a hashed bundle URL.
  await expect(toast).not.toContainText("assets/");
  await expect(page.locator("#place-insights")).toBeHidden();

  // Searching again is NOT the remedy, and the copy must not imply it is: a
  // rejected dynamic import stays rejected in the browser's module map, so the
  // second search re-requests nothing and repeats the same worded failure.
  await page.locator(".error-toast__close").click();
  await page.locator(".search__input").fill("");
  const before = blocked;
  await searchQuito(page);
  await expect(toast).toContainText("Reload the page to try again.", {
    timeout: 15_000,
  });
  expect(blocked).toBe(before);
  await expect(page.locator("#place-insights")).toBeHidden();

  // The remedy the message names does work.
  await page.unroute(CHUNK);
  await page.reload();
  await awaitAppInteractive(page);
  await searchQuito(page);
  await expect(page.locator("#place-insights")).toBeVisible({
    timeout: 20_000,
  });
});

test("a place search that loads its chunk shows no error toast", async ({
  page,
}) => {
  await stubAreaGeocoder(page);
  await page.goto("/");
  await awaitAppInteractive(page);
  await searchQuito(page);

  await expect(page.locator("#place-insights")).toBeVisible({
    timeout: 20_000,
  });
  // The panel opening is the report; a toast on the success path would be noise.
  await expect(page.locator(".error-toast")).toHaveText("");
});
