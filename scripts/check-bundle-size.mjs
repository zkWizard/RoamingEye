/**
 * Post-build bundle-size budget (issue #78). Fails the build when a JS chunk
 * outgrows its gzip budget, so bundle growth is a deliberate decision (bump
 * the numbers here in the same PR that justifies them), never an accident.
 *
 * Budgets vs. current (2026-07): app ~34 kB, three ~137 kB gzipped.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), "dist", "assets");
const BUDGETS_KB = {
  // App code — everything that isn't the vendor or terrain chunk.
  // Search loads in its own chunk, so encoding the place hash on each view
  // write leaves the entry chunk at 56.3 kB gzip, inside the 60 kB cap.
  app: 60,
  // three.js vendor chunk: changes only on dependency bumps, caches long.
  three: 170,
  // 3d-tiles-renderer, loaded on demand with the terrain globe.
  // Measured 37.6 kB gzip (2026-10-26); the headroom is for a patch, not a feature.
  terrain: 40,
};

const chunks = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
if (chunks.length === 0) {
  console.error("check-bundle-size: no JS chunks in dist/assets — build first");
  process.exit(1);
}

let failed = false;
let totalKb = 0;
for (const file of chunks) {
  const gzKb = gzipSync(readFileSync(join(ASSETS, file))).length / 1024;
  totalKb += gzKb;
  const budgetKb = file.startsWith("three-")
    ? BUDGETS_KB.three
    : file.startsWith("terrain-")
      ? BUDGETS_KB.terrain
      : BUDGETS_KB.app;
  const ok = gzKb <= budgetKb;
  if (!ok) failed = true;
  console.log(
    `${ok ? "ok " : "FAIL"} ${file}: ${gzKb.toFixed(1)} kB gzip (budget ${budgetKb} kB)`
  );
}
console.log(`     total JS: ${totalKb.toFixed(1)} kB gzip`);

if (failed) {
  console.error(
    "check-bundle-size: budget exceeded — split/trim the code, or raise the budget deliberately in scripts/check-bundle-size.mjs"
  );
  process.exit(1);
}
