import { test, expect } from "@playwright/test";

/**
 * Smoke tests — the highest-value e2e layer for a WebGL app.
 *
 * We don't try to assert what's *drawn* (the canvas is an opaque pixel buffer);
 * we assert the failure modes that actually break a 3D app: runtime errors, a
 * missing/zero-sized canvas, and a WebGL context that never initialises.
 */

test("loads without console errors or page errors", async ({ page }) => {
  const errors: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") errors.push(msg.text());
  });
  page.on("pageerror", (err) => errors.push(err.message));

  await page.goto("/");

  // Wait for the app to report its first rendered frame.
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });

  expect(errors, `Console/page errors: ${errors.join("\n")}`).toEqual([]);
});

test("renders a sized canvas with a live WebGL context", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });

  const canvas = page.locator("#globe");
  await expect(canvas).toBeVisible();

  const box = await canvas.boundingBox();
  expect(box?.width ?? 0).toBeGreaterThan(0);
  expect(box?.height ?? 0).toBeGreaterThan(0);

  // The canvas must have a working WebGL context, not just exist in the DOM.
  const hasWebGL = await canvas.evaluate((el) => {
    const c = el as HTMLCanvasElement;
    const gl = c.getContext("webgl2") ?? c.getContext("webgl");
    return gl !== null;
  });
  expect(hasWebGL).toBe(true);
});

declare global {
  interface Window {
    __APP_READY__?: boolean;
  }
}
