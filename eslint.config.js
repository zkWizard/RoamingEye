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
        setTimeout: "readonly",
        URL: "readonly",
        URLSearchParams: "readonly",
        Buffer: "readonly",
        window: "readonly",
        document: "readonly",
        createImageBitmap: "readonly",
        OffscreenCanvas: "readonly",
        btoa: "readonly",
      },
    },
  },
  // A namespace import of three marks every export as used, so the vendor
  // chunk cannot tree-shake. Named imports keep one shared copy and drop
  // the renderers, loaders, and extras this app never touches.
  {
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "ImportDeclaration[source.value='three'] > ImportNamespaceSpecifier",
          message:
            'Import named exports from "three". A namespace import keeps the whole library in the bundle.',
        },
      ],
    },
  },
  // Prettier last: turn off all formatting-related lint rules so Prettier owns
  // formatting and the two tools never fight.
  prettier
);
