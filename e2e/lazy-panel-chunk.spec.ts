import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The providers, software and fleet panels each load as their own chunk on first
 * open. These specs drive that request into failure, which is what a flaky
 * connection does, and pin what the reader is told. Chromium 156+ re-fetches a
 * failed module on the next import(), so a later press does reach the network
 * here; the copy still names reload, which is what also works where that
 * rejection stays cached. A successful open still says nothing.
 */

const CHUNK = "**/assets/ProvidersPage*";

test.use({ viewport: { width: 1280, height: 900 } });

test("a failed panel chunk names reload, and pressing again re-requests it", async ({
  page,
}) => {
  let attempts = 0;
  await page.route(CHUNK, (route) => {
    attempts++;
    return route.abort();
  });

  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();

  // Premise: the chunk really was requested and really did fail.
  await expect.poll(() => attempts, { timeout: 15_000 }).toBeGreaterThan(0);

  const toast = page.locator(".error-toast");
  await expect(toast).toContainText(
    "Couldn't load the data providers. Reload the page to try again.",
    { timeout: 15_000 }
  );
  // The reader is not handed a hashed bundle URL.
  await expect(toast).not.toContainText("assets/");
  await expect(page.locator("#providers-page")).toBeHidden();

  // The next press calls import() again. On this Chromium that re-fetches the
  // chunk, and it still fails while the route is aborting. The copy names
  // reload, which is the remedy that does not depend on the engine retrying.
  await page.locator(".error-toast__close").click();
  const before = attempts;
  await page.locator("#providers-link").click();
  await expect
    .poll(() => attempts, { timeout: 15_000 })
    .toBeGreaterThan(before);
  await expect(toast).toContainText("Reload the page to try again.");
  await expect(page.locator("#providers-page")).toBeHidden();

  // The remedy the message names does work.
  await page.unroute(CHUNK);
  await page.reload();
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();
  await expect(page.locator("#providers-page")).toBeVisible({
    timeout: 20_000,
  });
});

test("a panel that loads its chunk shows no error toast", async ({ page }) => {
  await page.goto("/");
  await awaitAppInteractive(page);
  await page.locator("#providers-link").click();

  await expect(page.locator("#providers-page")).toBeVisible({
    timeout: 20_000,
  });
  // The panel opening is the report; a toast on the success path would be noise.
  await expect(page.locator(".error-toast")).toHaveText("");
});

test("the press that waits on a panel chunk says so, and swallows the repeats", async ({
  page,
}) => {
  // Hold the chunk open rather than sleeping, so this pins the waiting state
  // without spending wall-clock in the blocking gate.
  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let requests = 0;
  await page.route("**/assets/FleetDashboard*", async (route) => {
    requests++;
    await held;
    await route.continue();
  });

  await page.goto("/");
  await awaitAppInteractive(page);

  const link = page.locator("#fleet-link");
  await expect(link).not.toHaveAttribute("aria-busy", "true");
  const idle = await link.boundingBox();

  await link.click();

  // Nothing of this panel is in the page until its chunk lands, so the wait
  // has to be on the control that was pressed — an empty overlay implies it to
  // nobody, and to assistive tech not at all.
  await expect(link).toHaveAttribute("aria-busy", "true");
  await expect(link).toHaveAttribute("data-state", "pending");

  // The ordinary response to a control that looks dead is to press it again;
  // while it is on the wire those repeats cost nothing.
  await link.click();
  await link.click();
  expect(requests).toBe(1);

  // The cue must not resize the control. This header is a wrapping row at
  // phone widths, where a button that grew would reflow the row around it.
  expect(await link.boundingBox()).toEqual(idle);

  release();
  await expect(page.locator("#fleet-page")).toBeVisible({ timeout: 20_000 });
  await expect(link).not.toHaveAttribute("aria-busy", "true");
  await expect(link).not.toHaveAttribute("data-state", "pending");
});
