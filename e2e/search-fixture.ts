import { expect, type Page } from "@playwright/test";

/**
 * A fixed match list for the place-search specs, so they never depend on
 * Nominatim's availability, rate limit, or ranking.
 */
export const MATCHES = [
  {
    name: "Quito",
    display_name: "Quito, Pichincha, Ecuador",
    lat: "-0.2295",
    lon: "-78.5243",
    type: "city",
    category: "place",
    boundingbox: ["-0.4", "-0.1", "-78.6", "-78.4"],
  },
  {
    name: "Quilmes",
    display_name: "Quilmes, Buenos Aires, Argentina",
    lat: "-34.7203",
    lon: "-58.2544",
    type: "city",
    category: "place",
    boundingbox: ["-34.8", "-34.6", "-58.3", "-58.2"],
  },
  {
    name: "Quimper",
    display_name: "Quimper, Bretagne, France",
    lat: "47.9960",
    lon: "-4.1024",
    type: "city",
    category: "place",
    boundingbox: ["47.9", "48.1", "-4.2", "-4.0"],
  },
];

/** Serve the fixed match list in place of the geocoder. */
export async function stubGeocoder(page: Page): Promise<void> {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(MATCHES),
    })
  );
}

/** Type a local query and wait for the city row plus the world-search row. */
export async function openResults(page: Page): Promise<void> {
  await page.locator(".search__input").fill("Quito");
  // Quito is in the shipped city list, so this must resolve without Nominatim.
  // One city row, then the explicit "Search all places" row.
  await expect(page.locator(".search__result")).toHaveCount(2, {
    timeout: 15_000,
  });
  await expect(page.locator(".search__result-name").first()).toHaveText(
    "Quito"
  );
}
