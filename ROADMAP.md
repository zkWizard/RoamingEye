# Roadmap

A living, public roadmap. Priorities shift with the science and the community —
propose changes via a PR or a [discussion](https://github.com/zkWizard/RoamingEye/discussions).
Items tagged 🌱 are good starting points; 🚩 marks flagship efforts where we'd
especially love help.

## ✅ Shipped

- Grab-to-rotate 3D Earth with NASA imagery.
- Temporal scrubber across the last 5 years of monthly composites.
- Switchable layers (NDVI / EVI / snow).
- Real-time, crisp scrubbing (prefetched preview + sharp-on-settle).
- Place search → fly-to → administrative-boundary highlight.
- Overlay toolbar (grid, borders, cities, atmosphere).
- Hover coordinate + country readout.
- High-resolution study regions with **cloud-aware clearest-pass selection**.
- Resilient networking and graceful degradation.
- **Point time-series probe** — click anywhere → full-record chart + CSV with
  provenance (approximate colormap-inversion values, labeled as such), with
  ~1° area averaging and a de-seasonalized anomaly view.
- **Plate-tectonics context pack** — Bird 2003 plate boundaries + Smithsonian
  GVP Holocene volcanoes + live USGS seismicity.
- 🚩 **Tiled imagery streaming**
  ([RFC-001](docs/rfcs/RFC-001-tiled-imagery-streaming.md)) — quadtree
  screen-space-error LOD with parent-tile fallback and a GPU-memory-budgeted
  cache, **on by default**: native resolution wherever you look, the old
  single texture retained as the far-zoom level 0.
- **Comparison mode** — pin a month, sweep an A/B divider against the live
  timeline (split included in PNG export).
- **Full-record timeline** — every layer back to its first published month
  (2000, or 1980 for reanalysis), self-updating to the newest month at boot.
- **Shareable deep links** — layer/month/camera plus an open probe and
  comparison pin, all in the URL.
- **PNG image export** for figures and slides.

## 🔵 Now

- Hardening, documentation, and contributor onboarding.
- ✅ Visual-regression test scaffolding (advisory) — shipped: `e2e/visual.spec.ts`,
  the advisory `visual` CI job, and the baseline-update workflow.
- 🌱 More overlay polish (labels for cities/graticule; legends for index colour scales).

## 🟢 Next

- **More scientific layers** — land-cover classification, fire/thermal
  anomalies, surface water.
- **Drawn study regions** — draw a bounding box and chart an index time-series for
  it (mean NDVI per month over the years).
- 🌱 **Tile-edge polish for HD streaming** — skirts or matched edge vertices at
  LOD boundaries, better polar handling (RFC-001 follow-ons).

## 🟣 Later

- **True 3D elevation terrain** (GEBCO bathymetry / SRTM topography).
- **Time-series analytics** — trend fitting, change-point detection, region
  comparison.
- **Sentinel-2 (10 m) direct integration** for the study patch.
- **Annotation & collaboration** — pin observations, share annotated views.
- **Offline/field mode** — cache a study region for use without connectivity.

## 🧭 Design tenets (won't change lightly)

- **100% open data**, properly attributed.
- **No mandatory backend** — keep it forkable and free to host.
- **Provenance everywhere** — every scene tagged with instrument + date.
- **Pure logic stays testable** — science separate from rendering.
