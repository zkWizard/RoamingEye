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
 * default. The page now declares `color-scheme`, so that default at least
 * tracks the theme — but it stays a ~1px UA-dependent hairline, which is not a
 * WCAG-grade indicator on the glass panels. Every stop must therefore paint the
 * app's own ring. axe cannot see this — it does not evaluate rendered focus
 * indicators — hence the explicit walk. Accepts an outline on the stop itself
 * or on the ancestor that carries it via :focus-within (the search field wraps
 * its input in a <label>).
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

test("the toast and offline banner announce, not just appear", async ({
  page,
  context,
}) => {
  await awaitAppInteractive(page);

  // Both regions must be RENDERED at rest. A live region hidden with
  // `hidden`/`display: none` is absent from the accessibility tree, so a
  // message written into it is never announced — seen but not heard.
  const banner = page.locator(".offline-banner");
  const toast = page.locator(".error-toast");
  await expect(banner).toHaveAttribute("role", "status");
  await expect(toast).toHaveAttribute("role", "alert");

  const restingDisplay = await page.evaluate(() =>
    [".offline-banner", ".error-toast"].map((sel) => {
      const el = document.querySelector(sel);
      // Tag the resting nodes so we can prove the message lands INSIDE the
      // region that was already there, rather than a fresh one appearing.
      el?.setAttribute("data-e2e-persistent", "1");
      return el ? getComputedStyle(el).display : "missing";
    })
  );
  expect(restingDisplay).toEqual(["block", "block"]);

  // Empty at rest: the region paints nothing until it has something to say.
  await expect(banner).toBeHidden();
  await expect(toast).toBeHidden();

  // Offline: the pill is inserted into the SAME status region.
  await context.setOffline(true);
  await expect(banner).toBeVisible();
  await expect(banner).toContainText("Offline");
  await expect(banner).toHaveAttribute("data-e2e-persistent", "1");

  await context.setOffline(false);
  await expect(banner).toBeHidden();
  await expect(banner).toHaveAttribute("data-e2e-persistent", "1");

  // Same contract for the alert region on an uncaught failure.
  await page.evaluate(() => {
    setTimeout(() => {
      throw new Error("e2e live-region failure");
    }, 0);
  });
  await expect(toast).toBeVisible();
  await expect(toast).toContainText("e2e live-region failure");
  await expect(toast).toHaveAttribute("data-e2e-persistent", "1");

  await toast.locator(".error-toast__close").click();
  await expect(toast).toBeHidden();
  await expect(toast).toHaveAttribute("data-e2e-persistent", "1");
});

/**
 * The browser paints widgets we never style: the scrollbars on the layer list,
 * search results, toolbar and modal bodies; the native <select> popups in the
 * software finder; the search field's clear button and text caret. Those follow
 * `color-scheme`, and a page that declares none gets the light rendering — a
 * white scrollbar on the dark glass, a black-on-white popup over a dark panel.
 *
 * It must track `data-theme` (what the user picked), NOT `prefers-color-scheme`
 * (what their OS prefers) — those disagree the moment anyone uses the toggle,
 * and headless CI reports light while the app boots dark, so a media-query
 * implementation would fail exactly here.
 */
test("UA widgets follow the chosen theme, not the OS preference", async ({
  page,
}) => {
  const scheme = () =>
    page.evaluate(() => ({
      theme: document.documentElement.getAttribute("data-theme"),
      colorScheme: getComputedStyle(document.documentElement).colorScheme,
    }));

  // beforeEach booted dark. CI's OS preference is light, so this also proves
  // the declaration is attribute-driven rather than media-driven.
  expect(await scheme()).toEqual({ theme: "dark", colorScheme: "dark" });

  // Flipping the theme must carry the UA chrome with it.
  await page.locator(".theme-toggle").click();
  await expect.poll(async () => (await scheme()).theme).toBe("light");
  expect(await scheme()).toEqual({ theme: "light", colorScheme: "light" });

  await page.locator(".theme-toggle").click();
  await expect.poll(async () => (await scheme()).theme).toBe("dark");
  expect(await scheme()).toEqual({ theme: "dark", colorScheme: "dark" });
});

/**
 * `theme-color` paints the chrome AROUND the page — a phone's address bar, the
 * desktop tab strip — so `color-scheme` cannot reach it. index.html keys its
 * first-paint guess to `prefers-color-scheme`; once the app knows the real
 * theme, exactly one tag must survive and it must match `--bg`.
 *
 * beforeEach seeds the stored theme dark while headless CI reports an OS
 * preference of light — the precise case where the two signals disagree, so the
 * unowned media-keyed pair resolves to the light colour over a dark page.
 */
test("browser chrome colour follows the chosen theme, not the OS", async ({
  page,
}) => {
  const chrome = () =>
    page.evaluate(() => {
      const tags = [
        ...document.head.querySelectorAll<HTMLMetaElement>(
          'meta[name="theme-color"]'
        ),
      ];
      return {
        count: tags.length,
        media: tags.map((t) => t.getAttribute("media")),
        content: tags[0]?.content ?? null,
        bg: getComputedStyle(document.documentElement)
          .getPropertyValue("--bg")
          .trim(),
      };
    });

  // One tag, no media query, coloured from the palette actually in force.
  const dark = await chrome();
  expect(dark.count).toBe(1);
  expect(dark.media).toEqual([null]);
  expect(dark.content).toBe(dark.bg);

  await page.locator(".theme-toggle").click();
  await expect
    .poll(async () => (await chrome()).content)
    .not.toBe(dark.content);

  // The flip re-colours it rather than accumulating a second tag.
  const light = await chrome();
  expect(light.count).toBe(1);
  expect(light.content).toBe(light.bg);
  expect(light.bg).not.toBe(dark.bg);
});

// --- Target size (WCAG 2.2 2.5.8 AA / 2.5.5 AAA) ---------------------------
// The AA floor of 24px applies to every pointer, so that check runs
// everywhere. The 44px guidance is scoped to coarse pointers in the
// stylesheet, so it has to be asserted under an emulated touch context —
// and how faithfully `hasTouch` maps onto the `pointer: coarse` media query
// is an engine detail, verified here only for Chromium (the required lane).
// The rule under test is plain `min-height`, which needs no cross-engine
// coverage, so the advisory WebKit/Firefox lanes skip rather than assert
// emulation behaviour that was never checked.

const TOUCH_TARGETS = [
  ".software-link",
  ".fleet-link",
  ".theme-toggle",
  ".share-button",
  ".export__button",
  ".compare-button",
  ".draw-button",
  ".layer-selector__trigger",
];

test.describe("touch target size", () => {
  test.skip(
    ({ browserName }) => browserName !== "chromium",
    "coarse-pointer emulation is only verified for Chromium"
  );
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test("chrome controls are at least 44px on a coarse pointer", async ({
    page,
  }) => {
    expect(
      await page.evaluate(() => matchMedia("(pointer: coarse)").matches),
      "emulation must actually select the coarse-pointer rules"
    ).toBe(true);

    const undersized = await page.evaluate((sels) => {
      const bad: string[] = [];
      for (const sel of sels) {
        const els = [...document.querySelectorAll<HTMLElement>(sel)];
        if (els.length === 0) bad.push(`${sel}: not rendered`);
        els.forEach((el, i) => {
          const r = el.getBoundingClientRect();
          if (r.width < 44 || r.height < 44)
            bad.push(
              `${sel}[${i}]: ${r.width.toFixed(1)}x${r.height.toFixed(1)}`
            );
        });
      }
      return bad;
    }, TOUCH_TARGETS);

    expect(undersized, "controls under the 44px touch guidance").toEqual([]);
  });

  // The steppers are the documented exception: they clear the AA floor but
  // cannot grow, because a 44px box would reach into the scrubber track above
  // them and swallow drags meant for the slider. Assert both halves of that
  // reasoning so a later "just make them 44 too" is caught here.
  test("timeline steppers clear AA without reaching the scrubber", async ({
    page,
  }) => {
    const geo = await page.evaluate(() => {
      const steps = [
        ...document.querySelectorAll<HTMLElement>(".timeline__step"),
      ].map((el) => el.getBoundingClientRect());
      const track = document
        .querySelector<HTMLElement>(".timeline__track")!
        .getBoundingClientRect();
      return {
        sizes: steps.map((r) => [r.width, r.height] as const),
        clearsTrack: steps.every((r) => r.top >= track.bottom),
        overlapEachOther: steps.some((a, i) =>
          steps.some((b, j) => j > i && a.right > b.left && b.right > a.left)
        ),
      };
    });

    for (const [w, h] of geo.sizes) {
      expect(w).toBeGreaterThanOrEqual(24);
      expect(h).toBeGreaterThanOrEqual(24);
    }
    expect(geo.clearsTrack, "steppers must not overlap the scrubber").toBe(
      true
    );
    expect(geo.overlapEachOther, "steppers must not overlap each other").toBe(
      false
    );
  });
});

test("the shortcuts badge meets the 24px AA target floor", async ({ page }) => {
  const box = await page.locator(".hint__shortcuts").boundingBox();
  expect(box).not.toBeNull();
  expect(box!.width).toBeGreaterThanOrEqual(24);
  expect(box!.height).toBeGreaterThanOrEqual(24);
});
