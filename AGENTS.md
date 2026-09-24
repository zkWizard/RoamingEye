# AGENTS.md

## Cursor Cloud specific instructions

RoamingEye is a **single, frontend-only** app: a Vite + TypeScript + three.js
WebGL 3D Earth. There is **no backend** — imagery and data are fetched directly
in the browser from open services (NASA GIBS, OpenStreetMap Nominatim, USGS),
which are CORS-open. Running and testing the app therefore requires outbound
network access to those services; with no network the globe still renders but
imagery tiles and search will fail.

Standard commands and their meaning are documented in `package.json` scripts and
`.github/CONTRIBUTING.md` — refer to those rather than duplicating them. Notes
below are the non-obvious bits.

### Running

- Dev server: `npm run dev` → http://localhost:5173 (Vite, hot reload).
- The Cloud Agent update script already runs `npm ci` and installs the
  Playwright Chromium browser, so dependencies are ready on boot; just start the
  dev server.

### Testing / gating

- `npm run verify` is the CI gate: typecheck, lint, `format:check`, unit tests
  (Vitest, `environment: node`), `catalog:check`, and build. It does **not**
  include the contract tests or the Playwright e2e suite.
- `npm run test:contract` is **network-touching by design** — it fetches live
  NASA GIBS colormap XML and compares against pinned scales. Failures here are
  usually upstream GIBS palette drift (or no network), **not** a code or
  environment problem, and it is not part of `verify`. CI runs it weekly.
- `npm run test:e2e` (Playwright, `--project=chromium`) builds and previews the
  production bundle on port **4173** and drives a headless browser. It forces
  software WebGL (SwiftShader) via Chromium flags, so there is no GPU
  requirement, but it does need network access to NASA GIBS. Requires the
  Playwright Chromium browser (installed by the update script).
- Unit tests run in Node and cover pure logic only (geo/math/data/state); DOM
  and rendering code is covered by the e2e suite. See `.github/CONTRIBUTING.md`.

### Gotchas

- Coarse land-only layers (e.g. Land surface temp, 1 km) look blocky when zoomed
  in very close, and ocean/no-data areas render solid black because the layer is
  land-masked. Panels may briefly show "Loading imagery…" while WMTS tiles
  stream in. This is expected data behavior, not a rendering bug.
- `npm run build` runs `scripts/check-bundle-size.mjs` and **fails** if the app
  JS chunk exceeds its gzip budget (the app chunk sits near its cap). If you add
  code the app imports, expect the budget check to be the thing that goes red.
- The Vite config emits a harmless warning about a JSON import without import
  attributes — safe to ignore.
