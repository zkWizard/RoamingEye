import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { MATCHES, openResults, stubGeocoder } from "./search-fixture";

/**
 * The place search must be operable without a mouse.
 *
 * The popup's `<li>`s are not focusable, so Tab walks straight past them to the
 * next chrome button. Before the combobox wiring that meant a keyboard-only
 * user could type a query, watch matches appear, and have no way at all to
 * choose one — the sole selection path was a click listener. These specs pin
 * the keyboard path so it cannot quietly rot back to mouse-only.
 */

const activeDescendant = (page: Page) =>
  page.locator(".search__input").getAttribute("aria-activedescendant");

test.beforeEach(async ({ page }) => {
  await stubGeocoder(page);
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("the search field is a combobox that reports its popup state", async ({
  page,
}) => {
  const input = page.locator(".search__input");
  await expect(input).toHaveAttribute("role", "combobox");
  await expect(input).toHaveAttribute("aria-autocomplete", "list");
  // Collapsed at rest, and pointing at a popup that actually exists.
  await expect(input).toHaveAttribute("aria-expanded", "false");
  const controls = await input.getAttribute("aria-controls");
  expect(controls).toBeTruthy();
  await expect(page.locator(`#${controls}`)).toHaveAttribute("role", "listbox");

  await openResults(page);
  await expect(input).toHaveAttribute("aria-expanded", "true");
  // Group labels are not options: pointer hit-testing walks `.search__result`.
  await expect(page.locator(".search__group")).toHaveText("Cities");
  await expect(page.locator(".search__result--world")).toContainText(
    "Search all places"
  );
});

test("arrow keys move a highlight the input points at", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");
  const options = page.locator(".search__result");

  // Nothing is highlighted until the user asks for one.
  expect(await activeDescendant(page)).toBeNull();

  await input.press("ArrowDown");
  await expect(options.nth(0)).toHaveClass(/is-active/);
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "true");
  expect(await activeDescendant(page)).toBe(
    await options.nth(0).getAttribute("id")
  );

  await input.press("ArrowDown");
  await expect(options.nth(1)).toHaveClass(/is-active/);
  // Exactly one row may claim to be the chosen one.
  await expect(page.locator(".search__result.is-active")).toHaveCount(1);
  await expect(options.nth(0)).toHaveAttribute("aria-selected", "false");

  // Wrapping, as the layer listbox does. The last row is "Search all places".
  const count = await options.count();
  await input.press("End");
  await expect(options.nth(count - 1)).toHaveClass(/is-active/);
  await input.press("ArrowDown");
  await expect(options.nth(0)).toHaveClass(/is-active/);

  // ArrowUp from no highlight lands on the last match, not the second-to-last.
  await input.press("Escape");
  await openResults(page);
  await input.press("ArrowUp");
  await expect(options.nth(count - 1)).toHaveClass(/is-active/);

  // Focus never leaves the input — that is what keeps typing available.
  await expect(input).toBeFocused();
});

test("Enter takes the highlighted match without a mouse", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");

  await input.press("ArrowDown");
  await input.press("Enter");

  // The city row was chosen and the popup closed. The camera is the local
  // city, not the geocoder's point.
  await expect(input).toHaveValue("Quito");
  await expect(page.locator(".search__results")).not.toHaveClass(/is-open/);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  expect(await activeDescendant(page)).toBeNull();

  // A city frame sits close enough that the hash keeps four decimal places.
  // Those digits are the shipped Quito (−0.213, −78.502), not the geocoder's
  // point a few kilometres away.
  await expect
    .poll(() => page.evaluate(() => location.hash), { timeout: 20_000 })
    .toContain("lat=-0.2130&lon=-78.5020");
});

test("Enter with nothing highlighted takes the top match", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");

  await input.press("Enter");

  await expect(input).toHaveValue("Quito");
  await expect(page.locator(".search__results")).not.toHaveClass(/is-open/);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  await expect
    .poll(() => page.evaluate(() => location.hash), { timeout: 20_000 })
    .toContain("lat=-0.2130&lon=-78.5020");
});

test("picking a place jumps to the newest published month", async ({
  page,
}) => {
  const readout = page.locator(".timeline__readout");
  const prev = page.locator('.timeline__step[aria-label^="Previous"]');
  const next = page.locator('.timeline__step[aria-label^="Next"]');
  // Skip can land after the first-visit tour has stepped backward, and the
  // freshness probe can extend the record a moment later. The forward step
  // is off only when the scrubber is sitting on the newest published month.
  await expect(next).toBeDisabled({ timeout: 20_000 });
  await prev.click();
  await expect(next).toBeEnabled();
  const older = (await readout.textContent()) ?? "";

  await openResults(page);
  await page.locator(".search__input").press("Enter");

  await expect(next).toBeDisabled({ timeout: 20_000 });
  await expect(readout).not.toHaveText(older);
});

test("Escape closes the popup and reports it collapsed", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");

  await input.press("ArrowDown");
  await input.press("Escape");

  await expect(input).toHaveValue("");
  await expect(page.locator(".search__results")).not.toHaveClass(/is-open/);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  expect(await activeDescendant(page)).toBeNull();
});

test("typing a known city does not call the world geocoder", async ({
  page,
}) => {
  let calls = 0;
  page.on("request", (request) => {
    if (request.url().includes("nominatim")) calls += 1;
  });
  await openResults(page);
  await page.waitForTimeout(400);
  expect(calls).toBe(0);
});

test("Enter on Search all places asks the world geocoder", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");
  await input.press("End");
  await input.press("Enter");
  await expect(page.locator(".search__result")).toHaveCount(MATCHES.length, {
    timeout: 15_000,
  });
  await expect(page.locator(".search__result-name").first()).toHaveText(
    "Quito"
  );
});

test("a date, a layer, and a story resolve without the geocoder", async ({
  page,
}) => {
  const input = page.locator(".search__input");

  await input.fill("Aug 2023");
  // The Dates group must replace empty-field suggestions, not sit among them.
  await expect(
    page.locator(".search__group", { hasText: "Dates" })
  ).toBeVisible({
    timeout: 15_000,
  });
  await expect(
    page.locator(".search__group", { hasText: "Stories" })
  ).toHaveCount(0);
  await expect(
    page.locator(".search__result-name", { hasText: "August 2023" })
  ).toBeVisible();
  await input.press("Enter");
  await expect(page.locator(".timeline__readout")).toHaveText("Aug 2023");

  await input.fill("Snow cover");
  await expect(
    page.locator(".search__result-name", { hasText: "Snow & ice" })
  ).toBeVisible();
  await input.press("Enter");
  await expect(page.locator(".layer-selector__current")).toHaveText(
    "Snow & ice"
  );

  await input.fill("Sahel");
  // The story title and the Sahel change place both contain this word.
  await expect(
    page.locator(".search__result-name", {
      hasText: "The monsoon greens the Sahel",
    })
  ).toBeVisible();
  await input.press("Enter");
  await expect(page.locator(".stories__title")).toContainText("Sahel");
});

test("/ and Ctrl+K focus the search field", async ({ page }) => {
  const input = page.locator(".search__input");
  await expect(input).toBeVisible();
  await page.locator("#globe").focus();
  await page.keyboard.press("/");
  await expect(input).toBeFocused();

  await page.locator("#globe").focus();
  await page.keyboard.press("Control+k");
  await expect(input).toBeFocused();
});

test("an empty field suggests stories and unchecked change places", async ({
  page,
}) => {
  const input = page.locator(".search__input");
  await expect(input).toBeVisible();
  await page.locator("#globe").focus();
  await page.keyboard.press("/");
  await expect(
    page.locator(".search__group", { hasText: "Stories" })
  ).toBeVisible({ timeout: 15_000 });
  await expect(
    page.locator(".search__group", { hasText: "Changes" })
  ).toBeVisible();
  const sahel = page.locator(".search__result", { hasText: "Sahel" }).last();
  await expect(sahel).toBeVisible();
  // The offline file did not measure a trend, so the row must not invent one.
  await expect(sahel).not.toContainText("%");

  await input.fill("Quito");
  await expect(page.locator(".search__result-name").first()).toHaveText(
    "Quito"
  );
  await input.press("Enter");
  await input.fill("");
  await expect(
    page.locator(".search__group", { hasText: "Recent" })
  ).toBeVisible();
  await expect(page.locator(".search__result-name").first()).toHaveText(
    "Quito"
  );
});
