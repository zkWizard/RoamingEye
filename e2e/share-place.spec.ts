import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A place link carries the name, the point, the box, and the Nominatim id —
 * not the polygon. Opening it must look that id up once and bring back the
 * outline's companions: the place panel and the chart. A link from before
 * place sharing has neither, and must not grow them.
 */

const PLACE =
  "34.0000,-118.0000,33.9000,34.1000,-118.2000,-117.8000,R4242,Exactville";

test("a shared place link restores the panel and the chart from one lookup", async ({
  page,
}) => {
  const lookups: string[] = [];
  await page.route("**nominatim**", (route) => {
    const url = route.request().url();
    if (!url.includes("/lookup")) return route.abort();
    lookups.push(new URL(url).searchParams.get("osm_ids") ?? "");
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify([
        {
          name: "Exactville",
          display_name: "Exactville, Example State, Example Country",
          lat: "34.0000",
          lon: "-118.0000",
          osm_type: "relation",
          osm_id: 4242,
          type: "administrative",
          category: "boundary",
          boundingbox: ["33.9", "34.1", "-118.2", "-117.8"],
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [-118.2, 33.9],
                [-117.8, 33.9],
                [-117.8, 34.1],
                [-118.2, 34.1],
                [-118.2, 33.9],
              ],
            ],
          },
        },
      ]),
    });
  });

  await page.goto(
    `/#layer=ndvi&t=2020-06&lat=34.00&lon=-118.00&alt=1.40&place=${encodeURIComponent(PLACE)}&q=Exactville`
  );
  await awaitAppInteractive(page);

  const insights = page.locator("#place-insights");
  await expect(insights).toHaveClass(/is-open/, { timeout: 20_000 });
  await expect(insights.locator(".place-insights__title")).toHaveText(
    "Exactville"
  );
  await expect(insights).toContainText("Vegetation");
  const probe = page.locator("#probe-panel");
  await expect(probe).toHaveClass(/is-open/);
  await expect(probe).toContainText("Exactville");
  await expect(probe).toContainText("searched boundary");
  expect(lookups).toEqual(["R4242"]);
});

test("a link from before place sharing leaves the place panel closed", async ({
  page,
}) => {
  await page.route("**nominatim**", (route) => route.abort());
  await page.goto("/#layer=ndvi&t=2020-06&lat=34.00&lon=-118.00&alt=1.40");
  await awaitAppInteractive(page);
  await page.waitForTimeout(800);
  await expect(page.locator("#place-insights")).not.toHaveClass(/is-open/);
  await expect(page.locator("#probe-panel")).not.toHaveClass(/is-open/);
});
