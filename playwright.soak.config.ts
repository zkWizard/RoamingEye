import { defineConfig, devices } from "@playwright/test";

/**
 * Config for the long-session soak suite (e2e/soak.spec.ts) — an advisory
 * leak canary, run as its own CI job so its several-minute runtime and
 * settling-in period never block the e2e gate. Same SwiftShader setup as
 * the main config; see that file for the rationale.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/soak.spec.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: 0, // a leak that flakes is still a finding — no retries
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

  webServer: {
    command: "npm run build && npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
