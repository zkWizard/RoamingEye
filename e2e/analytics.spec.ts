import { expect, test } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * The production build ships with analytics off (Cloudflare selected, no
 * beacon token). A page can install `window.__reAnalytics` before boot to
 * receive the same events the adapters would send. That sink is the mock
 * provider: Cloudflare's beacon has no custom-event API, so the test watches
 * the sink rather than a third-party request.
 */

declare global {
  interface Window {
    __reLog?: string[];
    __reAnalytics?: (event: string) => void;
  }
}

test.use({
  viewport: { width: 1280, height: 800 },
  permissions: ["clipboard-read", "clipboard-write"],
});

test("a normal visit loads no analytics provider", async ({ page }) => {
  const urls: string[] = [];
  page.on("request", (request) => urls.push(request.url()));
  await page.goto("/");
  await awaitAppInteractive(page);
  expect(
    urls.some((url) =>
      /cloudflareinsights|goatcounter|plausible\.io/i.test(url)
    )
  ).toBe(false);
});

test("activation events reach a mock provider", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("roamingeye:stories-welcome", "done");
    window.__reLog = [];
    window.__reAnalytics = (event) => {
      window.__reLog?.push(event);
    };
  });
  await page.goto("/");
  await awaitAppInteractive(page);

  await page.locator("#globe").click({ position: { x: 480, y: 400 } });
  await page.locator(".search__input").fill("Quito");
  await expect(page.locator(".search__result-name").first()).toHaveText(
    "Quito",
    { timeout: 15_000 }
  );
  await page.locator(".search__result").first().click();
  await page.getByRole("button", { name: /Previous month/ }).click();
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await page.getByRole("button", { name: /Share view/ }).click();

  await expect
    .poll(() => page.evaluate(() => window.__reLog ?? []))
    .toEqual([
      "pageview",
      "first_probe",
      "first_search",
      "activated",
      "first_scrub",
      "compare",
      "share",
    ]);
});
