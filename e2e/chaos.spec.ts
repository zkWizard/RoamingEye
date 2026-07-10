import { test, expect, type Page } from "@playwright/test";

/**
 * Chaos interaction test: a seeded storm of realistic-but-impatient actions —
 * scrubbing mid-load, switching layers mid-sample, toggling compare during
 * everything — followed by settle-healthy assertions. Our worst latent bugs
 * have been races in exactly this territory (#88's failed-month dedupe, #93's
 * toolbar overlap), found incidentally; this hunts them on purpose.
 *
 * Deterministic: the PRNG seed prints at the start of every run and can be
 * pinned with CHAOS_SEED=<n> to replay a failure action-for-action.
 */

/** mulberry32 — tiny seeded PRNG, deterministic across platforms. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SEED = Number(process.env.CHAOS_SEED ?? 20260708);
const ACTIONS = 60;

test("survives a seeded interaction storm and settles healthy", async ({
  page,
}) => {
  test.setTimeout(150_000);
  console.log(`chaos seed: ${SEED} (replay with CHAOS_SEED=${SEED})`);
  const rand = mulberry32(SEED);
  const pick = <T>(items: T[]): T => items[Math.floor(rand() * items.length)];

  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (err) => pageErrors.push(err.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });
  // Typing in search triggers geocoding — keep the storm self-contained and
  // exercise the failure/abort path instead of a third-party service.
  await page.route("**nominatim**", (route) => route.abort());

  await page.goto("/");
  await page.waitForFunction(() => window.__APP_READY__ === true, null, {
    timeout: 30_000,
  });
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  const cx = viewport.width / 2;
  const cy = viewport.height / 2;

  const actions: Record<string, (p: Page) => Promise<void>> = {
    scrubTrack: async (p) => {
      const track = p.locator(".timeline__track");
      const box = await track.boundingBox();
      if (!box) return;
      await track.click({
        position: { x: box.width * rand(), y: box.height / 2 },
        force: true,
        timeout: 2000,
      });
    },
    arrowKeys: async (p) => {
      const key = rand() < 0.5 ? "ArrowLeft" : "ArrowRight";
      for (let i = 0; i < 3 + Math.floor(rand() * 5); i++) {
        await p.keyboard.press(key, { delay: 20 });
      }
    },
    switchLayer: async (p) => {
      await p.locator(".layer-selector__trigger").click({ timeout: 2000 });
      const options = p.locator(".layer-selector__option");
      const count = await options.count();
      if (count > 0) {
        await options.nth(Math.floor(rand() * count)).click({ timeout: 2000 });
      }
    },
    toggleCompare: async (p) => {
      await p.locator(".compare-button").click({ timeout: 2000 });
    },
    toggleOverlay: async (p) => {
      const items = p.locator(".toolbar__item");
      const count = await items.count();
      if (count > 0) {
        await items.nth(Math.floor(rand() * count)).click({ timeout: 2000 });
      }
    },
    probeClick: async (p) => {
      // Somewhere over the globe (center ± a bit) — opens/moves the probe.
      await p.mouse.click(cx + (rand() - 0.5) * 160, cy + (rand() - 0.5) * 160);
    },
    drawRegion: async (p) => {
      const draw = p.locator(".draw-button");
      await draw.click({ timeout: 2000 });
      const x = cx + (rand() - 0.5) * 120;
      const y = cy + (rand() - 0.5) * 120;
      await p.mouse.move(x, y);
      await p.mouse.down();
      await p.mouse.move(x + 40 + rand() * 60, y + 40 + rand() * 60, {
        steps: 4,
      });
      await p.mouse.up();
    },
    searchAndAbandon: async (p) => {
      const input = p.locator(".search__input");
      await input.fill(pick(["reyk", "quito", "zz@@", "永田町"]), {
        timeout: 2000,
      });
      // Abandon mid-debounce half the time — the abort path is the target.
      if (rand() < 0.5) await input.fill("", { timeout: 2000 });
      await p.keyboard.press("Escape");
    },
    themeToggle: async (p) => {
      await p.locator(".theme-toggle").click({ timeout: 2000 });
    },
    escape: async (p) => {
      await p.keyboard.press("Escape");
    },
  };
  const names = Object.keys(actions);

  const log: string[] = [];
  for (let i = 0; i < ACTIONS; i++) {
    const name = pick(names);
    log.push(name);
    try {
      await actions[name](page);
    } catch (err) {
      // An action racing the UI (element mid-teardown) is part of the storm;
      // what must never happen is a page error — asserted below.
      log.push(`  (${name} interrupted: ${String(err).split("\n")[0]})`);
    }
    if (rand() < 0.6) await page.waitForTimeout(Math.floor(rand() * 150));
  }
  console.log(`storm: ${log.join(" → ")}`);

  // --- Settle & assert health ---------------------------------------------------
  // Leave any armed/open transient states.
  await page.keyboard.press("Escape");
  const draw = page.locator(".draw-button");
  if ((await draw.getAttribute("aria-pressed")) === "true") {
    await draw.click({ timeout: 2000 });
  }
  await page.keyboard.press("Escape");

  // Rendering is alive.
  await expect
    .poll(() => page.evaluate(() => window.__RENDER_ACTIVE__), {
      timeout: 10_000,
    })
    .toBe(true);

  // The imagery pipeline settles — no stuck "Loading…" (a failed month may
  // legitimately show the retry pill; stuck-forever loading is the bug).
  await expect
    .poll(() => page.locator("#timeline-status").textContent(), {
      timeout: 30_000,
    })
    .not.toMatch(/Loading imagery/);

  // The timeline still responds to one final, polite scrub.
  const track = page.locator(".timeline__track");
  const box = await track.boundingBox();
  if (!box) throw new Error("timeline track missing after storm");
  await track.click({
    position: { x: box.width * 0.5, y: box.height / 2 },
    force: true, // an open panel may overlap the track on short viewports
    timeout: 5000,
  });
  await expect(page.locator(".timeline__readout")).not.toHaveText("");

  // Zero uncaught exceptions; console errors limited to the blocked
  // third-party geocoder (deliberate), imagery fetches the storm aborted, and
  // transient GIBS tile CORS hiccups. GIBS's WMTS endpoint intermittently
  // omits the Access-Control-Allow-Origin header under load — an upstream
  // infrastructure condition, not an app fault — which read as
  // "blocked by CORS policy" console errors and flaked this gate; scope the
  // exclusion to GIBS tile loads so a genuine app CORS misconfig still fails.
  expect(pageErrors, `seed ${SEED}\n${log.join(" → ")}`).toEqual([]);
  const gibsCorsHiccup = (m: string): boolean =>
    m.includes("blocked by CORS policy") &&
    m.includes("gibs.earthdata.nasa.gov");
  const unexpected = consoleErrors.filter(
    (m) =>
      !m.includes("net::ERR_FAILED") &&
      !m.includes("Failed to load resource") &&
      !m.includes("ERR_ABORTED") &&
      !gibsCorsHiccup(m)
  );
  expect(unexpected, `seed ${SEED}`).toEqual([]);
});
