import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for RoamingEye's e2e smoke tests.
 *
 * These tests boot the real app in a headless browser and assert the things
 * that actually break a WebGL app in the wild: the page loads, a sized canvas
 * exists, a WebGL context is acquired, and nothing throws to the console.
 *
 * We force software WebGL (SwiftShader) via Chromium flags so rendering is
 * consistent across machines and CI — see CONTRIBUTING.md.
 */
export default defineConfig({
  testDir: "./e2e",
  // Visual regression and the long-session soak run as their own advisory
  // suites (playwright.visual.config.ts / playwright.soak.config.ts), never
  // in the blocking e2e gate.
  testIgnore: ["**/visual.spec.ts", "**/soak.spec.ts"],
  // Each page load prefetches the imagery cache, so run serially to avoid
  // network saturation making the suite flaky.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",

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
  // shippable artifact rather than the dev server.
  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
