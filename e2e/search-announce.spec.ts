import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { MATCHES, stubGeocoder } from "./search-fixture";

/**
 * A search always makes the user wait — a 300 ms debounce, then a network round
 * trip — and until now the only thing that reported the ending was
 * `aria-expanded`, which flips to true for all three outcomes alike: matches,
 * "No matches", and an unreachable geocoder. The status row meant to cover the
 * two empty cases was built with its text already inside it and then inserted,
 * and a live region that arrives holding its message has not changed, so it
 * announced nothing.
 *
 * What must hold is that each outcome reaches the shared announcer once, in the
 * user's own words, and that a superseded search stays silent — announcing an
 * abandoned query's result over the one the user is still typing is its own
 * defect.
 */

/** Observe the announcer, recording the text of every distinct announcement. */
async function watchAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const region = document.querySelector(".announcer");
    if (!region) throw new Error("no announcer region");
    const seen: string[] = [];
    (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__ = seen;
    new MutationObserver(() => {
      seen.push((region.textContent ?? "").trim());
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
}

const announced = (page: Page): Promise<string[]> =>
  page.evaluate(
    () => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__
  );

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("a search that finds places announces how many", async ({ page }) => {
  await stubGeocoder(page);
  await watchAnnouncements(page);

  await page.locator(".search__input").fill("Qui");
  await expect(page.locator(".search__result")).toHaveCount(MATCHES.length, {
    timeout: 15_000,
  });

  await expect
    .poll(() => announced(page), { timeout: 5_000 })
    .toContain(`${MATCHES.length} matches`);

  // The count is the whole point: "expanded" was already true for an empty
  // popup, so the announcement has to carry what "expanded" could not.
  expect(
    await page.locator(".search__input").getAttribute("aria-expanded")
  ).toBe("true");
});

test("a search that finds nothing says so out loud", async ({ page }) => {
  await page.route("**nominatim**", (route) =>
    route.fulfill({ contentType: "application/json", body: "[]" })
  );
  await watchAnnouncements(page);

  await page.locator(".search__input").fill("Zzzq");
  await expect(page.locator(".search__message")).toHaveText("No matches", {
    timeout: 15_000,
  });

  await expect
    .poll(() => announced(page), { timeout: 5_000 })
    .toContain("No matches");

  // The row itself must NOT also be a live region, or the message is spoken
  // twice — once by the announcer and once by the row.
  await expect(page.locator(".search__message")).not.toHaveAttribute(
    "aria-live",
    /.*/
  );
});

test("an unreachable geocoder says so out loud", async ({ page }) => {
  await page.route("**nominatim**", (route) => route.abort("failed"));
  await watchAnnouncements(page);

  await page.locator(".search__input").fill("Quito");
  await expect(page.locator(".search__message")).toHaveText(
    /Search unavailable/,
    { timeout: 20_000 }
  );

  await expect
    .poll(() => announced(page), { timeout: 5_000 })
    .toContain("Search unavailable — check connection");
});

test("a superseded search does not announce over the live one", async ({
  page,
}) => {
  // Hold the first query long enough that the user's next keystroke supersedes
  // it, and answer the second immediately. Only the surviving search may speak.
  // The first fulfill can land on a request the app has already aborted, which
  // is the point of the test — swallow the resulting route error.
  let call = 0;
  await page.route("**nominatim**", async (route) => {
    call += 1;
    if (call === 1) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route
        .fulfill({ contentType: "application/json", body: "[]" })
        .catch(() => {});
      return;
    }
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify(MATCHES.slice(0, 1)),
      })
      .catch(() => {});
  });
  await watchAnnouncements(page);

  const input = page.locator(".search__input");
  await input.fill("Qu");
  // Past the 300 ms debounce, so the first request is genuinely in flight.
  await page.waitForTimeout(800);
  await input.fill("Quito");

  await expect(page.locator(".search__result")).toHaveCount(1, {
    timeout: 15_000,
  });
  await expect
    .poll(() => announced(page), { timeout: 5_000 })
    .toContain("1 match");

  // Let the abandoned request finish; it must stay silent.
  await page.waitForTimeout(4_000);
  expect(await announced(page)).not.toContain("No matches");
});
