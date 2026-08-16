import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Drawing a study region is keyboard-operable.
 *
 * "Draw region" is an ordinary button, so a keyboard armed the mode perfectly
 * well and then hit a wall: arming disables OrbitControls, and both of the
 * canvas key handlers bailed out on exactly that, so the arrow keys and Enter
 * the globe had just gained went dead. The HUD's one instruction was "Drag on
 * the globe to draw a region" — a gesture the user who got there could not
 * make — and Escape, undocumented at that moment, was the only way out.
 *
 * A drag is two corners plus the travel between them. Enter takes a corner,
 * the arrows carry the camera to the opposite one, Enter again takes the box.
 */

/** The camera subpoint the address bar currently records. */
async function view(page: Page): Promise<{ lat: number; lon: number }> {
  const params = new URLSearchParams(
    await page.evaluate(() => location.hash.slice(1))
  );
  return { lat: Number(params.get("lat")), lon: Number(params.get("lon")) };
}

const drawButton = (page: Page) => page.locator(".draw-button");
const status = (page: Page) => page.locator("#timeline-status");

/** A corner as the probe panel's heading spells it, e.g. `18.00°N, 60.00°W`. */
function corner({ lat, lon }: { lat: number; lon: number }): string {
  const ns = `${Math.abs(lat).toFixed(2)}°${lat < 0 ? "S" : "N"}`;
  return `${ns}, ${Math.abs(lon).toFixed(2)}°${lon < 0 ? "W" : "E"}`;
}

/**
 * Arm draw mode the way a keyboard user does — by pressing the button — and
 * settle the first hash write, which only happens once the camera has moved.
 */
async function armed(page: Page): Promise<void> {
  await page.locator("#globe").focus();
  await page.keyboard.press("ArrowRight");
  // A fresh load writes no hash at all until the camera first moves, and the
  // write is debounced — poll for it rather than assume it is there.
  await expect.poll(async () => (await view(page)).lon).toBeLessThan(0);
  await drawButton(page).focus();
  await page.keyboard.press("Enter");
  await expect(drawButton(page)).toHaveAttribute("aria-pressed", "true");
}

test.beforeEach(async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
});

test("arming draw mode hands focus to the globe and says which keys work", async ({
  page,
}) => {
  await armed(page);
  // The mode's every gesture happens on the globe, so focus goes there rather
  // than staying on the button the user just pressed.
  await expect(page.locator("#globe")).toBeFocused();
  // The instruction has to name a gesture the user who reached it can make.
  await expect(status(page)).toContainText("Enter");
});

test("the arrow keys still turn the globe while draw mode is armed", async ({
  page,
}) => {
  await armed(page);
  const start = await view(page);

  await page.keyboard.press("ArrowRight");
  // Arming disables OrbitControls so a drag sweeps a box instead of rotating.
  // The arrows are how a keyboard aims the second corner, so they must live
  // through that — this is the exact assumption the old handlers broke on.
  await expect
    .poll(async () => (await view(page)).lon)
    .toBeCloseTo(start.lon + 6, 1);
});

test("Enter, arrows, Enter charts the region the arrows framed", async ({
  page,
}) => {
  await armed(page);
  const first = await view(page);

  await page.keyboard.press("Enter"); // first corner, at the camera subpoint
  await expect(status(page)).toContainText("Corner set");

  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowUp");
  await expect.poll(async () => (await view(page)).lat).toBeCloseTo(18, 1);
  const second = await view(page);

  await page.keyboard.press("Enter"); // opposite corner — takes the box

  const panel = page.locator("#probe-panel");
  await expect(panel).toHaveClass(/is-open/);
  await expect(panel).toHaveAttribute("aria-hidden", "false");
  // The chart is a region's, not a point's, and it spans the two corners the
  // arrows aimed at — read off the panel's own heading, which is what a user
  // checks the box by.
  await expect(panel).toContainText("Drawn region");
  await expect(panel).toContainText(corner(first));
  await expect(panel).toContainText(corner(second));
  // Taking the box leaves draw mode, exactly as releasing a drag does.
  await expect(drawButton(page)).toHaveAttribute("aria-pressed", "false");
});

test("a second corner on top of the first keeps draw mode and says why", async ({
  page,
}) => {
  await armed(page);
  await page.keyboard.press("Enter");
  await expect(status(page)).toContainText("Corner set");

  await page.keyboard.press("Enter"); // same subpoint: a line, not a box

  // One arrow press moves in a single axis, so Enter-arrow-Enter is a flat
  // box and this is the likeliest honest mistake. Dropping the user out of
  // the mode for it would cost them the corner they had already placed.
  await expect(status(page)).toContainText("Too small");
  await expect(drawButton(page)).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#probe-panel")).not.toHaveClass(/is-open/);

  // The placed corner survives, so turning further and pressing again works.
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowRight");
  for (let i = 0; i < 3; i += 1) await page.keyboard.press("ArrowUp");
  await page.keyboard.press("Enter");
  await expect(page.locator("#probe-panel")).toHaveClass(/is-open/);
  await expect(page.locator("#probe-panel")).toContainText("Drawn region");
});

test("Escape leaves draw mode without charting anything", async ({ page }) => {
  await armed(page);
  await page.keyboard.press("Enter"); // a corner is down
  await page.keyboard.press("Escape");

  await expect(drawButton(page)).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator("#probe-panel")).not.toHaveClass(/is-open/);
  // Back out of the mode, the arrows go back to plain navigation rather than
  // staying stuck on a half-placed box.
  const start = await view(page);
  await page.keyboard.press("ArrowRight");
  await expect
    .poll(async () => (await view(page)).lon)
    .toBeCloseTo(start.lon + 6, 1);
});
