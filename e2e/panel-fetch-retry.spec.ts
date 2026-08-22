import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * A dropped request must not retire a reference panel for the whole session.
 *
 * The software finder and the fleet dashboard each guard their one fetch with
 * an in-flight promise, and a REJECTED fetch used to stay in that guard: the
 * parsed data was still null, so every later open awaited a promise that had
 * already settled into the failure message and asked the network for nothing.
 * A single blip on the wire — the flaky hotel Wi-Fi case, not an outage — left
 * the panel reading "unavailable" until the reader thought to reload the page,
 * with the artifacts sitting there available the whole time.
 *
 * Both specs fail the same way against the old code: the second open prints
 * the first open's failure and issues no request. The request COUNT is the
 * load-bearing half — text alone would pass on a panel that merely cached a
 * lucky success — so each asserts exactly one request per open.
 */

test.use({ viewport: { width: 1280, height: 900 } });

type Panel = {
  name: string;
  artifact: string;
  link: string;
  root: string;
  status: string;
  loaded: RegExp;
};

const PANELS: Panel[] = [
  {
    name: "software finder",
    artifact: "**/data/software-catalog.json",
    link: "#software-link",
    root: ".software",
    status: ".software__status",
    loaded: /\d+ verified projects?/,
  },
  {
    name: "fleet dashboard",
    artifact: "**/data/agent-status.json",
    link: "#fleet-link",
    root: ".fleet",
    status: ".fleet__status",
    loaded: /Last run/,
  },
];

for (const panel of PANELS) {
  test(`${panel.name} retries its artifact after a failed fetch`, async ({
    page,
  }) => {
    let offline = true;
    let requests = 0;
    await page.route(panel.artifact, (route) => {
      requests += 1;
      return offline ? route.abort("failed") : route.continue();
    });

    await page.goto("/");
    await awaitAppInteractive(page);

    // First open, on a broken wire: the panel says so.
    await page.locator(panel.link).click();
    const status = page.locator(panel.status);
    await expect(status).toContainText("unavailable", { timeout: 25_000 });
    expect(requests, "the first open never requested the artifact").toBe(1);
    // And it says what to do about it, or reopening is not a gesture anyone
    // would think to make.
    await expect(status).toContainText("Reopen this panel");

    // The wire comes back while the panel is shut.
    offline = false;
    await page.locator(`${panel.root} .providers__close`).click();
    await expect(page.locator(`${panel.root}.is-open`)).toHaveCount(0);

    // Reopening asks again, and this time the content arrives.
    await page.locator(panel.link).click();
    await expect(status).toContainText(panel.loaded, { timeout: 25_000 });
    expect(requests, "reopening never retried the artifact").toBe(2);

    // A third open is served from memory: the retry replaced the latch, it did
    // not turn every open into a request.
    await page.locator(`${panel.root} .providers__close`).click();
    await expect(page.locator(`${panel.root}.is-open`)).toHaveCount(0);
    await page.locator(panel.link).click();
    await expect(status).toContainText(panel.loaded);
    expect(requests, "a successful load was not cached").toBe(2);
  });
}
