import { test, expect, type Page } from "@playwright/test";
import { awaitAppInteractive, awaitHashSettled } from "./boot";
import { globePoint } from "./globe";

/**
 * Street-level zoom.
 *
 * The old globe stopped at altitude 0.06 (~410 km over Houston) because zoom
 * multiplied distance to the centre. These tests pin the replacement: a shared
 * street link is not snapped back up, and the wheel, a trackpad pinch, and a
 * two-finger pinch all travel past that old floor.
 */

async function altitude(page: Page): Promise<number> {
  const params = new URLSearchParams(
    await page.evaluate(() => location.hash.slice(1))
  );
  return Number(params.get("alt"));
}

test("a Houston street link stays below the old zoom floor", async ({
  page,
}) => {
  // Inside the unit sphere: the ellipsoid under Houston sits near 0.995, and
  // 250 m above it is still a few thousandths below radius 1.
  await page.goto("/#lat=29.76043&lon=-95.36980&alt=-0.004800");
  await awaitAppInteractive(page);
  await awaitHashSettled(page);
  const height = await altitude(page);
  expect(height).toBeLessThan(0);
  expect(height).toBeGreaterThan(-0.02);
});

test("the wheel and a trackpad pinch pass the old zoom floor", async ({
  page,
}) => {
  await page.goto("/#lat=29.76043&lon=-95.36980&alt=0.06");
  await awaitAppInteractive(page);
  await awaitHashSettled(page);
  const start = await altitude(page);
  expect(start).toBeGreaterThan(0.04);
  expect(start).toBeLessThan(0.08);

  const pt = await globePoint(page);
  await page.mouse.move(pt.x, pt.y);
  await page.mouse.wheel(0, -400);
  await expect.poll(() => altitude(page)).toBeLessThan(0.04);

  const beforePinch = await altitude(page);
  await page.evaluate(() => {
    const globe = document.querySelector("#globe");
    globe?.dispatchEvent(
      new WheelEvent("wheel", {
        deltaY: -80,
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      })
    );
  });
  await expect.poll(() => altitude(page)).toBeLessThan(beforePinch);
});

test("a two-finger pinch zooms toward the ground", async ({ page }) => {
  await page.goto("/#lat=29.76043&lon=-95.36980&alt=0.06");
  await awaitAppInteractive(page);
  await awaitHashSettled(page);
  const start = await altitude(page);

  await page.evaluate(() => {
    const globe = document.querySelector("#globe");
    const fire = (type: string, id: number, x: number, y: number): void => {
      globe?.dispatchEvent(
        new PointerEvent(type, {
          pointerId: id,
          clientX: x,
          clientY: y,
          bubbles: true,
          cancelable: true,
          pointerType: "touch",
          isPrimary: id === 1,
        })
      );
    };
    fire("pointerdown", 1, 400, 300);
    fire("pointerdown", 2, 460, 300);
    fire("pointermove", 2, 620, 300);
    fire("pointerup", 1, 400, 300);
    fire("pointerup", 2, 620, 300);
  });

  await expect.poll(() => altitude(page)).toBeLessThan(start - 0.01);
});
