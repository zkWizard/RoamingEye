/// <reference types="vitest/config" />
import { defineConfig } from "vite";

export default defineConfig({
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
