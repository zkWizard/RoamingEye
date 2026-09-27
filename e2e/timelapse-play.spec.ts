import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The time-lapse: a play button that runs the record forward on its own.
 *
 * RoamingEye's whole premise is watching the Earth change over time, and until
 * this it had no play button: every month had to be dragged or keyed to. The
 * guarantees held here are the ones a time-lapse is worth nothing without —
 * it moves, it stops when asked (by the button, by P anywhere, by Space on the
 * ruler, or by a hand taking the controls), it starts over from the first
 * month when played at the end, and it never runs ahead of the imagery: a
 * month whose picture has not arrived is held until it has, so the date on
 * the dock is always the date on the globe.
 */

const START = "/#layer=ndvi&t=2024-01&lat=8.00&lon=-72.00&alt=2.20";

const readout = (page: Page) => page.locator(".timeline__readout");
const play = (page: Page) => page.locator(".timeline__play");

test("plays forward, and stops when asked", async ({ page }) => {
  await page.goto(START);
  await awaitAppInteractive(page);
  await expect(readout(page)).toHaveText("Jan 2024");
  await expect(play(page)).toHaveAttribute(
    "aria-label",
    "Play the time-lapse (P)"
  );

  await play(page).click();
  await expect(play(page)).toHaveAttribute(
    "aria-label",
    "Pause the time-lapse (P)"
  );
  await expect(readout(page)).not.toHaveText("Jan 2024", { timeout: 20_000 });

  // P, from anywhere but a text field.
  await page.locator("body").press("p");
  await expect(play(page)).toHaveAttribute(
    "aria-label",
    "Play the time-lapse (P)"
  );
  const held = await readout(page).textContent();
  await page.waitForTimeout(1500);
  await expect(readout(page)).toHaveText(held ?? "");

  // Space on the ruler toggles it too, and a key that moves the ruler is a
  // hand on the controls: the reader has taken over, so playback stops.
  const track = page.locator(".timeline__track");
  await track.focus();
  await page.keyboard.press(" ");
  await expect(play(page)).toHaveClass(/is-playing/);
  await page.keyboard.press("ArrowLeft");
  await expect(play(page)).not.toHaveClass(/is-playing/);
});

test("played at the newest month, it starts over from the first", async ({
  page,
}) => {
  await page.goto(START);
  await awaitAppInteractive(page);
  const track = page.locator(".timeline__track");
  await track.focus();
  await page.keyboard.press("End");
  const newest = await readout(page).textContent();

  await play(page).click();
  // The first NDVI composite: Mar 2000.
  await expect(readout(page)).toHaveText("Mar 2000");
  await expect(readout(page)).not.toHaveText(newest ?? "");
  await play(page).click();
});

test("holds on a month until its imagery is on screen", async ({ page }) => {
  // March 2024's imagery is held at the network until released, so neither its
  // prefetched preview nor its full load can arrive.
  let release: () => void = () => {};
  const released = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    (url) =>
      url.pathname.endsWith("wms.cgi") &&
      (url.searchParams.get("TIME") ?? "").startsWith("2024-03"),
    async (route) => {
      await released;
      await route.continue().catch(() => {});
    }
  );

  await page.goto("/#layer=ndvi&t=2024-02&lat=8.00&lon=-72.00&alt=2.20");
  await awaitAppInteractive(page);

  await play(page).click();
  await expect(readout(page)).toHaveText("Mar 2024", { timeout: 20_000 });
  // Held: well past a dozen frames, the playhead has not moved on.
  await page.waitForTimeout(3000);
  await expect(readout(page)).toHaveText("Mar 2024");
  await expect(play(page)).toHaveClass(/is-playing/);

  release();
  await expect(readout(page)).toHaveText("Apr 2024", { timeout: 20_000 });
  await play(page).click();
});
