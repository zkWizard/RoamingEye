# RFC-001 — Tiled Imagery Streaming (Level-of-Detail Globe)

- **Status:** In progress — milestones 1–4 landed (`src/lib/tiles.ts` +
  `src/overlays/TiledImageryOverlay.ts`, the "HD tiles" toggle, now with
  quadtree screen-space-error LOD and horizon culling); milestones 5–6
  (parent-tile fallback, single-texture retirement) open for contributors
  (see the tracking issue).
- **Scope:** Large (flagship). A great project for a contributor or small group.
- **Champions wanted:** graphics / WebGL engineers, remote-sensing folks.

## Summary

Replace the single full-globe texture with a **quadtree of streamed image tiles
at multiple levels of detail (LOD)**, so the globe shows full native resolution
_wherever you are looking, at whatever zoom_ — Google-Earth / CesiumJS style —
instead of magnifying one coarse texture.

## Motivation

Today the entire Earth is painted with one ~2048-px equirectangular texture
(~20 km/pixel). Zooming in just magnifies those pixels, so everything is blurry
up close. The current **high-resolution study region** (a draped patch over a
searched area) is a deliberate, well-scoped stopgap — but it only sharpens _one
small area at a time_.

To make RoamingEye a true planetary microscope, imagery must **stream by view**:
load only the tiles visible at the camera's current zoom, at the right detail
level, and swap to finer tiles as the user zooms in.

NASA GIBS already serves exactly this via **WMTS** (Web Map Tile Service) with
named tile-matrix sets down to ~15 m, so the data side is ready.

## Background: what GIBS provides

- **WMTS** endpoint: `https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/...`
- Tiles are 512×512, addressed by `{TileMatrix}/{TileRow}/{TileCol}` within a
  named `TileMatrixSet` (e.g. `250m`, `31.25m`, `15.625m`). Each layer declares
  the finest matrix set it supports (its native resolution).
- EPSG:4326 (geographic) tiling maps cleanly onto a lat/lon sphere.

## Proposed design

### 1. Quadtree over the sphere

Tile the sphere in EPSG:4326: level 0 = a small number of root tiles covering
±90° lat / ±180° lon; each tile subdivides into 4 children. A tile owns a curved
sphere-segment mesh (we already build these in `StudyRegion`) covering its
lat/lon bounds, textured by its WMTS tile.

### 2. LOD selection by screen-space error

Each frame, for visible tiles, estimate the on-screen size of a texel. If a tile
is "too coarse" (texel >> 1 device pixel) and finer tiles exist for the active
layer, subdivide; if it's "too fine" for the current zoom, collapse back to the
parent. This is the standard screen-space-error (SSE) heuristic.

### 3. Frustum culling

Skip tiles outside the camera frustum and on the far side of the globe
(back-face: tile-centre normal facing away from the camera). Only request what's
visible.

### 4. Tile cache & loading

- An LRU cache of decoded tile textures, bounded by a memory budget; dispose on
  eviction (we already do this for the monthly composites).
- A small concurrency-limited request queue, prioritised by distance to the
  screen centre. Reuse `src/lib/net.ts` for resilience.
- Show a parent tile (coarser) while a child loads, so there are no blank gaps.

### 5. Temporal + layer dimensions

Tiles are keyed by `(layer, time, matrix, row, col)`. Scrubbing the timeline or
switching layers changes the key space; the cache and prefetch should stay warm
across small time steps.

## Suggested incremental milestones

1. **WMTS tile math** (pure, unit-tested): given camera lat/lon, zoom, and a
   tile-matrix set, compute the set of `(matrix, row, col)` tiles to load, plus
   each tile's lat/lon bounds. _This is the ideal first PR and needs no graphics._
2. **Single-level tiling** — render one fixed LOD level of visible tiles for the
   current layer (no subdivision yet). Proves the mesh + WMTS plumbing.
3. **Quadtree + SSE subdivision** — add adaptive LOD as the camera zooms.
4. **Frustum/back-face culling + prioritised loading queue.**
5. **Parent-tile fallback** (no blank gaps) and **cache budgeting.**
6. **Wire into the timeline/layer switching**; retire the single-texture path
   (or keep it as a far-zoom level 0).

## Alternatives considered

- **Bigger single texture** — a 16k texture is ~5 km/pixel and ~1 GB of GPU
  memory; still blurry and infeasible. Rejected.
- **Adopt CesiumJS** — full-featured, but heavyweight and a large dependency that
  would reshape the project. Worth discussing, but a focused custom tiler keeps
  RoamingEye lean and hackable. Open question.
- **Keep only study-region patches** — works for "study one place," not for
  free exploration at full detail. This RFC is the general solution.

## Risks / open questions

- **Memory** on mobile — strict budgets and aggressive eviction required.
- **Seams** between adjacent tiles at LOD boundaries — needs skirts or matched
  edge vertices.
- **Reprojection** — EPSG:4326 tiles distort near the poles; acceptable for v1.
- **CesiumJS vs custom** — a real fork in the road; let's decide together in the
  PR/discussion.

## How to get involved

Comment on the tracking issue, or open a PR against milestone 1 (the pure tile
math) — it's self-contained, fully testable, and unblocks everything else.
Discussion and refinements to this RFC are very welcome.
