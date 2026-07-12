# Roadmap

A living, public roadmap. Priorities shift with the science and the community —
propose changes via a PR or a [discussion](https://github.com/zkWizard/RoamingEye/discussions).
Items tagged 🌱 are good starting points; 🚩 marks flagship efforts where we'd
especially love help.

## 🎯 Goals — 2026

_Last updated: 2026-07-11._ The strategic goals we're steering by, beyond
individual features. Checked off as they land; the summary also lives in the
[README](README.md#-roadmap).

- [ ] 🚩 **Accurate absolute probe values** ([#170](https://github.com/zkWizard/RoamingEye/issues/170)) —
      invert the probe against GIBS's real colormaps (180–250 entries) instead of
      our decorative legend gradients, collapsing RMSE to the quantization floor
      for every calibrated layer. This makes the probe citable for absolute
      measurements, not just trends.
- [ ] **Research partnerships** — establish working contact with at least two
      PhD-level remote-sensing / Earth-observation research groups and let their
      workflows steer build direction (structured feedback, not just stars).
      The [feedback form](https://github.com/zkWizard/RoamingEye/issues/new?template=feedback.yml)
      and 15-minute-chat offer are the funnel.
- [ ] **NASA engagement** — get in contact with the NASA GIBS / ESDIS (and
      Worldview) teams: introduce the project, sanity-check our colormap-inversion
      approach with the people who publish the colormaps, and pursue a listing
      among GIBS ecosystem clients.
- [ ] **Citable software, end to end** — publish the v1.1.0 GitHub release,
      mint a Zenodo DOI, then submit a [JOSS](https://joss.theoj.org/) paper.
      (In progress: release notes drafted, `CITATION.cff` + statement of need shipped.)
- [ ] **Teaching adoption** — RoamingEye used in at least three university
      courses or classroom settings, with instructor feedback folded back into
      the roadmap.
- [ ] **Grow the layer catalogue** — fire/thermal anomalies and surface water,
      following [docs/adding-a-data-layer.md](docs/adding-a-data-layer.md).
- [ ] **Sentinel-2 at 10 m** — direct integration for the high-resolution study
      patch (RFC-001 follow-on).
- [ ] **A real contributor community** — at least five merged PRs from external
      contributors; keep a healthy shelf of 🌱 good-first-issues.
- [ ] **Verified on real devices** — a hands-on phone/tablet pass of the mobile
      layout and touch interactions.

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
- **Physical units & honest uncertainty** — six fraction-of-scale layers
  calibrated to physical units from GIBS colormap metadata, cos(lat)-weighted
  area means, quantization uncertainty stated everywhere, quantitative legends
  with value ticks.
- **Trend detection** — seasonal Mann-Kendall test + Sen's slope on the probe
  series, surfaced in the panel, the CSV, and as a trend line + confidence band
  on the chart (property-based tests included).
- **Drawn study regions** — draw a bounding box and chart an area-weighted
  index time-series for it.
- **Methods & citations** — [METHODS.md](METHODS.md) handbook, per-layer
  source-dataset DOIs end to end, BibTeX/RIS/DataCite export, `CITATION.cff`.
- **Mobile layout**, city labels, admin-1 hover readout, annual land cover
  layer, opt-in geolocation pin, one-click month steppers.

## 🔵 Now

- 🚩 **Accurate absolute probe values**
  ([#170](https://github.com/zkWizard/RoamingEye/issues/170)) — invert against
  GIBS's real colormaps; the biggest remaining accuracy improvement.
- **Release & citability residuals** — v1.1.0 GitHub release, Zenodo DOI.
- **Research & NASA outreach** — see [Goals](#-goals--2026).
- 🌱 More overlay polish (graticule labels).

## 🟢 Next

- **More scientific layers** — fire/thermal anomalies, surface water.
- 🌱 **Tile-edge polish for HD streaming** — skirts or matched edge vertices at
  LOD boundaries, better polar handling (RFC-001 follow-ons).
- **Sentinel-2 (10 m) direct integration** for the study patch.

## 🟣 Later

- **True 3D elevation terrain** (GEBCO bathymetry / SRTM topography).
- **Deeper time-series analytics** — change-point detection, region comparison.
- **Annotation & collaboration** — pin observations, share annotated views.
- **Offline/field mode** — cache a study region for use without connectivity.

## 🧭 Design tenets (won't change lightly)

- **100% open data**, properly attributed.
- **No mandatory backend** — keep it forkable and free to host.
- **Provenance everywhere** — every scene tagged with instrument + date.
- **Pure logic stays testable** — science separate from rendering.
