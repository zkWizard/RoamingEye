import { defineConfig } from "vite";
import { resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

// Resolve 3d-tiles-renderer (including the subpaths its sources self-import) to its ES sources
// instead of the prebuilt bundles, so the local fixes in patches/ (overlay dispose races,
// mipmapped overlay textures) apply. Each export's .d.ts sits beside its .js source.
const tilesPkg = resolve(import.meta.dirname, "node_modules/3d-tiles-renderer");
const tilesAliases = Object.entries(
  JSON.parse(readFileSync(`${tilesPkg}/package.json`, "utf8")).exports,
)
  .filter(([, e]) => typeof e?.types === "string")
  .map(([key, e]) => [key, resolve(tilesPkg, e.types.replace(/\.d\.ts$/, ".js"))])
  .filter(([, file]) => existsSync(file))
  .map(([key, file]) => ({
    find: new RegExp(`^3d-tiles-renderer${key.slice(1).replace(/[/.]/g, "\\$&")}$`),
    replacement: file,
  }));

export default defineConfig({
  resolve: {
    alias: tilesAliases,
  },
  // Pre-bundling would read the prebuilt bundles and skip the patched sources.
  optimizeDeps: { exclude: ["3d-tiles-renderer"] },
  build: {
    chunkSizeWarningLimit: 8000,
    rollupOptions: {
      input: {
        index: resolve(import.meta.dirname, "index.html"),
        cesium: resolve(import.meta.dirname, "cesium/index.html"),
        three: resolve(import.meta.dirname, "three/index.html"),
      },
    },
  },
});
