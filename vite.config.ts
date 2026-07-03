/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
  // Serve from a subpath when deploying (e.g. GitHub Pages project sites live
  // at /<repo>/). Dev and tests keep the root default.
  base: process.env.DEPLOY_BASE || "/",
  server: {
    host: true, // expose on the local network so you can test on a phone
    port: 5173,
  },
  test: {
    // Unit tests run in Node — they cover pure logic (math/geo/data), not
    // rendering. See CONTRIBUTING.md for what is and isn't unit-testable here.
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
