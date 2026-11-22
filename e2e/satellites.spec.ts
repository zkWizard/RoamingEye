import { expect, test, type Page } from "@playwright/test";
import { awaitAppInteractive, awaitLiveMenu } from "./boot";

declare global {
  interface Window {
    __SATELLITE_POINTS__?: Record<string, number>;
  }
}

/**
 * CelesTrak is stubbed. The elements are a real ISS set with the mean
 * anomaly walked around the orbit, so a few points face the camera no matter
 * what time the test runs. Starlink is drawn 1 in 4 at the default zoom, and
 * 24 records still leave a facing sample in that subset.
 */
const BASE = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-21T18:49:58.655424",
  MEAN_MOTION: 15.4953829,
  ECCENTRICITY: 0.0007379,
  INCLINATION: 51.6319,
  RA_OF_ASC_NODE: 240.1895,
  ARG_OF_PERICENTER: 51.3703,
  MEAN_ANOMALY: 308.7945,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59618,
  BSTAR: 0.00018759,
  MEAN_MOTION_DOT: 0.00010099,
  MEAN_MOTION_DDOT: 0,
};

function records(count: number): unknown[] {
  return Array.from({ length: count }, (_, index) => ({
    ...BASE,
    OBJECT_NAME: `SAT ${index}`,
    NORAD_CAT_ID: 10000 + index,
    MEAN_ANOMALY: (index * 15) % 360,
  }));
}

async function stubCelesTrak(
  page: Page,
  fetches: { count: number }
): Promise<void> {
  await page.route("https://celestrak.org/**", async (route) => {
    fetches.count += 1;
    const group = new URL(route.request().url()).searchParams.get("GROUP");
    const count = group === "starlink" ? 24 : 4;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(records(count)),
    });
  });
}

test(
  "turning on Starlink draws the constellation",
  { tag: "@smoke" },
  async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    const fetches = { count: 0 };
    await stubCelesTrak(page, fetches);
    await page.goto("/");
    await awaitAppInteractive(page);
    await awaitLiveMenu(page);

    const live = page.locator(".toolbar__fold--live");
    await expect(live).toContainText("Live");
    // Weather now is already in the fold. The six satellite classes join it.
    await expect(live.locator(".toolbar__item")).toHaveCount(7);

    const starlink = page.locator(
      '.toolbar__item[data-overlay="sat-starlink"]'
    );
    await expect(starlink).toHaveAttribute("aria-pressed", "false");
    await starlink.click();
    await expect(starlink).toHaveAttribute("aria-pressed", "true");
    await expect(starlink.locator(".toolbar__detail")).toContainText(
      "in orbit"
    );
    await expect
      .poll(() =>
        page.evaluate(() => window.__SATELLITE_POINTS__?.["sat-starlink"] ?? 0)
      )
      .toBeGreaterThan(0);
    expect(fetches.count).toBe(1);
    expect(errors).toEqual([]);
  }
);

test("a reload inside two hours does not fetch the group again", async ({
  page,
}) => {
  const fetches = { count: 0 };
  await stubCelesTrak(page, fetches);
  await page.goto("/");
  await awaitAppInteractive(page);
  await awaitLiveMenu(page);
  const starlink = page.locator('.toolbar__item[data-overlay="sat-starlink"]');
  await starlink.click();
  await expect
    .poll(() =>
      page.evaluate(() => window.__SATELLITE_POINTS__?.["sat-starlink"] ?? 0)
    )
    .toBeGreaterThan(0);
  expect(fetches.count).toBe(1);

  await page.reload();
  await awaitAppInteractive(page);
  await awaitLiveMenu(page);
  await expect(starlink).toHaveAttribute("aria-pressed", "true");
  await expect
    .poll(() =>
      page.evaluate(() => window.__SATELLITE_POINTS__?.["sat-starlink"] ?? 0)
    )
    .toBeGreaterThan(0);
  expect(fetches.count).toBe(1);
});
