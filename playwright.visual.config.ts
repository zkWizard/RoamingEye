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
  testIgnore: [],
  testMatch: "**/visual.spec.ts",
  retries: 0,
  // Stable names (no platform suffix): the suite runs on Linux only.
  snapshotPathTemplate: "{testDir}/__screenshots__/{arg}{ext}",
  expect: {
    toHaveScreenshot: {
      animations: "disabled",
      maxDiffPixels: 100,
    },
  },
});
