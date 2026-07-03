# Changelog

All notable changes to RoamingEye. The project is pre-1.0 and moving fast; this
log captures milestones rather than every commit. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- **Probe v2: area averaging & anomaly view** — the probe now samples either
  the clicked point or the mean of a ~1° region (8×8 grid), and can chart the
  de-seasonalized anomaly (value minus that location's calendar-month mean) —
  droughts and trends without the seasonal cycle in the way. CSVs gain an
  `anomaly` column, record region bounds, and now write values on the layer's
  physical scale (snow-cover CSVs are really percent).
- **Comparison mode** — pin any month and sweep a draggable divider against
  the live timeline month: pre/post change detection (eruptions, droughts,
  decade-apart snowlines) on the same view, with the split included in PNG
  exports.
- **Tiled imagery streaming (RFC-001, milestones 1–4)** — an "HD tiles"
  toggle re-drapes the visible globe with GIBS WMTS tiles selected by
  **quadtree screen-space error**: fine at the nadir, coarser toward the
  limb, horizon-culled, up to each layer's native resolution (terrain
  reaches ~31 m). Pure, unit-tested tile math (`lib/tiles.ts`); parent-tile
  fallback is milestone 5.

## [0.2.0] — 2026-07-03 · the research-instrument release

### Added

- **Point time-series probe** — click anywhere on the globe to chart the active
  layer's value at that point across its full published record (up to 46 years,
  monthly), with a provenance-stamped CSV download. Values are reconstructed by
  inverting the layer's colormap on the streamed imagery and labeled
  approximate throughout.
- **Plate-tectonics context pack** — tectonic plate boundaries (Bird 2003) and
  ~1,200 Holocene volcanoes (Smithsonian Global Volcanism Program), colored by
  eruption recency, as toggleable overlays alongside the live earthquakes —
  the full plate-tectonics narrative on one globe.
- **A much richer dataset** — 9 scientific layers across vegetation, temperature
  (land/air/sea), water (precipitation, soil moisture), cryosphere, and
  atmosphere, in a grouped layer picker. Lagging products snap the timeline to a
  covered month.
- **Open-data Providers page** — an in-app catalogue of ~33 agencies, archives,
  and platforms across the open Earth-observation ecosystem.
- **Resilient networking** — timeouts, backoff retries, abort for all data calls.
- **High-resolution study regions** — search a place and a sharp ~30 m HLS
  true-colour patch drapes over it, driven by the timeline.
- **Cloud-aware scene selection** — automatically picks the clearest satellite
  pass for each month (probes candidate dates, scores coverage, Sentinel-2 →
  Landsat fallback), with provenance shown (instrument · date).
- **Place search** (OpenStreetMap) with camera fly-to and administrative-boundary
  highlight.
- **Overlay toolbar** — coordinate grid, national borders, cities, atmosphere.
- **Hover readout** — coordinates and country/territory under the cursor.
- **Real-time scrubbing** — prefetched previews for instant month changes, sharp
  imagery on settle.
- **Switchable layers** — vegetation (NDVI / EVI) and snow cover.
- **Resilient networking** — timeouts, backoff retries, and graceful degradation
  for all open-data calls.
- **Launch package** — README demo GIF (`scripts/capture-demo.mjs` regenerates
  it), five step-by-step [research recipes](docs/research-recipes.md), release
  notes, and community post drafts under `docs/launch/`.
- Project docs: README, `ARCHITECTURE.md`, `DATA_SOURCES.md`, `ROADMAP.md`,
  `docs/adding-a-data-layer.md`, and `RFC-001` (tiled imagery streaming).
- Governance & CI: contributing/governance/security docs, DCO, GitHub Actions
  (lint, type-check, unit, build, e2e), branch protection.

### Changed

- Migrated to TypeScript; consolidated the toolchain.
- Enabled zoom with a near-surface camera near-plane.

## [0.1.0] — MVP

- Grab-to-rotate 3D Earth with NASA Blue Marble imagery.
