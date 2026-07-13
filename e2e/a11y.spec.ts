import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { awaitAppInteractive } from "./boot";

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
  const viewport = page.viewportSize();
  if (!viewport) throw new Error("no viewport");
  await page.mouse.click(viewport.width / 2, viewport.height / 2);
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
