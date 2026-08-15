import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { awaitAppInteractive } from "./boot";
import { globePoint } from "./globe";

/**
 * Enforced accessibility: axe-core (WCAG 2.x A/AA rule tags) scans the app
 * in each meaningful UI state, in both themes. Serious/critical violations
 * FAIL the suite — as do rules named in ENFORCED_RULES regardless of axe's
 * impact grade; other moderate/minor findings are reported to the log as
 * advisory so the gate stays honest and low-noise.
 *
 * The WebGL canvas is excluded — axe cannot see into a pixel buffer; its
 * accessible equivalents (coordinate readout, provenance line, ARIA
 * application label) are part of the scanned DOM.
 *
 * Why enforced: Section 508 binds US federal agencies and federally-funded
 * institutions to WCAG A/AA, and universities apply the same bar — a tool
 * courting classrooms and government labs verifies it in CI, not in a
 * pledge. (see .github/ISSUE #123 for references)
 */

// Rules enforced regardless of axe's impact rating. axe grades some direct
// WCAG failures "moderate" (e.g. meta-viewport, a hard SC 1.4.4 violation
// that hid in the advisory log for months) — once a rule is settled here,
// a regression must fail the suite, not scroll past as advisory noise.
const ENFORCED_RULES = new Set(["meta-viewport", "meta-viewport-large"]);

async function scan(page: Page, state: string): Promise<void> {
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .exclude("#globe")
    .analyze();

  const advisory = results.violations.filter(
    (v) =>
      (v.impact === "moderate" || v.impact === "minor") &&
      !ENFORCED_RULES.has(v.id)
  );
  for (const v of advisory) {
    console.log(
      `a11y advisory [${state}] ${v.id} (${v.impact}): ${v.nodes.length} node(s) — ${v.helpUrl}`
    );
  }

  const enforced = results.violations.filter(
    (v) =>
      v.impact === "serious" ||
      v.impact === "critical" ||
      ENFORCED_RULES.has(v.id)
  );
  const detail = enforced
    .map(
      (v) =>
        `${v.id} (${v.impact}): ${v.description}\n` +
        v.nodes
          .slice(0, 5)
          .map((n) => `  ${n.target.join(" ")} — ${n.failureSummary}`)
          .join("\n")
    )
    .join("\n\n");
  expect(enforced, `axe violations in state "${state}":\n${detail}`).toEqual(
    []
  );
}

// Theme is pinned through the app's own localStorage override, before load:
// headless CI reports prefers-color-scheme light, so the boot default would
// silently invert which palette each test audits — and toggling at runtime
// races the 0.3s palette transition (axe once flagged a mid-blend contrast
// ratio that exists for a few frames only).
async function boot(page: Page, theme: "dark" | "light"): Promise<void> {
  await page.addInitScript(
    (t) => localStorage.setItem("roamingeye:theme", t),
    theme
  );
  await page.goto("/");
  await awaitAppInteractive(page);
}

test.beforeEach(async ({ page }, testInfo) => {
  // The light-theme test boots itself; everything else audits dark.
  if (!testInfo.title.includes("light theme")) await boot(page, "dark");
});

test("base UI is axe-clean (dark theme)", async ({ page }) => {
  await scan(page, "base/dark");
});

test("base UI is axe-clean (light theme)", async ({ page }) => {
  await boot(page, "light");
  await scan(page, "base/light");
});

test("layer picker open is axe-clean", async ({ page }) => {
  await page.locator(".layer-selector__trigger").click();
  await expect(page.locator(".layer-selector__panel")).toHaveClass(/is-open/);
  await scan(page, "layer-picker");
});

test("probe panel with a chart is axe-clean", async ({ page }) => {
  const pt = await globePoint(page);
  await page.mouse.click(pt.x, pt.y);
  await expect(page.locator("#probe-panel")).toHaveClass(/is-open/);
  await scan(page, "probe-panel");
});

test("place observations export is axe-clean while sampling", async ({
  page,
}) => {
  await page.locator(".search__input").fill("Vatican City");
  await expect(page.locator(".search__results")).toHaveClass(/is-open/, {
    timeout: 20_000,
  });
  await page.locator(".search__result").first().click();
  await expect(page.locator("#place-insights")).toHaveClass(/is-open/);
  await expect(
    page.getByRole("button", { name: "Download observation JSON" })
  ).toBeDisabled();
  await scan(page, "place-observation-export");
});

test("providers modal is axe-clean", async ({ page }) => {
  await page.locator("#providers-link").click();
  await expect(page.locator("#providers-page")).toHaveClass(/is-open/);
  await scan(page, "providers");
});

test("software finder is axe-clean", async ({ page }) => {
  await page.locator("#software-link").click();
  await expect(page.locator("#software-page")).toHaveClass(/is-open/);
  await scan(page, "software finder");
});

test("fleet dashboard is axe-clean", async ({ page }) => {
  await page.locator("#fleet-link").click();
  await expect(page.locator("#fleet-page")).toHaveClass(/is-open/);
  await scan(page, "fleet dashboard");
});

test("shortcuts overlay is axe-clean", async ({ page }) => {
  await page.locator("#shortcuts-link").click();
  await expect(page.locator("#shortcuts-page")).toBeVisible();
  await scan(page, "shortcuts");
});

test("viewport meta never disables pinch-to-zoom (WCAG 1.4.4)", async ({
  page,
}) => {
  const content = await page
    .locator('meta[name="viewport"]')
    .getAttribute("content");
  expect(content).not.toMatch(/user-scalable\s*=\s*(no|0)/i);
  expect(content).not.toMatch(/maximum-scale/i);
});

test("comparison mode is axe-clean", async ({ page }) => {
  await page.locator(".compare-button").click();
  await expect(page.locator(".compare-divider")).toBeVisible();
  await scan(page, "compare");
});

/**
 * Every keyboard stop must show the app's own focus ring (WCAG 2.4.7).
 *
 * Controls that declare no `:focus-visible` outline inherit the browser
 * default, which resolves to a ~1px near-black ring in BOTH themes because the
 * page declares no `color-scheme`. On the dark glass panels that ring is
 * effectively invisible, so a keyboard user loses their place. axe cannot see
 * this — it does not evaluate rendered focus indicators — hence the explicit
 * walk. Accepts an outline on the stop itself or on the ancestor that carries
 * it via :focus-within (the search field wraps its input in a <label>).
 */
test("every keyboard stop paints an app-authored focus ring", async ({
  page,
}) => {
  const weak: string[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < 40; i += 1) {
    await page.keyboard.press("Tab");
    const stop = await page.evaluate(() => {
      const ringed = (el: Element): boolean => {
        const cs = getComputedStyle(el);
        return (
          (cs.outlineStyle !== "none" &&
            cs.outlineStyle !== "auto" &&
            parseFloat(cs.outlineWidth) >= 2) ||
          (cs.boxShadow !== "none" && /\d/.test(cs.boxShadow))
        );
      };
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      let node: Element | null = el;
      let hasRing = false;
      for (let up = 0; node && up < 3; up += 1) {
        if (ringed(node)) {
          hasRing = true;
          break;
        }
        node = node.parentElement;
      }
      const label =
        el.getAttribute("aria-label") ?? el.textContent?.trim().slice(0, 30);
      return {
        id: `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0]}`,
        label: label ?? "",
        hasRing,
      };
    });

    if (!stop) break;
    const key = `${stop.id}|${stop.label}`;
    if (seen.has(key)) break;
    seen.add(key);
    if (!stop.hasRing) weak.push(`${stop.id} "${stop.label}"`);
  }

  expect(
    seen.size,
    "expected the tab order to reach the app controls"
  ).toBeGreaterThan(10);
  expect(
    weak,
    `keyboard stops falling back to the browser default focus ring:\n  ${weak.join("\n  ")}`
  ).toEqual([]);
});

/**
 * An overlay toggle that is still fetching must say so. Five of the nine
 * overlays fetch their data on first enable and a sixth waits on the browser's
 * geolocation prompt; before this, the button looked the same the instant it
 * was clicked as it did once the data had landed — same pressed styling, no
 * ARIA state — so a slow network was indistinguishable from a dead control.
 *
 * Held delay well over the 150ms anti-flicker grace period, under the fetch's
 * own patience, so the assertion isn't racing either boundary.
 */
test("an overlay toggle reports that it is waiting on its data", async ({
  page,
}) => {
  let release: (() => void) | undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });

  await page.route("**/data/countries.geojson", async (route) => {
    await held;
    await route.continue();
  });

  await awaitAppInteractive(page);

  const borders = page.locator(".toolbar__item", { hasText: "Borders" });
  await expect(borders).toHaveAttribute("aria-pressed", "false");
  await expect(borders).not.toHaveAttribute("aria-busy", "true");

  await borders.click();

  // Waiting: busy for assistive tech, spinner for everyone else.
  await expect(borders).toHaveAttribute("aria-busy", "true");
  await expect(borders).toHaveAttribute("data-state", "pending");
  await expect(borders).toHaveAttribute("aria-pressed", "true");

  const spinner = await borders.locator(".toolbar__icon").evaluate((el) => {
    const ring = getComputedStyle(el, "::after");
    return { content: ring.content, width: ring.width };
  });
  expect(spinner.content, "a pending toggle draws the loader ring").not.toBe(
    "none"
  );

  // A second click while busy must not start a duplicate load, nor desync the
  // pressed state from what is actually drawn.
  await borders.click();
  await expect(borders).toHaveAttribute("aria-pressed", "true");
  await expect(borders).toHaveAttribute("aria-busy", "true");

  release?.();

  // Settled: the busy state clears and never lingers.
  await expect(borders).not.toHaveAttribute("aria-busy", "true");
  await expect(borders).not.toHaveAttribute("data-state", "pending");
  await expect(borders).toHaveAttribute("aria-pressed", "true");
});

test("the timeline says how current the layer is, and why it stops", async ({
  page,
}) => {
  await awaitAppInteractive(page);

  // Resting caption: the record end, and the lag that makes the newest month
  // trail the calendar. Its silence used to read as missing data.
  const status = page.locator("#timeline-status");
  await expect(status).toHaveText(/^Newest data: \w{3} \d{4}( · .+)?$/);
  await expect(status).toHaveAttribute("aria-live", "polite");
  await expect(status).toHaveAttribute("title", /published|has published/);

  // One line only — the row's reserved height is what stops the bottom HUD
  // from growing upward over the globe.
  const rowHeight = await status.evaluate(
    (el) => el.getBoundingClientRect().height
  );
  expect(rowHeight).toBeLessThanOrEqual(24);

  // The forward stepper is the gesture that hits the end of the record, so
  // it has to explain itself rather than just grey out.
  const next = page.locator(".timeline__step").nth(1);
  await expect(next).toBeDisabled();
  await expect(next).toHaveAttribute("aria-label", /is the newest published$/);

  // Stepping back off the end restores the plain label.
  await page.locator(".timeline__step").first().click();
  await expect(next).toBeEnabled();
  await expect(next).toHaveAttribute("aria-label", /^Next \w+ \(→\)$/);
});
