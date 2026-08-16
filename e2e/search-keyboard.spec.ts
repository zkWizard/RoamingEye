import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The place search must be operable without a mouse.
 *
 * The popup's `<li>`s are not focusable, so Tab walks straight past them to the
 * next chrome button. Before the combobox wiring that meant a keyboard-only
 * user could type a query, watch matches appear, and have no way at all to
 * choose one — the sole selection path was a click listener. These specs pin
 * the keyboard path so it cannot quietly rot back to mouse-only.
 */

const MATCHES = [
  {
    name: "Quito",
    display_name: "Quito, Pichincha, Ecuador",
    lat: "-0.2295",
    lon: "-78.5243",
    type: "city",
    category: "place",
    boundingbox: ["-0.4", "-0.1", "-78.6", "-78.4"],
  },
  {
    name: "Quilmes",
    display_name: "Quilmes, Buenos Aires, Argentina",
    lat: "-34.7203",
    lon: "-58.2544",
    type: "city",
    category: "place",
    boundingbox: ["-34.8", "-34.6", "-58.3", "-58.2"],
  },
  {
    name: "Quimper",
    display_name: "Quimper, Bretagne, France",
    lat: "47.9960",
    lon: "-4.1024",
    type: "city",
    category: "place",
    boundingbox: ["47.9", "48.1", "-4.2", "-4.0"],
  },
];

/** Serve a fixed match list, so the specs never depend on Nominatim. */
async function stubGeocoder(page: Page): Promise<void> {
  await page.route("**nominatim**", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(MATCHES),
    })
  );
}

/** Type a query and wait for the popup to be populated. */
async function openResults(page: Page): Promise<void> {
  await page.locator(".search__input").fill("Qui");
  await expect(page.locator(".search__result")).toHaveCount(MATCHES.length, {
    timeout: 15_000,
  });
}

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

  // Wrapping, as the layer listbox does.
  await input.press("End");
  await expect(options.nth(MATCHES.length - 1)).toHaveClass(/is-active/);
  await input.press("ArrowDown");
  await expect(options.nth(0)).toHaveClass(/is-active/);

  // ArrowUp from no highlight lands on the last match, not the second-to-last.
  await input.press("Escape");
  await openResults(page);
  await input.press("ArrowUp");
  await expect(options.nth(MATCHES.length - 1)).toHaveClass(/is-active/);

  // Focus never leaves the input — that is what keeps typing available.
  await expect(input).toBeFocused();
});

test("Enter takes the highlighted match without a mouse", async ({ page }) => {
  await openResults(page);
  const input = page.locator(".search__input");

  await input.press("ArrowDown");
  await input.press("ArrowDown");
  await input.press("Enter");

  // The second match was chosen and the popup closed.
  await expect(input).toHaveValue("Quilmes");
  await expect(page.locator(".search__results")).not.toHaveClass(/is-open/);
  await expect(input).toHaveAttribute("aria-expanded", "false");
  expect(await activeDescendant(page)).toBeNull();

  // And the selection reached the app: the globe flew to Quilmes. This is the
  // assertion that matters — the popup closing is internal bookkeeping, while
  // the camera moving is the outcome the user asked for, and it is exactly
  // what the keyboard could not reach before. Measured against the mouse path
  // on the same fixture, the resulting hash is identical.
  await expect
    .poll(() => page.evaluate(() => location.hash), { timeout: 20_000 })
    .toContain("lat=-34.72&lon=-58.25");
});

test("Enter with nothing highlighted selects nothing", async ({ page }) => {
  // The guard that keeps a plain Enter on a typed query from silently flying
  // the globe to whichever match happened to be first.
  await openResults(page);
  const input = page.locator(".search__input");

  await input.press("Enter");
  await page.waitForTimeout(1_000);

  await expect(input).toHaveValue("Qui");
  await expect(page.locator(".search__results")).toHaveClass(/is-open/);
  expect(await page.evaluate(() => location.hash)).not.toContain(
    "lat=-34.72&lon=-58.25"
  );
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
