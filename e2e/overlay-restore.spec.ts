import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A returning visitor's overlays come back from the stored session, and that
 * restore can fail exactly like a press can — the earthquakes feed is a live
 * fetch to USGS. The press path has always handled it: the button snaps back
 * off and the legend key it set optimistically is dropped. The restore path
 * discarded the same result, so a failed restore left the toolbar reporting an
 * overlay that is not on the globe, and the legend describing its markers —
 * for seismicity, a two-channel key naming depth bands and magnitude sizes for
 * nothing at all.
 *
 * The pair is what matters. Un-pressing on failure is only correct if a
 * restore that succeeds still comes back pressed, so both halves are asserted
 * against the same stored session.
 */

const USGS = "**earthquake.usgs.gov**";

/** A stored session with the live-fetch overlay on, plus the two defaults. */
const seedSession = async (page: import("@playwright/test").Page) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "roamingeye:session",
      JSON.stringify({ overlays: ["hd", "atmosphere", "quakes"] })
    );
  });
};

/** One valid M6.2 event, enough for the overlay to draw and keep its key. */
const ONE_QUAKE = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      id: "test1",
      geometry: { type: "Point", coordinates: [-70.7, -30.2, 55.3] },
      properties: {
        mag: 6.2,
        magType: "mww",
        time: 1750000000000,
        place: "offshore Coquimbo, Chile",
        status: "reviewed",
      },
    },
  ],
};

test("a restored overlay whose feed fails does not claim to be drawn", async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.route(USGS, (route) => route.abort());
  await seedSession(page);

  await page.goto("/");
  await awaitAppInteractive(page);

  const quakes = page.getByRole("button", { name: "Quakes" });
  // `fetchJson` retries twice after the first attempt, so the failure is only
  // final once the last one has been refused — wait for the state, not a
  // fixed delay.
  await expect(quakes).toHaveAttribute("aria-pressed", "false");

  // The key set optimistically beside the restore goes with it. Asserting on
  // the depth-band text rather than the container: `.legend__keys` also holds
  // the other restored overlays' rows, so an empty-container check would pass
  // for the wrong reason.
  await expect(page.locator(".legend__keys")).not.toContainText("Quake depth");

  // The stored session is deliberately untouched — an unreachable feed is not
  // a decision to turn the overlay off, and the next boot should try again.
  const stored = await page.evaluate(() =>
    JSON.parse(window.localStorage.getItem("roamingeye:session") ?? "{}")
  );
  expect(stored.overlays).toContain("quakes");

  // Which makes the button an honest retry rather than a dead control.
  await page.unroute(USGS);
  await page.route(USGS, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ONE_QUAKE),
    })
  );
  await quakes.click();
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".legend__keys")).toContainText("Quake depth");
});

test("a restored overlay whose feed answers stays on", async ({ page }) => {
  test.setTimeout(60_000);
  await page.route(USGS, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(ONE_QUAKE),
    })
  );
  await seedSession(page);

  await page.goto("/");
  await awaitAppInteractive(page);

  const quakes = page.getByRole("button", { name: "Quakes" });
  await expect(quakes).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".legend__keys")).toContainText("Quake depth");
});
