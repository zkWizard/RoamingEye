import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The keyboard's aim on the globe is visible, named, and spoken.
 *
 * A pointer aims with a cursor, and the hover readout follows it. The keyboard
 * has no cursor: it turns the globe under a fixed aim at the middle of the
 * view, which is the point Enter charts. Nothing drew that point and nothing
 * named it, so arrowing the globe reported nothing at all — the only way to
 * learn where you had arrived was to press Enter and read the probe that
 * opened, and a screen-reader user got silence either way.
 *
 * A roomy viewport on purpose: at 1280x720 the bottom HUD's box reaches the
 * middle of the window, and these assertions are about the aim, not about the
 * HUD collision that owns its own spec.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const READOUT = /\d+\.\d{2}°[NS], \d+\.\d{2}°[EW]/;

const tooltip = (page: Page) => page.locator("#hover-tooltip");
const reticle = (page: Page) => page.locator("#globe-reticle");

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("tabbing to the globe marks and names the point Enter would chart", async ({
  page,
}) => {
  await expect(reticle(page)).not.toHaveClass(/is-visible/);

  await page.keyboard.press("Tab");
  await expect(page.locator("#globe")).toBeFocused();

  await expect(reticle(page)).toHaveClass(/is-visible/);
  await expect(tooltip(page)).toHaveClass(/is-visible/);
  await expect(tooltip(page)).toHaveText(READOUT);

  // The mark sits on the camera subpoint, which projects to the middle of the
  // canvas — the same point `Enter` charts. Anywhere else and it would be
  // pointing at somewhere the keys are not.
  const offset = await page.evaluate(() => {
    const r = document.querySelector("#globe-reticle")!.getBoundingClientRect();
    return {
      x: r.left + r.width / 2 - window.innerWidth / 2,
      y: r.top + r.height / 2 - window.innerHeight / 2,
    };
  });
  expect(Math.abs(offset.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(offset.y)).toBeLessThanOrEqual(1);
});

test("arrowing the globe moves the readout with it", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(tooltip(page)).toHaveText(READOUT);
  const before = await tooltip(page).textContent();

  await page.keyboard.press("ArrowRight");

  // Auto-retrying: the readout is written from the controls' `change` event.
  await expect.poll(async () => tooltip(page).textContent()).not.toBe(before);
  await expect(tooltip(page)).toHaveText(READOUT);
});

test("the aim is spoken once the turning stops, not on every step", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await expect(tooltip(page)).toHaveText(READOUT);

  // Record the announcement SEQUENCE: a live region written on every key press
  // would narrate every point the user was merely passing over.
  await page.evaluate(() => {
    const region = document.querySelector(".announcer")!;
    const seen: string[] = [];
    (window as unknown as { __spoken: string[] }).__spoken = seen;
    new MutationObserver(() => seen.push(region.textContent ?? "")).observe(
      region,
      { childList: true, subtree: true, characterData: true }
    );
  });

  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");

  await expect
    .poll(
      async () =>
        await page.evaluate(
          () => (window as unknown as { __spoken: string[] }).__spoken.length
        ),
      { timeout: 5_000 }
    )
    .toBeGreaterThan(0);

  const spoken = await page.evaluate(
    () => (window as unknown as { __spoken: string[] }).__spoken
  );
  expect(spoken).toHaveLength(1);
  expect(spoken[0]).toMatch(READOUT);
});

test("a mouse click on the globe raises no aim — the cursor is its own", async ({
  page,
}) => {
  await page.mouse.click(640, 300);
  await expect(page.locator("#globe")).toBeFocused();
  // Focused, but not `:focus-visible`: a pointer user already has an aim.
  await expect(reticle(page)).not.toHaveClass(/is-visible/);
});

test("leaving the globe takes the aim down", async ({ page }) => {
  await page.keyboard.press("Tab");
  await expect(reticle(page)).toHaveClass(/is-visible/);

  await page.keyboard.press("Tab");
  await expect(page.locator("#globe")).not.toBeFocused();
  await expect(reticle(page)).not.toHaveClass(/is-visible/);
  await expect(tooltip(page)).not.toHaveClass(/is-visible/);
});

test("the reticle never takes a hit the globe should have had", async ({
  page,
}) => {
  await page.keyboard.press("Tab");
  await expect(reticle(page)).toHaveClass(/is-visible/);

  // `pointer-events: none`, so it is absent from its own hit test: a mark over
  // the globe that swallowed the drag under it would cost more than it gives.
  const hit = await page.evaluate(() => {
    const r = document.querySelector("#globe-reticle")!.getBoundingClientRect();
    return document.elementFromPoint(
      Math.round(r.left + r.width / 2),
      Math.round(r.top + r.height / 2)
    )?.id;
  });
  expect(hit).toBe("globe");
});
