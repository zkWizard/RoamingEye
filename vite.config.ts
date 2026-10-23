/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import pkg from "./package.json";

// 3d-tiles-renderer resolves to its ES sources rather than its prebuilt bundles,
// so the fixes in patches/ (applied by patch-package on install) take effect.
// Its sources self-import package subpaths, so every export is aliased; each
// export's .d.ts sits beside its .js source.
const tilesPkg = resolve(import.meta.dirname, "node_modules/3d-tiles-renderer");
const tilesExports = JSON.parse(
  readFileSync(`${tilesPkg}/package.json`, "utf8")
).exports as Record<string, { types?: string }>;
const tilesAliases = Object.entries(tilesExports)
  .filter(([, e]) => typeof e?.types === "string")
  .map(([key, e]) => ({
    find: new RegExp(
      `^3d-tiles-renderer${key.slice(1).replace(/[/.]/g, "\\$&")}$`
    ),
    replacement: resolve(tilesPkg, e.types!.replace(/\.d\.ts$/, ".js")),
  }))
  .filter(({ replacement }) => existsSync(replacement));

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
  resolve: { alias: tilesAliases },
  // Pre-bundling would read the prebuilt bundles and skip the patched sources.
  // three is excluded too, or the patched sources would import a second copy.
  optimizeDeps: { exclude: ["3d-tiles-renderer", "three"] },
  server: {
    host: true, // expose on the local network so you can test on a phone
    port: 5173,
  },
  build: {
    // three.js alone minifies past vite's 500 kB default; 600 keeps the
    // warning meaningful (it fires again if the vendor chunk keeps growing).
    chunkSizeWarningLimit: 600,
    rolldownOptions: {
      // rolldown >=1.2.5 defaults chunk optimization on, which hoists modules
      // shared by lazy panels into the entry chunk (+35 kB gzip, past the app
      // budget). Keep lazy-only code in lazy chunks so first paint stays lean.
      experimental: {
        chunkOptimization: false,
      },
      output: {
        // Isolate three.js (the bulk of the bundle) into its own long-cached
        // chunk, so app-code changes don't re-download the renderer.
        // Budgets enforced post-build by scripts/check-bundle-size.mjs.
        advancedChunks: {
          groups: [
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            // The streamed terrain/imagery globe: vendor code, cached like three.
            {
              name: "tiles",
              test: /node_modules[\\/]3d-tiles-renderer[\\/]/,
            },
            // The sampler, the probe chart's notes and the overlays' hover
            // context: loaded at boot, but not needed to draw the first frame.
            // They used to sit in chunks shared with the old place panel; once
            // that panel stopped importing them, the bundler folded them into
            // the entry, which then crossed its budget although fewer bytes
            // load at boot. Naming them keeps the split deliberate.
            {
              name: "science",
              test: /src[\\/](probe[\\/]ProbeSampler|lib[\\/](aerosolLoading|averagedRampCensoring|briefValueUncertainty|coverageAdequacy|geojson|gldasRampSaturation|lstRampCensoring|marineAveragedSstCensoring|marineCoverage|net|plateBoundaryHover|plates|probeRetrievalFailure|seawaterFreezingPoint|seismicFixedDepth|seismicNetworkGeometry|snowCover|snowCoverIllumination|spatialSupport|sstNativeSupport|sstObservingConstraints|sstRampCensoring|validation|vegetationObservingConstraints|volcanoContext))\.ts$/,
            },
          ],
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
