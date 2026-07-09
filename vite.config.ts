/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import pkg from "./package.json";

export default defineConfig({
  // Serve from a subpath when deploying (e.g. GitHub Pages project sites live
  // at /<repo>/). Dev and tests keep the root default.
  base: process.env.DEPLOY_BASE || "/",
  // The running app knows its own version — stamped into CSV/PNG exports so
  // research artifacts stay traceable to the software that produced them
  // (FAIR4RS R1.2). Single source of truth: package.json.
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  server: {
    host: true, // expose on the local network so you can test on a phone
    port: 5173,
  },
  build: {
    // three.js alone minifies past vite's 500 kB default; 600 keeps the
    // warning meaningful (it fires again if the vendor chunk keeps growing).
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      output: {
        // Isolate three.js (the bulk of the bundle) into its own long-cached
        // chunk, so app-code changes don't re-download the renderer.
        // Budgets enforced post-build by scripts/check-bundle-size.mjs.
        advancedChunks: {
          groups: [{ name: "three", test: /node_modules[\\/]three[\\/]/ }],
        },
      },
    },
  },
  test: {
    // Unit tests run in Node — they cover pure logic (math/geo/data), not
    // rendering. See CONTRIBUTING.md for what is and isn't unit-testable here.
    environment: "node",
    include: ["src/**/*.{test,spec}.ts"],
  },
});
