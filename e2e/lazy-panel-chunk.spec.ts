import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The providers, software and fleet panels each load as their own chunk on first
 * open. These specs drive that request into failure, which is what a flaky
 * connection does, and pin what the reader is told, whether pressing again is
 * worth anything, and that a successful open still says nothing.
 */

const CHUNK = "**/assets/ProvidersPage*";

test.use({ viewport: { width: 1280, height: 900 } });

test("a failed panel chunk is worded, and pressing again is not the remedy", async ({
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

  // Pressing again is NOT the remedy, and the copy must not imply it is: a
  // rejected dynamic import stays rejected in the browser's module map, so the
  // second press re-requests nothing and repeats the same worded failure. The
  // cache reset in `lazyPanel` cannot reach the network.
  await page.locator(".error-toast__close").click();
  const before = attempts;
  await page.locator("#providers-link").click();
  await expect(toast).toContainText("Reload the page to try again.", {
    timeout: 15_000,
  });
  expect(attempts).toBe(before);
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
