/**
 * Post-build bundle-size budget (issue #78). Fails the build when a JS chunk
 * outgrows its gzip budget, so bundle growth is a deliberate decision (bump
 * the numbers here in the same PR that justifies them), never an accident.
 *
 * Budgets vs. current (2026-11-22, #638): app 35.1 kB, three 142.5 kB,
 * terrain 36.6 kB gzipped. The July 2026 header said app ~34 kB and
 * three ~137 kB, which no longer matches a build.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const ASSETS = join(process.cwd(), "dist", "assets");
const BUDGETS_KB = {
  // App code, everything that isn't the vendor or terrain chunk.
  // Measured 35.1 kB gzip for the entry after the first-frame deferrals.
  // The cap is that size plus 3 kB, and it does not go below 50.
  app: 50,
  // three.js vendor chunk. Measured 142.5 kB gzip on 2026-11-22 after
  // named imports, with GLTFLoader moved to the lazy tiles-extras chunk.
  // The cap is that size plus 5 kB, rounded up to a whole number.
  three: 148,
  // 3d-tiles-renderer, loaded on demand with the terrain globe.
  // Measured 37.6 kB gzip (2026-10-26); the headroom is for a patch, not a feature.
  terrain: 40,
  // Lazy OSM building extrusions (OpenFreeMap vector tiles).
  buildings: 28,
};

const chunks = readdirSync(ASSETS).filter((f) => f.endsWith(".js"));
if (chunks.length === 0) {
  console.error("check-bundle-size: no JS chunks in dist/assets — build first");
  process.exit(1);
}

// One three.js copy. Named imports from "three" and the vendor chunk share
// a single module graph. A second copy (a deep import of three.module.js,
// or the sources and the build both ending up in the graph) breaks
// `instanceof` across chunks. The engine stamp is written once per
// WebGLRenderer constructor.
const engineStamp = /three\.js r\d+/g;
const threeChunks = chunks.filter((file) => file.startsWith("three-"));
const stampHits = [];
for (const file of chunks) {
  const text = readFileSync(join(ASSETS, file), "utf8");
  const found = text.match(engineStamp);
  if (found) stampHits.push({ file, count: found.length });
}
const stampCount = stampHits.reduce((sum, hit) => sum + hit.count, 0);
if (threeChunks.length !== 1 || stampCount !== 1) {
  console.error(
    `check-bundle-size: expected one three chunk and one three.js engine stamp, found ${threeChunks.length} chunk(s) and ${stampCount} stamp(s) (${stampHits
      .map((hit) => `${hit.file} x${hit.count}`)
      .join(", ")})`
  );
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
      : file.startsWith("buildings-")
        ? BUDGETS_KB.buildings
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
