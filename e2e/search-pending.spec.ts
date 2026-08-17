import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { MATCHES } from "./search-fixture";

/**
 * What the search field shows while it is working.
 *
 * The wait is built in: a 300 ms debounce, a rate gate that spaces Nominatim
 * hits at least a second apart, and then the round trip. Through all of it the
 * popup used to stay shut — no row, `aria-expanded` still false — so a slow
 * network showed nothing for seconds, and an unreachable geocoder showed
 * nothing until `fetchJson` had exhausted a 12 s timeout and its one retry.
 * The "Search unavailable" row exists, but it could arrive some twenty seconds
 * after the keystroke that earned it, and until it did the control was
 * indistinguishable from a broken one — with retyping, the obvious way to
 * check, restarting the whole wait.
 *
 * These pin the in-flight state itself: that it appears, that it is marked as
 * an update rather than an answer, that every ending clears it, and that
 * dismissing the field abandons the request instead of letting it reopen the
 * popup later.
 */

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

const results = ".search__results";

test("a search in flight says it is searching, and stops when it lands", async ({
  page,
}) => {
  await page.route("**nominatim**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 2_500));
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify(MATCHES),
      })
      .catch(() => {});
  });

  await page.locator(".search__input").fill("Qui");

  // The wait itself is reported, rather than the popup staying shut through it.
  await expect(page.locator(".search__message")).toHaveText("Searching…", {
    timeout: 10_000,
  });
  await expect(page.locator(results)).toHaveAttribute("aria-busy", "true");
  expect(
    await page.locator(".search__input").getAttribute("aria-expanded")
  ).toBe("true");

  // The row is a status, not a match: nothing walking the listbox may count it.
  await expect(page.locator(".search__result")).toHaveCount(0);
  await expect(page.locator(".search__message")).toHaveAttribute(
    "role",
    "presentation"
  );

  // And the answer replaces it, clearing the busy mark with it — a listbox left
  // marked busy reads as perpetually updating.
  await expect(page.locator(".search__result")).toHaveCount(MATCHES.length, {
    timeout: 15_000,
  });
  await expect(page.locator(results)).not.toHaveAttribute("aria-busy", /.*/);
  await expect(page.locator(".search__message")).toHaveCount(0);
});

test("a geocoder that never answers still ends in a message, not a busy list", async ({
  page,
}) => {
  await page.route("**nominatim**", (route) => route.abort("failed"));

  await page.locator(".search__input").fill("Quito");

  await expect(page.locator(".search__message")).toHaveText(
    /Search unavailable/,
    { timeout: 20_000 }
  );
  await expect(page.locator(results)).not.toHaveAttribute("aria-busy", /.*/);
});

test("dismissing the field abandons the search instead of reopening later", async ({
  page,
}) => {
  await page.route("**nominatim**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 3_000));
    await route
      .fulfill({
        contentType: "application/json",
        body: JSON.stringify(MATCHES),
      })
      .catch(() => {});
  });

  const input = page.locator(".search__input");
  await input.fill("Qui");
  await expect(page.locator(".search__message")).toHaveText("Searching…", {
    timeout: 10_000,
  });

  await input.press("Escape");
  await expect(page.locator(results)).not.toHaveClass(/is-open/);
  expect(await input.inputValue()).toBe("");

  // Well past when the abandoned request lands: it must not put a popup back
  // over a field the user has already cleared.
  await page.waitForTimeout(4_000);
  await expect(page.locator(results)).not.toHaveClass(/is-open/);
  await expect(page.locator(".search__result")).toHaveCount(0);
  expect(await input.getAttribute("aria-expanded")).toBe("false");
});
