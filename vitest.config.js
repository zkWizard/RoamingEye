import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Default to a fast Node environment; suites that need the DOM can opt in
    // per-file with `// @vitest-environment jsdom`.
    environment: "node",
    include: ["test/**/*.test.js"],
    coverage: {
      provider: "v8",
      include: ["src/**/*.js"],
      // main.js is an imperative WebGL bootstrap with module-level side effects;
      // it can't be imported in a headless test without a GL context, so we
      // exclude it from coverage rather than report a misleading 0%.
      exclude: ["src/main.js"],
    },
  },
});
