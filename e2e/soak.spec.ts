import { test, expect } from "@playwright/test";
import { awaitAppInteractive } from "./boot";

/**
 * Long-session soak: research use isn't a 5-minute demo — this tool stays
 * open in a tab through a seminar or a field day. WebGL apps leak quietly:
 * un-disposed textures/geometries survive GC and accumulate until the
 * context dies (we *recover* from context loss since round 2; we must not
 * *cause* it). The chaos suite storms interactions; this suite repeats a
 * realistic working loop and asserts the app's resource footprint is
 * **bounded**: GPU counters return to within a fixed budget of the
 * post-boot baseline after every cycle's work is closed out.
 *
 * Advisory job (like visual regression was at introduction): flakiness gets
 * measured before it gates. Promote to blocking once it has a quiet record.
 *
 * Deterministic: fixed layer rotation and scrub positions, seeded like the
 * chaos suite only where variety matters (none needed yet).
 */

const CYCLES = Number(process.env.SOAK_CYCLES ?? 6);
/**
 * Budget above the post-boot baseline the app may retain once idle again.
 * Texture caches are bounded by design (RFC-001's GPU-budget LRU keeps HD
 * tiles capped; the scrub cache holds a window of months) — the budget
 * absorbs those caches filling, while an unbounded leak (per-cycle growth)
 * blows straight past it by cycle 3–4.
 */
const TEXTURE_BUDGET = 80;
const GEOMETRY_BUDGET = 60;

test("resource footprint stays bounded through a working session", async ({
  page,
}) => {
  test.setTimeout(420_000);

  const pageErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));

  await page.goto("/");
  await awaitAppInteractive(page);

  const stats = () => page.evaluate(() => window.__RENDERER_STATS__!());
  expect(await page.evaluate(() => typeof window.__RENDERER_STATS__)).toBe(
    "function"
  );

  // Let boot-time prefetch settle before taking the baseline.
  await page.waitForTimeout(4000);
  const baseline = await stats();
  console.log(`baseline: ${JSON.stringify(baseline)}`);

  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  const readings: { textures: number; geometries: number }[] = [];
  for (let cycle = 0; cycle < CYCLES; cycle++) {
    // One working loop: switch layer → scrub around → probe a point →
    // toggle an overlay pair on and off → close everything.
    await page.locator(".layer-selector__trigger").click({ timeout: 5000 });
    const options = page.locator(".layer-selector__option");
    const count = await options.count();
    await options.nth((cycle * 3 + 1) % count).click({ timeout: 5000 });

    const track = page.locator(".timeline__track");
    const box = await track.boundingBox();
    if (box) {
      for (const t of [0.2, 0.8, 0.5]) {
        await track.click({
          position: { x: box.width * t, y: box.height / 2 },
          force: true,
          timeout: 5000,
        });
        await page.waitForTimeout(400);
      }
    }

    await page.mouse.click(cx + 60, cy - 40); // probe (or hover no-op on categorical)
    await page.waitForTimeout(1500);
    await page.keyboard.press("Escape"); // close the probe panel

    const items = page.locator(".toolbar__item");
    const itemCount = await items.count();
    if (itemCount > 1) {
      const overlay = items.nth(cycle % itemCount);
      await overlay.click({ timeout: 5000 }); // on
      await page.waitForTimeout(600);
      await overlay.click({ timeout: 5000 }); // off — must release its GPU resources
    }
    await page.keyboard.press("Escape");

    // Idle a beat, then read the counters.
    await page.waitForTimeout(1200);
    const reading = await stats();
    readings.push(reading);
    console.log(`cycle ${cycle + 1}/${CYCLES}: ${JSON.stringify(reading)}`);
  }

  // Bounded, not merely flat-this-minute: the final footprint sits within a
  // fixed budget of the post-boot baseline (caches fill; leaks compound).
  const last = readings[readings.length - 1];
  expect(
    last.textures - baseline.textures,
    `textures grew ${baseline.textures} → ${last.textures} over ${CYCLES} cycles`
  ).toBeLessThanOrEqual(TEXTURE_BUDGET);
  expect(
    last.geometries - baseline.geometries,
    `geometries grew ${baseline.geometries} → ${last.geometries} over ${CYCLES} cycles`
  ).toBeLessThanOrEqual(GEOMETRY_BUDGET);

  // And the second half of the session must not trend upward the way a
  // per-cycle leak does: allow jitter, catch compounding.
  const mid = readings[Math.floor(readings.length / 2)];
  expect(
    last.textures - mid.textures,
    `late-session texture growth (${mid.textures} → ${last.textures})`
  ).toBeLessThanOrEqual(TEXTURE_BUDGET / 2);

  // Rendering is still alive, and the session threw nothing, ever.
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_ACTIVE__), {
      timeout: 10_000,
    })
    .toBe(true);
  expect(pageErrors).toEqual([]);
});
