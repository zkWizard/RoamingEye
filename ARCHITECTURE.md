# Architecture

A tour of how RoamingEye is put together, for contributors. The guiding
principle: **keep pure logic separate from rendering and the DOM**, so the
science (geodesy, scene selection, time handling) is fast, portable, and
unit-tested, while Three.js and browser APIs stay at the edges.

## High-level shape

```
NASA GIBS / OpenStreetMap / Natural Earth   (open data, no backend)
                  │  fetch (CORS-open)
                  ▼
   src/lib/*        pure, unit-tested logic — no Three.js, no DOM
                  │
   src/textures/*   imagery loading, caching, LOD into GPU textures
   src/scene/*      Three.js scene helpers (camera fly-to, highlights, study patch)
   src/overlays/*   toggleable map overlays (grid, borders, cities, atmosphere)
   src/ui/*         DOM components (timeline, search, toolbar, hover tooltip)
                  │
   src/main.ts      composition root — wires everything to the render loop
```

There is **no server**. NASA GIBS serves imagery with permissive CORS, so the
browser streams it directly into WebGL textures.

## Directory guide

### `src/lib/` — pure logic (unit-tested)

Everything here is framework-free: no Three.js, no DOM, no network side effects
beyond `net.ts`. That makes it fast to test and easy to read in isolation.

**It is also much bigger than the table below.** `src/lib/` holds **199 modules**
(plus 206 test files) as of `9622783`, 2026-07-28. Listing them all here would
go stale quickly — the directory grows frequently. So this guide documents
the **44 modules the running app actually reaches**: the nine core ones first,
then the rest grouped by responsibility. The section after that explains how to
orient yourself among the other 155.

#### Start here — the core modules

| File                | Responsibility                                                                                                                            |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `geo.ts`            | lat/lng ↔ 3D vector projection (and its inverse), great-circle distance. The projection is calibrated to align overlays with the imagery. |
| `geojson.ts`        | Flatten GeoJSON geometries into polylines for rendering.                                                                                  |
| `countryIndex.ts`   | Point-in-country lookup (bbox prefilter + ray casting) for the hover readout.                                                             |
| `timeline.ts`       | The temporal model: layer catalog, year/month math, GIBS URLs, slider mapping.                                                            |
| `imagery.ts`        | High-res region helpers: bounded region builder, arbitrary-bbox WMS URLs.                                                                 |
| `sceneSelection.ts` | Cloud/coverage-aware "clearest pass" selection for the study patch.                                                                       |
| `navigation.ts`     | Fly-to camera distance heuristic.                                                                                                         |
| `geocoding.ts`      | OpenStreetMap Nominatim client.                                                                                                           |
| `net.ts`            | Resilient fetch (timeout + backoff retries + abort) used by all data calls.                                                               |

#### The rest of the wired surface — the other 35

Those nine are the spine. Another 35 modules are also reachable from
`src/main.ts`, and between them they cover most of what you would actually want
to change. They are grouped by responsibility below; each description comes from
the module's own doc comment, so the module is the authority if the two ever
drift.

**Time, catalog & session** — what the timeline shows and what survives a reload.

| File              | Responsibility                                                                                                     |
| ----------------- | ------------------------------------------------------------------------------------------------------------------ |
| `freshness.ts`    | Keeps the timeline current without a code change as NASA publishes each new month.                                 |
| `compare.ts`      | The A/B swipe-divider model — two months of one layer side by side (the core change-detection workflow).           |
| `sessionState.ts` | Cross-visit persistence of the working context (layer, month, overlays). `main.ts` owns the `localStorage` wiring. |
| `viewState.ts`    | Shareable view state encoded in the URL hash, so a specific view can be cited in a paper or message.               |
| `theme.ts`        | Light/dark resolution and toggling. DOM-free; `ui/ThemeToggle.ts` does the wiring.                                 |
| `shortcuts.ts`    | Keyboard and mouse controls as pure data, for the `?` help overlay. Must be kept matching the real bindings.       |

**Probe, colormaps & statistics** — turning rendered pixels back into numbers.

| File                          | Responsibility                                                                                                                 |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `probe.ts`                    | The point time-series probe: inverts a GIBS colormap to recover an approximate data value from a pixel.                        |
| `colormap.ts`                 | Parses the GIBS colormap XML that `PROBE_SCALES`' physical ranges were derived from; the weekly contract test re-derives them. |
| `legend.ts`                   | What the colors on the globe mean, per layer — gradients that approximate the GIBS colormaps without fetching them.            |
| `landCoverPalette.ts`         | Decodes a rendered MCD12Q1 pixel back to an IGBP land-cover class (or reports it unavailable).                                 |
| `trend.ts`                    | Nonparametric trend detection: seasonal Mann-Kendall for significance, Sen's slope for magnitude.                              |
| `numerics.ts`                 | Neumaier compensated summation, used for every scientific accumulation so arithmetic error stays out of published CSVs.        |
| `climate.ts`                  | Source-aware descriptions of supplied monthly climate observations, kept in the product's native units.                        |
| `climateConventionalUnits.ts` | Exact dimensional conversions to the units convention prefers (mm/day, °C) — no estimate or interpretation added.              |
| `meteorology.ts`              | Bridges sampled rendered imagery into the climate contracts, reversing display multipliers first.                              |

**Domain datasets & place context** — the science models behind the overlays and the search readout.

| File                    | Responsibility                                                                                                   |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `cities.ts`             | Natural Earth populated places; parsing only — `overlays/CitiesOverlay.ts` renders it.                           |
| `earthquakes.ts`        | USGS GeoJSON summary-feed model; `overlays/EarthquakesOverlay.ts` renders it.                                    |
| `volcanoes.ts`          | Smithsonian GVP Holocene volcanoes; `overlays/VolcanoesOverlay.ts` renders it.                                   |
| `plates.ts`             | Bird (2003) tectonic plate boundaries; `overlays/PlateBoundariesOverlay.ts` renders it.                          |
| `volcanoContext.ts`     | Source-limited context for a selected GVP marker — no hazard, risk, or forecast claims.                          |
| `volcanoExtent.ts`      | GVP volcanoes falling inside a searched extent: a spatial inventory, not a hazard assessment.                    |
| `landCover.ts`          | Boundary-level context for class-coded MCD12Q1 samples; counts classes rather than averaging them.               |
| `terrainContext.ts`     | Provenance and interpretation limits for the terrain view (shaded relief, not a calibrated elevation raster).    |
| `marineCoverage.ts`     | Coverage descriptions for the MODIS/Aqua SST layer — sampling context only.                                      |
| `marinePlaceInsight.ts` | A single source-aware SST reading for a searched boundary, deliberately kept apart from the terrestrial metrics. |
| `placeInsights.ts`      | The boundary-level vegetation / rainfall / soil / air metrics, carrying their sampling provenance.               |

**Provenance & export** — the parts that make a result citable.

| File                        | Responsibility                                                                                                     |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `citation.ts`               | BibTeX, RIS and CSL-JSON for the tool and its source datasets, each with a resolvable DOI (ESIP guidelines).       |
| `providers.ts`              | The catalogue of the open EO data ecosystem, kept as data so the in-app Providers page stays accurate.             |
| `placeObservationExport.ts` | The provenance-first JSON contract for sampled place observations — records boundary and products, never the user. |
| `softwareCatalog.ts`        | Validates the static open-software catalog before it reaches the public finder (`ui/SoftwareFinder.ts`).           |

**Geometry & rendering support**

| File                        | Responsibility                                                                                          |
| --------------------------- | ------------------------------------------------------------------------------------------------------- |
| `plateBoundaryRendering.ts` | Subdivides boundary polylines into great-circle segments. Render-only — it adds no source observations. |

**Platform & delivery** — how bytes reach the GPU, and how the app copes.

| File            | Responsibility                                                                                                        |
| --------------- | --------------------------------------------------------------------------------------------------------------------- |
| `tiles.ts`      | WMTS tile math for RFC-001 tiled streaming: the GIBS EPSG:4326 pyramid, matrix sizes, and edge-tile overhang.         |
| `textures.ts`   | Cancellable texture loading, so scrubbing across months stops paying for superseded downloads against a free service. |
| `perf.ts`       | Adaptive render resolution — trades pixel ratio for frame rate to stay interactive on weak GPUs and lab machines.     |
| `agentFleet.ts` | Parses the emitted fleet run status for the operator view (`ui/FleetDashboard.ts`).                                   |

#### Wired vs. staged modules — read this before picking a task

`src/lib/` contains two kinds of module, and telling them apart will save you a
lot of confusion:

- **Wired** — reachable by following `import` statements from `src/main.ts`.
  Changing one of these changes what a user sees in the browser.
- **Staged** — a self-contained, unit-tested analysis function that nothing in
  the app imports yet. It is real, reviewed, passing code; it simply has no call
  site on the critical path.

Measured at `9622783` (2026-07-28) by walking the import graph from
`src/main.ts`: **44 of 199 `src/lib` modules are wired, and 155 are staged.**
Every other source directory (`ui/`, `overlays/`, `scene/`, `textures/`,
`probe/`) is fully wired.

The staged set divides in two, and the halves are worth different things to you:

- **124 modules are imported by nothing but their own unit test.** Each is a
  self-contained function waiting for a call site.
- **31 more are imported only by other staged modules** — small clusters that
  already fit together but that the app does not enter. Wiring one of these
  generally means finding the cluster's entry point rather than a single function.

Nothing in `scripts/`, `contract/`, or the e2e suite reaches into the staged set
either, so a unit test really is the only thing exercising most of it.

For scale: between 2026-07-27 and 2026-07-28 `src/lib/` grew from 159 modules to
199 while the wired count went from 42 to 44. The staged set is where almost all
of the growth lands, which is exactly why this guide documents the wired surface
module by module and the staged one only by shape.

To check any single module, grep for imports of it:

```bash
# Is src/lib/degreeDays.ts wired into the app?
grep -rn "from '\./degreeDays'" src/ --include='*.ts'
```

No hits outside its own test file means it is staged.

This matters for two reasons. First, **if you edit a staged module, the app's
behaviour will not change** — the unit tests will prove your logic works, but
nothing will appear on the globe. That is worth knowing before you go looking
for your change in the browser. Second, it is a standing opportunity:
**connecting a staged module to the UI is one of the best-scoped contributions
available here.** The hard parts — the science, the edge cases, the tests — are
already done and reviewed; what is missing is a call site and a way to show the
result. If you want to try one, open an issue naming the module first so we can
agree where it belongs in the interface before you build it.

One practical thing to know before you start: wiring a module in is also the
moment its code begins counting against the app's 60 kB gzip bundle budget —
staged code is tree-shaken away, wired code is not — and the app chunk is
currently sitting on that cap, so the **Build** check will very likely flag it.
That is not a reason to skip the work; it is a reason to expect the red check
and raise it in the PR instead of quietly changing the budget. See
[The bundle budget](.github/CONTRIBUTING.md#the-bundle-budget--read-this-before-adding-code-to-the-app).

### `src/textures/`

- `GlobeTextureManager.ts` — loads NASA monthly composites at two resolutions
  (small prefetched previews for instant scrubbing, full-res on settle), with an
  LRU cache and disposal.

### `src/scene/`

- `CameraFlyer.ts` — eased camera animation to a lat/lon, handing back to OrbitControls.
- `LocationHighlight.ts` — search-result boundary outline + constant-size marker.
- `HoverInspector.ts` — raycasts the globe to drive the coordinate/country readout.
- `StudyRegion.ts` — the high-res draped patch: builds a curved sphere-segment mesh and textures it with the auto-selected clearest scene.

### `src/overlays/`

Each overlay implements the `MapOverlay` interface (`types.ts`): an `id`, a
`label`, an SVG `icon`, a Three.js `object`, and an optional lazy `ensureLoaded()`.
Adding a new overlay is just a new class in the registry — see
[`docs/adding-a-data-layer.md`](docs/adding-a-data-layer.md).

### `src/ui/`

Plain DOM components (no framework): `TimeSlider`, `LayerSelector`, `Toolbar`,
`SearchBox`, `StudyChip`, plus shared `icons.ts`.

### `src/main.ts`

The composition root: creates the renderer/scene/camera, instantiates the
overlays and UI, and runs the single `requestAnimationFrame` loop that ticks the
camera flyer, controls, and marker scaling before rendering.

## Rendering model

The globe is a static unit sphere at the origin; **the camera orbits it**
(OrbitControls), so overlays placed in world space stay aligned with the
imagery. Overlays and the study patch sit at slightly increasing radii
(1.001–1.004) to layer cleanly above the base without z-fighting; the camera's
near plane is small (0.01) so you can get right down to the surface.

## Testing

- **Unit (Vitest):** all of `src/lib/*` — math, projection, GeoJSON, scene
  scoring, URL builders. Fast and deterministic.
- **E2E (Playwright):** browser smoke (page loads, WebGL context, no console
  errors) plus feature checks (toolbar, hover). Search and high-res imagery hit
  third-party services and are verified manually rather than gated in CI.
- **Accessibility (axe-core):** every meaningful UI state (base, picker,
  probe, modals, compare — both themes) is scanned against the WCAG 2.x
  A/AA rule tags in the e2e job; serious/critical violations fail CI,
  moderate/minor log as advisory. The WebGL canvas is excluded (axe can't
  see into a pixel buffer); its accessible equivalents — coordinate
  readout, provenance line — are scanned DOM.

## Operations

The deployed site and its upstream data services can degrade without any
commit landing here, so a scheduled workflow
(`.github/workflows/health-check.yml`) probes them daily: the live GitHub
Pages site, a GIBS WMS GetMap (an XML body with HTTP 200 is a
ServiceException and counts as down), Nominatim (one policy-compliant
request), and the USGS feed. Two consecutive failures open a single issue
labeled `health`; the next green run closes it. Run it on demand from the
Actions tab (`workflow_dispatch`), including with an override site URL to
exercise the failure path.

A second scheduled workflow (`.github/workflows/catalog-check.yml`, weekly)
runs the **catalog contract test** (`contract/`, `npm run test:contract`):
every hard-coded GIBS layer identifier must still exist in the live WMTS
capabilities, with our tile-matrix set and a time dimension where we scrub
one — so an upstream rename or retirement files an issue before a user sees
a black globe. Contract tests are network-touching by design and never run
in the offline unit suite.

## Conventions

- TypeScript strict mode; pure functions for logic, classes for stateful
  scene/UI pieces.
- Network failures degrade gracefully (warn, never crash) — see `net.ts`.
- ESLint + Prettier enforce style; run `npm run format` before committing.
