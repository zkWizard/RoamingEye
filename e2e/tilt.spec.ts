import { expect, test } from "@playwright/test";
import { awaitAppInteractive } from "./boot";
import { globePoint } from "./globe";

/**
 * A tilted camera still looks at the ground point in the link. A click has to
 * chart that near ground, not the far side of the globe the old straight-down
 * ray used once the eye dropped inside the unit sphere.
 */
test("a tilt link pitches the view and a click probes the near ground", async ({
  page,
}) => {
  await page.goto("/#lat=28&lon=86&alt=0.4&pitch=55&hdg=20");
  await awaitAppInteractive(page);
  await expect
    .poll(() => page.evaluate(() => window.__VIEW_PITCH__ ?? 0))
    .toBeGreaterThan(50);
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.__VIEW_HDG__ ?? 0)))
    .toBeGreaterThan(10);

  const tilt = page.locator(".tilt-dock__3d");
  await expect(tilt).toBeVisible();
  await tilt.click();
  await expect
    .poll(() => page.evaluate(() => window.__VIEW_PITCH__ ?? 0))
    .toBeLessThan(1);
  await expect(tilt).toHaveAttribute("aria-pressed", "false");

  await tilt.click();
  await expect
    .poll(() => page.evaluate(() => window.__VIEW_PITCH__ ?? 0))
    .toBeGreaterThan(50);
  await expect(tilt).toHaveAttribute("aria-pressed", "true");

  await page.locator(".tilt-dock__compass").click();
  await expect
    .poll(() => page.evaluate(() => Math.abs(window.__VIEW_HDG__ ?? 0)))
    .toBeLessThan(1);

  const pt = await globePoint(page);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator("#probe-panel")).toHaveClass(/is-open/);
  await expect
    .poll(async () => {
      const probe = await page.evaluate(() =>
        new URLSearchParams(location.hash.slice(1)).get("probe")
      );
      if (!probe) return 999;
      const [lat, lon] = probe.split(",").map(Number);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return 999;
      return Math.hypot(lat - 28, lon - 86);
    })
    .toBeLessThan(45);
});

test("right-drag tilts around the current ground point", async ({ page }) => {
  await page.goto("/#lat=46.5&lon=8&alt=0.35");
  await awaitAppInteractive(page);
  const canvas = page.locator("#globe");
  const box = await canvas.boundingBox();
  if (!box) throw new Error("no canvas");
  const x = box.x + box.width / 2;
  const y = box.y + box.height * 0.3;
  await page.mouse.move(x, y);
  await page.mouse.down({ button: "right" });
  await page.mouse.move(x, y + 160, { steps: 8 });
  await page.mouse.up({ button: "right" });

  await expect
    .poll(() => page.evaluate(() => window.__VIEW_PITCH__ ?? 0))
    .toBeGreaterThan(20);
  await expect.poll(() => page.evaluate(() => location.hash)).toMatch(/pitch=/);
  const hash = await page.evaluate(() => location.hash);
  expect(hash).toContain("lat=46.5");
  expect(hash).toContain("lon=8");
});

declare global {
  interface Window {
    __VIEW_PITCH__?: number;
    __VIEW_HDG__?: number;
  }
}
