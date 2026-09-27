import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { openMoreMenu } from "./actions";
import { statSync } from "node:fs";

/**
 * Video clips (src/ui/ClipRecorder.ts): a playback recorded as a captioned
 * file, for posting or a slide.
 *
 * Held here: a story saves as a file named for the story and its months, with
 * the card saying it is recording while it does; the More menu records the
 * layer on screen from the month on screen; and a playback the reader pauses
 * ends the clip and saves what was recorded. The caption's layout rules are
 * unit-tested (lib/clipFrame.test.ts); the pixels were checked by playing a
 * recorded file back when this landed.
 */

const VIDEO = /\.(mp4|webm)$/;

test("a story saves as a video named for the story", async ({ page }) => {
  await page.goto("/#story=black-summer-2019");
  await awaitAppInteractive(page);
  await expect(page.locator(".stories__card")).toBeVisible();

  const download = page.waitForEvent("download", { timeout: 120_000 });
  const save = page.locator(".stories__button", { hasText: "Save video" });
  await save.click();
  await expect(page.locator(".stories__button.is-recording")).toHaveText(
    "Recording…"
  );
  await expect(page.locator("#timeline")).toHaveClass(/is-recording/);

  const file = await download;
  expect(file.suggestedFilename()).toMatch(
    /^roamingeye_black-summer-2019_2019-09_2020-04_v[\d.]+\.(mp4|webm)$/
  );
  const saved = await file.path();
  expect(statSync(saved).size).toBeGreaterThan(20_000);

  // Back to rest: the button and the play ring say so.
  await expect(page.locator(".stories__button.is-recording")).toHaveCount(0);
  await expect(page.locator("#timeline")).not.toHaveClass(/is-recording/);
});

test("the More menu records the layer from the month on screen, until paused", async ({
  page,
}) => {
  await page.goto("/#layer=ndvi&t=2024-01&lat=8.00&lon=-72.00&alt=2.20");
  await awaitAppInteractive(page);

  const download = page.waitForEvent("download", { timeout: 120_000 });
  await openMoreMenu(page);
  await page.locator("#clip-link").click();
  await expect(page.locator(".timeline__play")).toHaveClass(/is-playing/, {
    timeout: 10_000,
  });
  // A few months in, the reader pauses: that ends the clip, and it saves.
  await expect(page.locator(".timeline__readout")).not.toHaveText("Jan 2024", {
    timeout: 20_000,
  });
  await page.locator("body").press("p");

  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^roamingeye_ndvi_2024-0\d_2024-/);
  expect(file.suggestedFilename()).toMatch(VIDEO);
});
