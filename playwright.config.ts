import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for RoamingEye's e2e tests.
 *
 * These tests boot the real app in a headless browser and assert the things
 * that actually break a WebGL app in the wild: the page loads, a sized canvas
 * exists, a WebGL context is acquired, and nothing throws to the console.
 *
 * The required CI job runs only the tests tagged `@smoke` (see
 * e2e/smoke-set.txt). `npm run test:e2e` still runs the whole Chromium
 * project; that suite is advisory and sharded, not a merge gate.
 *
 * We force software WebGL (SwiftShader) via Chromium flags so rendering is
 * consistent across machines and CI — see CONTRIBUTING.md.
 */
export default defineConfig({
  testDir: "./e2e",
  // Visual regression and the long-session soak run as their own advisory
  // suites (playwright.visual.config.ts / playwright.soak.config.ts), never
  // in the blocking e2e gate.
  // *.test.ts files in this directory are Vitest (the smoke-set guard and the
  // imagery fixture), not Playwright. The default match would load them.
  testIgnore: ["**/visual.spec.ts", "**/soak.spec.ts", "**/*.test.ts"],
  // Each page load prefetches the imagery cache, so run serially to avoid
  // network saturation making the suite flaky. CI gets its parallelism from
  // Playwright shards (separate machines), not from workers on one runner.
  // A shard takes a whole file, so a long file (a11y) sets the slow shard.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  // Sharded CI jobs set PLAYWRIGHT_BLOB_REPORT so a later job can merge one
  // report. Playwright names each zip report-<shard>.zip, so merging the
  // shard artifacts into one directory does not overwrite them. The required
  // smoke job keeps the GitHub reporter.
  reporter: process.env.CI
    ? process.env.PLAYWRIGHT_BLOB_REPORT
      ? [["blob", { outputDir: "blob-report" }], ["line"]]
      : "github"
    : "list",

  use: {
    baseURL: "http://localhost:4173",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        launchOptions: {
          args: [
            "--use-gl=angle",
            "--use-angle=swiftshader",
            "--enable-unsafe-swiftshader",
          ],
        },
      },
    },
    // Cross-engine lanes (advisory CI jobs, run with --project=webkit /
    // --project=firefox after `npx playwright install webkit firefox`).
    // Safari-class engines are the second-largest real audience and diverge
    // from Chromium exactly where element-level tests are blind — hit-testing,
    // stacking, font metrics (see the PR #180 stepper bug). Scoped to the
    // user-facing suites; the chaos + canary specs stay Chromium, where the
    // SwiftShader/WebGL assumptions they encode actually hold.
    {
      name: "webkit",
      testMatch: [
        "**/smoke.spec.ts",
        "**/features.spec.ts",
        "**/a11y.spec.ts",
        "**/webgl-fallback.spec.ts",
      ],
      use: { ...devices["Desktop Safari"] },
    },
    {
      name: "firefox",
      testMatch: [
        "**/smoke.spec.ts",
        "**/features.spec.ts",
        "**/a11y.spec.ts",
        "**/webgl-fallback.spec.ts",
      ],
      use: { ...devices["Desktop Firefox"] },
    },
  ],

  // Build and preview the production bundle, so e2e exercises the real
  // shippable artifact rather than the dev server. CI builds once, uploads
  // dist/, and sets E2E_SKIP_BUILD so every lane previews that artifact.
  // Local runs and the catalog fleet still build here.
  webServer: {
    command: process.env.E2E_SKIP_BUILD
      ? "npm run preview"
      : "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
