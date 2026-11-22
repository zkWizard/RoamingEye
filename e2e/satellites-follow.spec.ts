import { expect, test } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

declare global {
  interface Window {
    __SATELLITE_POINTS__?: Record<string, number>;
  }
}

const ISS = {
  OBJECT_NAME: "ISS (ZARYA)",
  OBJECT_ID: "1998-067A",
  EPOCH: "2026-11-21T18:49:58.655424",
  MEAN_MOTION: 15.4953829,
  ECCENTRICITY: 0.0007379,
  INCLINATION: 51.6319,
  RA_OF_ASC_NODE: 240.1895,
  ARG_OF_PERICENTER: 51.3703,
  MEAN_ANOMALY: 15,
  EPHEMERIS_TYPE: 0,
  CLASSIFICATION_TYPE: "U",
  NORAD_CAT_ID: 25544,
  ELEMENT_SET_NO: 999,
  REV_AT_EPOCH: 59618,
  BSTAR: 0.00018759,
  MEAN_MOTION_DOT: 0.00010099,
  MEAN_MOTION_DDOT: 0,
};

test.beforeEach(async ({ page }) => {
  await page.route("https://celestrak.org/**", async (route) => {
    const group = new URL(route.request().url()).searchParams.get("GROUP");
    const body =
      group === "stations"
        ? [ISS]
        : [{ ...ISS, NORAD_CAT_ID: 99999, OBJECT_NAME: "OTHER" }];
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });
});

test("searching ISS follows the station", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/");
  await awaitAppInteractive(page);
  const input = page.locator(".search__input");
  await input.waitFor();
  await input.fill("where is the ISS");
  const row = page.getByRole("option", {
    name: "ISS Follow the space station",
  });
  await expect(row).toBeVisible();
  await row.click();
  await expect(page.locator(".entity-card")).toBeVisible();
  await expect(page.locator(".entity-card__title")).toHaveText("ISS (ZARYA)");
  await expect(page.locator(".entity-card")).toHaveAttribute(
    "data-following",
    "true"
  );
  await expect(page.locator(".entity-card")).toContainText("25544");
  await expect
    .poll(() => page.evaluate(() => location.hash))
    .toContain("track=25544");
  expect(errors).toEqual([]);
});

test("a track deep link restores follow", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  await page.goto("/#track=25544");
  await awaitAppInteractive(page);
  await expect(page.locator(".entity-card__title")).toHaveText("ISS (ZARYA)", {
    timeout: 20_000,
  });
  await expect(page.locator(".entity-card")).toHaveAttribute(
    "data-following",
    "true"
  );
  await expect(
    page.locator('.toolbar__item[data-overlay="sat-stations"]')
  ).toHaveAttribute("aria-pressed", "true");
  expect(errors).toEqual([]);
});
