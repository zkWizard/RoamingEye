import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { awaitAppInteractive } from "./boot";

const OPAQUE_BLACK_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL7ZQAAAABJRU5ErkJggg==",
  "base64"
);

test("selected-place observation export is source-aware and axe-clean", async ({
  page,
}) => {
  await page.route("https://nominatim.openstreetmap.org/search*", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          display_name: "Export test place",
          lat: "38.9",
          lon: "-77.0",
          type: "administrative",
          category: "boundary",
          geojson: {
            type: "Polygon",
            coordinates: [
              [
                [-77.1, 38.8],
                [-76.9, 38.8],
                [-76.9, 39.0],
                [-77.1, 39.0],
                [-77.1, 38.8],
              ],
            ],
          },
        },
      ]),
    })
  );
  await page.route("https://gibs.earthdata.nasa.gov/**", (route) => {
    const isColormap = route.request().url().includes("/colormaps/");
    if (isColormap) {
      const dash = String.fromCharCode(0x2013);
      return route.fulfill({
        contentType: "application/xml",
        headers: { "access-control-allow-origin": "*" },
        body: `<ColorMaps><Legend type="continuous"><LegendEntry rgb="0,0,0" tooltip="0 ${dash} 1" /></Legend></ColorMaps>`,
      });
    }
    return route.fulfill({
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
      body: OPAQUE_BLACK_PNG,
    });
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator(".search__input").fill("export test");
  await page.getByRole("option", { name: /export test place/i }).click();

  const insight = page.locator("#place-insights");
  const download = insight.getByRole("button", {
    name: "Download observations (JSON)",
  });
  await expect(download).toBeEnabled({ timeout: 15_000 });
  await expect(download).toHaveAttribute(
    "aria-describedby",
    "place-observation-export-description"
  );
  await expect(insight).toContainText(
    "No place name or search query is included."
  );
  await expect(insight.getByRole("status")).toContainText(
    "four source products retain their own months, native units, and sampled coverage"
  );

  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("#globe")
    .analyze();
  expect(
    results.violations.filter(
      (violation) =>
        violation.impact === "serious" || violation.impact === "critical"
    )
  ).toEqual([]);
});
