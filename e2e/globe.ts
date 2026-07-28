import { expect, type Page } from "@playwright/test";

/**
 * A viewport point that is over the rendered globe AND clear of the
 * bottom-centre HUD stack (layer selector + legend + timeline + status).
 *
 * That stack is anchored to the bottom of the viewport and grows UPWARD as the
 * active layer's legend gains lines. It has reached within a single pixel of
 * the vertical centre, so specs that pointed at the exact centre began
 * intercepting `#controls` instead of the canvas — a click or hover that never
 * reaches the globe, failing in a way that reads like a raycast, marker, or
 * probe regression. Sampling above the centre keeps a wide margin.
 *
 * At the default camera distance the globe's silhouette covers roughly 0.8 of
 * the viewport's half-height, so 0.3 * height is comfortably on the sphere.
 * The `elementFromPoint` check states the precondition explicitly, so a future
 * HUD change fails loudly here rather than somewhere unrelated.
 */
export async function globePoint(
  page: Page
): Promise<{ x: number; y: number }> {
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const x = Math.round(viewport.width / 2);
  const y = Math.round(viewport.height * 0.3);
  const hitId = await page.evaluate(
    ([px, py]) => document.elementFromPoint(px, py)?.id ?? "",
    [x, y] as const
  );
  expect(
    hitId,
    `globe sample point (${x}, ${y}) is covered by "${hitId}" — the HUD stack has grown over it`
  ).toBe("globe");
  return { x, y };
}
