import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * "Save PNG" renders a fresh frame and reads the canvas back with
 * `canvas.toBlob`. When the encode fails the callback is handed a null blob,
 * and the handler used to return on the spot: no file, and no word about it.
 *
 * The two outcomes were not symmetric. A save that works fires a `download`,
 * so the browser's own chrome announces the file — that path needs nothing
 * from us and gets nothing, deliberately. A save that fails fires no download
 * at all, leaving the press answered by literally nothing on any channel:
 * measured at 1280x900, keyboard only, the toast region was empty, the live
 * region was empty, and no download event arrived.
 *
 * So the failure speaks and the success stays quiet. The toast is
 * `role="alert"` and is inserted into an always-rendered region, which is the
 * mutation assistive technology reports — one line covers the user who would
 * have watched the file appear and the user who would have heard it.
 */

test.use({ viewport: { width: 1280, height: 900 } });

/** Force `canvas.toBlob` to succeed or fail, before any app code runs. */
async function stubEncode(page: Page, succeed: boolean): Promise<void> {
  await page.addInitScript((ok) => {
    HTMLCanvasElement.prototype.toBlob = function (cb: BlobCallback) {
      setTimeout(
        () => cb(ok ? new Blob(["png"], { type: "image/png" }) : null),
        0
      );
    };
  }, succeed);
}

/** Record the text of every distinct announcement made in the live region. */
async function watchAnnouncements(page: Page): Promise<void> {
  await page.evaluate(() => {
    const region = document.querySelector(".announcer");
    if (!region) throw new Error("no announcer region");
    const seen: string[] = [];
    (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__ = seen;
    new MutationObserver(() => {
      const text = (region.textContent ?? "").trim();
      if (text && seen[seen.length - 1] !== text) seen.push(text);
    }).observe(region, { childList: true, subtree: true, characterData: true });
  });
}

function announced(page: Page): Promise<string[]> {
  return page.evaluate(
    () => (window as unknown as { __ANNOUNCED__: string[] }).__ANNOUNCED__
  );
}

const saveButton = (page: Page) =>
  page.getByRole("button", { name: "Download this view as a PNG" });

test("a PNG the browser could not encode says so", async ({ page }) => {
  await stubEncode(page, false);
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  const toast = page.locator(".error-toast__box");
  await expect(toast).toHaveCount(0);

  // Keyboard only: the press must be the sole cause of whatever appears.
  const save = saveButton(page);
  await save.focus();
  await expect(save).toBeFocused();

  let downloaded = false;
  page.on("download", () => {
    downloaded = true;
  });

  await save.press("Enter");

  // The alert carries the failure and the remedy.
  await expect(toast).toHaveCount(1);
  await expect(page.locator(".error-toast__text")).toHaveText(
    "Couldn't save the PNG. Try again."
  );
  // It has to be inside the live region to be reported, not merely on screen.
  await expect(
    page.locator('.error-toast[role="alert"] .error-toast__box')
  ).toHaveCount(1);

  expect(downloaded).toBe(false);
});

test("a PNG that saves stays silent — the download reports itself", async ({
  page,
}) => {
  await stubEncode(page, true);
  await page.goto("/");
  await awaitAppInteractive(page);
  await watchAnnouncements(page);

  const save = saveButton(page);
  await save.focus();

  const download = page.waitForEvent("download");
  await save.press("Enter");
  await download;

  // No toast and no announcement: the browser's download chrome already said
  // it. A second voice here would talk over the channel that works.
  await expect(page.locator(".error-toast__box")).toHaveCount(0);
  expect(await announced(page)).toEqual([]);
});
