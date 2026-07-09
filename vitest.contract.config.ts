import { defineConfig } from "vitest/config";

/**
 * Config for the network-touching contract tests (contract/**) — run weekly
 * by .github/workflows/catalog-check.yml and on demand via
 * `npm run test:contract`, never as part of the offline unit suite.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["contract/**/*.contract.test.ts"],
    testTimeout: 120_000,
    hookTimeout: 120_000,
  },
});
