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
  await page.route("**/archive-api.open-meteo.com/**", (route) => {
    const url = route.request().url();
    const austin = url.includes("latitude=30.27");
    const days = Array.from(
      { length: 30 },
      (_, index) => `2026-09-${String(index + 1).padStart(2, "0")}`
    );
    const rain = austin ? 0.4 : 6;
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        daily: {
          time: days,
          precipitation_sum: days.map(() => rain),
          temperature_2m_mean: days.map(() => (austin ? 30.8 : 27.5)),
        },
      }),
    });
  });
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator(".search__input").fill("Houston vs Austin rainfall 2026");
  const row = page.locator(".search__result", { hasText: "Houston vs Austin" });
  await expect(row).toBeVisible();
  await expect(row.locator(".search__result-sub")).toContainText("Rain");
  await expect(row.locator(".search__result-sub")).toContainText("Sep 2026");
  await expect(
    page.locator(".search__result--world", { hasText: "Search all places" })
  ).toBeVisible();
  await row.click();

  const panel = page.locator(".place-compare.is-open");
  await expect(panel).toBeVisible();
  await expect(panel.locator(".place-compare__name").nth(0)).toContainText(
    "Houston"
  );
  await expect(panel.locator(".place-compare__name").nth(1)).toContainText(
    "Austin"
  );
  await expect(panel.locator(".place-compare__primary").nth(0)).toContainText(
    "180 mm"
  );
  await expect(panel.locator(".place-compare__primary").nth(1)).toContainText(
    "12 mm"
  );
  await expect(panel.locator(".place-compare__sentence")).toContainText(
    "more rain than Austin"
  );
  await expect(panel.locator(".place-compare__sentence")).not.toContainText(
    "0.0"
  );
  await expect(panel.locator(".place-compare__source")).toContainText(
    "Open-Meteo"
  );
  await expect(page.locator(".compare-pin--a")).toHaveText("Houston");
  await expect
    .poll(async () => page.evaluate(() => location.hash), { timeout: 15_000 })
    .toMatch(/layer=precip/);
  await panel.locator(".place-compare__collapse").click();
  await expect(panel).toHaveClass(/is-collapsed/);
  await expect(panel.locator(".place-compare__sentence")).toBeHidden();
});
