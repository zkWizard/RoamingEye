import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  {
    ignores: ["dist/", "node_modules/", "playwright-report/", "test-results/"],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
  },
  // Node-run build scripts (plain JS) get Node globals. The browser globals
  // (`window`, canvas/decode APIs) appear only inside Playwright page
  // callbacks, which execute in the browser.
  {
    files: ["scripts/**/*.{js,mjs}"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        URL: "readonly",
        Buffer: "readonly",
        window: "readonly",
        document: "readonly",
        createImageBitmap: "readonly",
        OffscreenCanvas: "readonly",
        btoa: "readonly",
      },
    },
  },
  // Prettier last: turn off all formatting-related lint rules so Prettier owns
  // formatting and the two tools never fight.
  prettier
);
