import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * Config for the visual-regression suite (e2e/visual.spec.ts), which the
 * base config ignores — visual diffs are ADVISORY (a separate
 * continue-on-error CI job), never part of the blocking e2e gate.
 *
 * Baselines are Linux (CI) renders: font rasterization differs per OS, so
 * comparing cross-OS is noise. Regenerate via the "Update visual baselines"
 * workflow (Actions tab) and commit the artifact — see CONTRIBUTING.md.
 */
export default defineConfig({
  ...base,
  // Chromium only: the base config also defines the cross-engine advisory
  // projects (webkit/firefox), whose own testMatch would survive the spread
  // and drag their suites into this job on engines it never installs.
  projects: base.projects?.filter((p) => p.name === "chromium"),
  testIgnore: [],
  testMatch: "**/visual.spec.ts",
  retries: 0,
  // Stable names (no platform suffix): the suite runs on Linux only.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    // Generous stability window: shots wait for two consecutive identical
    // frames, and cold-cache boots in CI (e.g. the annual land-cover
    // texture) can keep transients alive past the 5 s default. The loop
    // exits the moment the page settles, so the ceiling costs nothing on
    // healthy runs.
    timeout: 20_000,
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixels: 100,
    },
  },
});
