import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * View-card thumbnails are plain <img> GetMaps. When one fails — a lazy-load
 * abort, or GIBS returning something that is not a bitmap — the browser
 * paints its broken-image icon. The card must retry once and then show the
 * layer gradient, with the <img> kept from painting, at the same 64px height.
 *
 * Both cases stub the thumbnail URL (WIDTH=280) and let the globe's own GIBS
 * requests through, so the boot curtain can still lift.
 */

test.use({ viewport: { width: 1280, height: 900 } });

const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAgAAAQABAAD//gAQTGF2YzYwLjMxLjEwMgD/2wBDAAgEBAQEBAUFBQUFBQYGBgYGBgYGBgYGBgYHBwcICAgHBwcGBgcHCAgICAkJCQgICAgJCQoKCgwMCwsODg4RERT/xABMAAEBAAAAAAAAAAAAAAAAAAAABgEBAQAAAAAAAAAAAAAAAAAABAYQAQAAAAAAAAAAAAAAAAAAAAARAQAAAAAAAAAAAAAAAAAAAAD/wAARCAAIAAgDASIAAhEAAxEA/9oADAMBAAIRAxEAPwCMAFTb/9k=",
  "base64"
);

function isThumbnail(url: string): boolean {
  return url.includes("WIDTH=280");
}

/** Images that failed decode and are still painted — the broken-icon state. */
async function visibleBrokenThumbs(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      [...document.querySelectorAll("img.view-card__thumb")].filter((node) => {
        const img = node as HTMLImageElement;
        const style = getComputedStyle(img);
        const visible =
          style.opacity !== "0" &&
          style.visibility !== "hidden" &&
          img.getClientRects().length > 0;
        return visible && img.naturalWidth === 0;
      }).length
  );
}

test("failed thumbnails retry once and show the layer gradient", async ({
  page,
}) => {
  let requests = 0;
  let retries = 0;
  await page.route("**gibs.earthdata.nasa.gov**", (route) => {
    const url = route.request().url();
    if (!isThumbnail(url)) return route.continue();
    requests += 1;
    if (url.includes("retry=1")) retries += 1;
    return route.abort("failed");
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await expect(page.locator(".view-card__thumbbox.is-fallback")).toHaveCount(
    8,
    { timeout: 15_000 }
  );

  expect(requests).toBe(16);
  expect(retries).toBe(8);
  expect(await visibleBrokenThumbs(page)).toBe(0);

  const precip = page.locator('.view-card__thumbbox[data-layer="precip"]');
  await expect(precip).toHaveCSS("height", "64px");
  const background = await precip.evaluate(
    (el) => getComputedStyle(el).backgroundImage
  );
  expect(background).toContain("linear-gradient");
  // Driest stop of the precipitation legend, #d53e4f.
  expect(background).toContain("213, 62, 79");
});

test("a decoded thumbnail is shown over the gradient", async ({ page }) => {
  await page.route("**gibs.earthdata.nasa.gov**", (route) => {
    if (!isThumbnail(route.request().url())) return route.continue();
    return route.fulfill({
      status: 200,
      contentType: "image/jpeg",
      body: TINY_JPEG,
    });
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await expect(page.locator(".view-card__thumb.is-ready")).toHaveCount(8, {
    timeout: 15_000,
  });
  expect(await visibleBrokenThumbs(page)).toBe(0);

  const ready = await page.evaluate(() =>
    [...document.querySelectorAll("img.view-card__thumb.is-ready")].every(
      (node) => {
        const img = node as HTMLImageElement;
        return img.naturalWidth > 0 && getComputedStyle(img).opacity === "1";
      }
    )
  );
  expect(ready).toBe(true);
  await expect(page.locator(".view-card__thumbbox.is-fallback")).toHaveCount(0);
});
