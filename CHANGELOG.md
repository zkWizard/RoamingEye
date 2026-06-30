# Changelog

All notable changes to RoamingEye. The project is pre-1.0 and moving fast; this
log captures milestones rather than every commit. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

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
- Project docs: README, `ARCHITECTURE.md`, `DATA_SOURCES.md`, `ROADMAP.md`,
  `docs/adding-a-data-layer.md`, and `RFC-001` (tiled imagery streaming).
- Governance & CI: contributing/governance/security docs, DCO, GitHub Actions
  (lint, type-check, unit, build, e2e), branch protection.

### Changed

- Migrated to TypeScript; consolidated the toolchain.
- Enabled zoom with a near-surface camera near-plane.

## [0.1.0] — MVP

- Grab-to-rotate 3D Earth with NASA Blue Marble imagery.
