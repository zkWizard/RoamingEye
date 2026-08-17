import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive, awaitHashSettled } from "./boot";

/**
 * The globe is keyboard-operable.
 *
 * The canvas has carried `role="application"` since the first commit, which
 * tells a screen reader to stop intercepting keys and pass them to the app.
 * Nothing answered them: the canvas had no `tabindex` and no key handler, so
 * the globe — the app's primary control — was the one thing a keyboard could
 * not reach, and the promise the role makes was empty.
 *
 * The view is read back out of the shareable hash rather than out of the
 * scene, because that is the app's own record of where the camera is and what
 * is being charted: asserting on it also proves a keyboard-driven view is
 * reproducible from its link, like a dragged one.
 */

/** The camera subpoint and altitude the address bar currently records. */
async function view(
  page: Page
): Promise<{ lat: number; lon: number; alt: number }> {
  const params = new URLSearchParams(
    await page.evaluate(() => location.hash.slice(1))
  );
  return {
    lat: Number(params.get("lat")),
    lon: Number(params.get("lon")),
    alt: Number(params.get("alt")),
  };
}

/** The point the open probe is charting, or null if no probe is open. */
async function probed(
  page: Page
): Promise<{ lat: number; lon: number } | null> {
  const raw = await page.evaluate(() =>
    new URLSearchParams(location.hash.slice(1)).get("probe")
  );
  if (!raw) return null;
  const [lat, lon] = raw.split(",");
  return { lat: Number(lat), lon: Number(lon) };
}

/**
 * Focus the globe and make the app state its view.
 *
 * One arrow press both proves the binding is live and produces the baseline
 * the test then measures against. Waiting for that press to REACH the hash is
 * the whole job here: a booted page already carries a hash describing where
 * the camera started, so "a hash exists" is true before the press has landed
 * and would hand back a baseline one 6° step stale.
 */
async function primed(page: Page): Promise<void> {
  await page.locator("#globe").focus();
  await page.keyboard.press("ArrowRight");
  await awaitHashSettled(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("the globe is a keyboard stop with a visible ring", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(page.locator("#globe")).toBeFocused();
  const outline = await page.evaluate(() => {
    const cs = getComputedStyle(document.querySelector("#globe")!);
    return { style: cs.outlineStyle, width: parseFloat(cs.outlineWidth) };
  });
  expect(outline.style).toBe("solid");
  expect(outline.width).toBeGreaterThanOrEqual(2);
});

test("arrow keys turn the globe, and turn it back", async ({ page }) => {
  await primed(page);
  const start = await view(page);

  await page.keyboard.press("ArrowRight");
  await expect.poll(async () => (await view(page)).lon).not.toBe(start.lon);
  const east = await view(page);
  // One press at the boot altitude is the documented 6° step, and it moves
  // the viewpoint EAST — the direction the key points on a map.
  expect(east.lon - start.lon).toBeCloseTo(6, 1);
  expect(east.lat).toBeCloseTo(start.lat, 2);
  expect(east.alt).toBeCloseTo(start.alt, 2);

  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(async () => (await view(page)).lon)
    .toBeCloseTo(start.lon, 1);

  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await view(page)).lat).toBeCloseTo(6, 1);
  await page.keyboard.press("ArrowDown");
  await expect.poll(async () => (await view(page)).lat).toBeCloseTo(0, 1);
});

test("holding a turn key stops short of the pole instead of spinning", async ({
  page,
}) => {
  await primed(page);
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("ArrowUp");
  // 20 presses of 6° would reach 120° if nothing clamped; a viewpoint over
  // the pole has no heading, so the walk stops at 85°.
  await expect.poll(async () => (await view(page)).lat).toBeCloseTo(85, 1);
});

test("plus and minus zoom, within the same bounds as the wheel", async ({
  page,
}) => {
  await primed(page);
  const start = await view(page);

  await page.keyboard.press("-");
  await expect
    .poll(async () => (await view(page)).alt)
    .toBeGreaterThan(start.alt);
  await page.keyboard.press("+");
  await expect
    .poll(async () => (await view(page)).alt)
    .toBeCloseTo(start.alt, 1);

  // The far bound is OrbitControls' maxDistance (4.5 from the centre, so an
  // altitude of 3.5): pressing past it must settle, not drift.
  for (let i = 0; i < 20; i += 1) await page.keyboard.press("-");
  await expect.poll(async () => (await view(page)).alt).toBeCloseTo(3.5, 1);
});

test("Enter charts the point in the middle of the view", async ({ page }) => {
  await primed(page);
  await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await view(page)).lat).toBeCloseTo(6, 1);
  const aimed = await view(page);

  await page.keyboard.press("Enter");

  // The panel opens on the point the arrows steered to — the same subpoint
  // the hash already recorded as the camera position.
  const panel = page.locator("#probe-panel");
  await expect(panel).toHaveClass(/is-open/);
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  // The probe coordinates reach the hash on the same 400ms debounce.
  await expect.poll(async () => (await probed(page)) !== null).toBe(true);
  const target = await probed(page);
  expect(target).not.toBeNull();
  expect(target!.lat).toBeCloseTo(aimed.lat, 1);
  expect(target!.lon).toBeCloseTo(aimed.lon, 1);
});

test("the keys belong to the globe, not the document", async ({ page }) => {
  await primed(page); // a baseline to compare against, then hand focus away
  const search = page.locator(".search__input");
  await search.focus();
  const start = await view(page);

  // Moving the caret in a place name must not fly the camera underneath it,
  // and a minus sign in a search term must not zoom out.
  for (const key of ["ArrowRight", "ArrowUp", "-", "+"]) {
    await page.keyboard.press(key);
  }
  await page.waitForTimeout(600); // longer than the hash debounce
  const after = await view(page);
  expect(after.lon).toBeCloseTo(start.lon, 2);
  expect(after.lat).toBeCloseTo(start.lat, 2);
  expect(after.alt).toBeCloseTo(start.alt, 2);
  await expect(search).toBeFocused();
});
