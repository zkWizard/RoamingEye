import { expect, test } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A plain-language comparison geocodes the place, switches layer, pins the
 * earlier month, and leaves the later month on the live side. Nominatim is
 * stubbed so the spec does not spend the shared geocoder.
 */
function stubPlace(
  name: string,
  lat: string,
  lon: string,
  box: [string, string, string, string]
) {
  return {
    name,
    display_name: name,
    lat,
    lon,
    type: "administrative",
    category: "boundary",
    boundingbox: box,
  };
}

test("Amazon 2005 vs 2020 pins August 2005 on vegetation", async ({ page }) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        stubPlace("Amazon", "-3.4", "-62.0", ["-20", "5", "-80", "-50"]),
      ]),
    })
  );
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("Amazon 2005 vs 2020");
  const row = page.locator(".search__result", {
    hasText: "Aug 2005 vs Aug 2020",
  });
  await expect(row).toBeVisible();
  await expect(row.locator(".search__result-sub")).toHaveText(
    "Vegetation (NDVI)"
  );
  await row.click();

  await expect(page.locator(".compare-divider.is-visible")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.locator(".compare-divider__chip--pinned")).toContainText(
    "2005"
  );
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=ndvi/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/pin=2005-08/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/t=2020-08/);
});

test("California fires 2020 opens aerosols with September 2020 pinned", async ({
  page,
}) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        stubPlace("California", "37.25", "-119.75", [
          "32.5",
          "42.0",
          "-124.5",
          "-114.1",
        ]),
      ]),
    })
  );
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("California fires 2020");
  const row = page.locator(".search__result", { hasText: "Sep 2020" });
  await expect(row).toBeVisible();
  await expect(row.locator(".search__result-sub")).toHaveText("Aerosols (AOD)");
  await row.click();

  await expect(page.locator(".compare-divider.is-visible")).toBeVisible({
    timeout: 15_000,
  });
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=aerosol/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/pin=2020-09/);
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/t=20\d\d-09/);
});

test("Houston vs Austin rainfall 2026 offers a comparison while typing", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route("**nominatim**", (route) => {
    const url = decodeURIComponent(route.request().url());
    const austin = url.toLowerCase().includes("austin");
    const name = austin ? "Austin" : "Houston";
    const box: [string, string, string, string] = austin
      ? ["30.10", "30.52", "-97.94", "-97.57"]
      : ["29.52", "30.11", "-95.82", "-95.01"];
    const lat = austin ? "30.27" : "29.76";
    const lon = austin ? "-97.74" : "-95.37";
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([stubPlace(name, lat, lon, box)]),
    });
  });
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("Houston vs Austin rainfall 2026");
  const row = page.locator(".search__result", { hasText: "Houston vs Austin" });
  await expect(row).toBeVisible();
  await expect(row.locator(".search__result-sub")).toContainText(
    "Precipitation"
  );
  await expect(row.locator(".search__result-sub")).toContainText(
    "isn't published yet"
  );
  await expect(
    page.locator(".search__result--world", { hasText: "Search all places" })
  ).toBeVisible();
  await row.click();

  const panel = page.locator(".place-compare.is-open");
  await expect(panel).toBeVisible();
  await expect(panel.locator("figcaption").nth(0)).toHaveText("Houston");
  await expect(panel.locator("figcaption").nth(1)).toHaveText("Austin");
  await expect(panel.locator(".place-compare__note")).toContainText(
    "isn't published yet"
  );
  await expect(panel.locator(".place-compare__note")).toContainText(
    "latest available month"
  );
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=precip/);
  await expect(
    panel.locator(".place-compare__maps img").nth(0)
  ).toHaveAttribute("src", /^https:\/\/gibs\.earthdata\.nasa\.gov\//);
  await expect(panel.locator(".place-compare__readout")).not.toHaveText(
    /Reading/,
    { timeout: 30_000 }
  );
});
