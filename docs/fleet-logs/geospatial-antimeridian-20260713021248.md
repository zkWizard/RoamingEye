# Geospatial lane: antimeridian geometry

- Task: `antimeridian-geometry`
- Branch: `codex/geospatial-antimeridian-20260713021248`
- Draft PR: https://github.com/zkWizard/RoamingEye/pull/204
- Base: `codex/platform-expansion-foundation`

## What changed

- Hardened Polygon and MultiPolygon searched-boundary bounds with a continuous short-arc longitude frame.
- Preserved point containment and grid generation across the antimeridian, including polygon holes.
- Split and stitched regional WMS source images before sampling antimeridian-spanning boundaries, then mapped pixels in the same continuous short-arc frame.
- Added focused regression and property coverage for normal geometries, seam bounds, containment, holes, MultiPolygon behavior, grid points, and regional pixel mapping.

## Validation

- `npm test -- --run src/lib/geojson.test.ts src/lib/probe.test.ts src/lib/imagery.test.ts` (3 files, 78 tests passed)
- `npm run typecheck` (passed)
- `npm run format:check -- src/lib/geojson.ts src/lib/geojson.test.ts src/probe/ProbeSampler.ts src/lib/probe.test.ts` (passed)
- `npm test` (45 files, 453 tests passed)
- `npm run lint` (passed)

## Limits

- This is a geometry and sampling hardening slice only; it adds no UI behavior and makes no scientific claims.
- The longitude model follows short-arc boundary edges at the antimeridian. Intentionally long-way global polygons are not expanded in this slice.
- Local validation used Node 20.18.0, below the repository engine range, and emitted engine warnings. The locked Rolldown optional binding had to be hydrated for Vitest on Windows.

## Next slice

Extend spatial sample coverage and resolution provenance for small, large, coastal, and missing regions while preserving antimeridian-safe geometry frames.
