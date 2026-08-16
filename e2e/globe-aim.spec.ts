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

/**
 * Piton de la Fournaise — the view `viewState.ts` uses as its own doc example,
 * and the only GVP record within 3° of itself, so the aim cannot land on a
 * neighbour instead. 1.24° north of it is outside the hit radius (0.012 world
 * units on a unit globe, about 0.69°) and is the near-miss case.
 */
const FOURNAISE = "#lat=-21.244&lon=55.708&alt=1.2";
const NEAR_MISS = "#lat=-20.0&lon=55.708&alt=1.2";

/**
 * Boot at `hash` with the volcanoes overlay already on, and give the globe
 * keyboard focus.
 *
 * The overlay is seeded into the stored session rather than switched on from
 * the toolbar: the aim is gated on `:focus-visible`, and a toolbar click leaves
 * focus on the button with no keyboard route back to the canvas — blurring to
 * the body and pressing Tab does NOT return there. Seeding keeps the focus
 * gesture the plain `Tab` the rest of this file uses, on a globe that is the
 * first tab stop of a freshly loaded page.
 */
/**
 * Boot at `hash`, for real.
 *
 * The file's `beforeEach` has already loaded `/`, so `goto("/#…")` from here is
 * a FRAGMENT-only navigation: the document is never re-fetched, no init script
 * runs, and the camera stays wherever the first boot left it — a test written
 * that way passes or fails on the default view while appearing to name a place.
 * Going by way of `about:blank` forces a genuine document load.
 */
async function bootAt(page: Page, hash: string): Promise<void> {
  await page.goto("about:blank");
  await page.goto(`/${hash}`);
  await awaitAppInteractive(page);
}

async function aimWithVolcanoes(page: Page, hash: string): Promise<void> {
  await page.addInitScript(() => {
    // `overlays` present is authoritative, so the defaults must be re-listed.
    window.localStorage.setItem(
      "roamingeye:session",
      JSON.stringify({ overlays: ["hd", "atmosphere", "volcanoes"] })
    );
  });
  await bootAt(page, hash);
  await expect(page.getByRole("button", { name: "Volcanoes" })).toHaveAttribute(
    "aria-pressed",
    "true"
  );
  await page.keyboard.press("Tab");
  await expect(page.locator("#globe")).toBeFocused();
}

/**
 * The readout, re-aimed. The overlay's records load asynchronously, and the aim
 * is only recomputed when the camera moves — so a right/left pair, which lands
 * back on the same point, is what makes this poll see a late arrival rather
 * than a stale readout taken before the markers existed.
 */
async function reaimedReadout(page: Page): Promise<string> {
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowLeft");
  return (await tooltip(page).textContent()) ?? "";
}

test("the aim names the overlay record under it, as the cursor does", async ({
  page,
}) => {
  await aimWithVolcanoes(page, FOURNAISE);

  // The readout the cursor gets, on the point the keys are on. Before this the
  // aim called `describe` alone, so cities, volcanoes, the earthquake bands,
  // the user's location and the plate linework — every registered source —
  // were reachable by pointer only, and this read "21.24°S, 55.71°E".
  await expect
    .poll(() => reaimedReadout(page))
    .toContain("Fournaise, Piton de la");
  await expect(tooltip(page)).toContainText("Shield");

  // And a screen-reader user hears it, which is the half a tooltip cannot do.
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
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(
      async () =>
        await page.evaluate(
          () =>
            (window as unknown as { __spoken: string[] }).__spoken.at(-1) ?? ""
        ),
      { timeout: 5_000 }
    )
    .toContain("Fournaise, Piton de la");

  // Naming the record does not move the mark: the reticle stays on the camera
  // subpoint, which is what the arrow keys steer, what the hash records and
  // what Enter charts. Snapping the aim to the record would break all three.
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

test("an overlay that is switched off is not named", async ({ page }) => {
  // The same aim on the same volcano, with nothing seeded, so the overlay is
  // off: the aim hit-tests what is DRAWN, not what the catalogue contains.
  await bootAt(page, FOURNAISE);
  await expect(page.getByRole("button", { name: "Volcanoes" })).toHaveAttribute(
    "aria-pressed",
    "false"
  );

  await page.keyboard.press("Tab");
  await expect(page.locator("#globe")).toBeFocused();
  await expect(tooltip(page)).toContainText("La Réunion");
  await expect(tooltip(page)).not.toContainText("Fournaise");
});

test("the aim invents no record it is not on", async ({ page }) => {
  // Same overlay, same volcano, 1.24° away — outside the hit radius. The radius
  // is the marker's own drawn radius, so a named record means the reticle is
  // inside the dot on screen; a readout that named a volcano a degree off would
  // be worse than the coordinates it replaced.
  await aimWithVolcanoes(page, NEAR_MISS);
  // Re-aimed, so a record arriving late gets its chance to appear and doesn't
  // leave this passing on a readout taken before the markers were drawn.
  expect(await reaimedReadout(page)).toMatch(READOUT);
  await expect(tooltip(page)).not.toContainText("Fournaise");
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
