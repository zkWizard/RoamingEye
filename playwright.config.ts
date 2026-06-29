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
  fullyParallel: true,
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
