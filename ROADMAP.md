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

## 🔵 Now

- Hardening, documentation, and contributor onboarding.
- Visual-regression test scaffolding (advisory).
- 🌱 More overlay polish (labels for cities/graticule; legends for index colour scales).

## 🟢 Next

- 🚩 **Tiled imagery streaming** — render full native resolution at any zoom,
  everywhere, not just in a study patch. See
  [RFC-001](docs/rfcs/RFC-001-tiled-imagery-streaming.md).
- **More scientific layers** — land-cover classification, land-surface
  temperature, fire/thermal anomalies, surface water.
- **Drawn study regions** — draw a bounding box and chart an index time-series for
  it (mean NDVI per month over the years).
- **Extend the timeline back to 2000** and stream the current month as NASA
  publishes it.
- 🌱 **Shareable deep links** — encode place/date/layer/zoom in the URL.
- 🌱 **Image export** — download the current view as a PNG for figures/slides.

## 🟣 Later

- **True 3D elevation terrain** (GEBCO bathymetry / SRTM topography).
- **Time-series analytics** — anomaly detection, trend fitting, region comparison.
- **Sentinel-2 (10 m) direct integration** for the study patch.
- **Annotation & collaboration** — pin observations, share annotated views.
- **Offline/field mode** — cache a study region for use without connectivity.

## 🧭 Design tenets (won't change lightly)

- **100% open data**, properly attributed.
- **No mandatory backend** — keep it forkable and free to host.
- **Provenance everywhere** — every scene tagged with instrument + date.
- **Pure logic stays testable** — science separate from rendering.
