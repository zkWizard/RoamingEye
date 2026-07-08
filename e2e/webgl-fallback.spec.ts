import { test, expect } from "@playwright/test";

/**
 * Boot resilience: with WebGL unavailable (blocked/unsupported), the app
 * must explain itself instead of dying to a blank page.
 */
test("shows a friendly message when WebGL is unavailable", async ({
  page,
}) => {
  await page.addInitScript(() => {
    // Simulate a WebGL-less browser: every context request fails.
    HTMLCanvasElement.prototype.getContext = () => null;
  });
  await page.goto("/");
  const loader = page.locator("#loader");
  await expect(loader).toContainText("RoamingEye needs WebGL");
  await expect(loader.locator("a")).toHaveAttribute(
    "href",
    "https://get.webgl.org/"
  );
});
