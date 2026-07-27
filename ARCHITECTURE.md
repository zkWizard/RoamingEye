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

No Three.js and no DOM: every module here is a pure function or a data model,
so it unit-tests directly and ports anywhere. It is also by far the biggest
directory in the tree — **176 modules** — which is a lot to walk into cold, so
this section is a map rather than a full listing.

#### Wired into the app

These 42 modules are reachable from `src/main.ts`. Changing one changes what a
visitor sees. Everything outside `src/lib/` — `textures/`, `scene/`,
`overlays/`, `ui/` — is wired in its entirety.

**Geometry & projection**

| File              | Responsibility                                                                                                          |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `geo.ts`          | lat/lng ↔ 3D vector projection (and its inverse), great-circle distance. Calibrated to align overlays with the imagery. |
| `geojson.ts`      | Flatten GeoJSON geometries into polylines; geometry bounds and sampling plans.                                          |
| `countryIndex.ts` | Point-in-country/admin-1 lookup (bbox prefilter + ray casting) for the hover readout.                                   |
| `imagery.ts`      | High-res region helpers: bounded region builder, legal longitude bounds, antimeridian splitting.                        |
| `tiles.ts`        | WMTS tile addressing — tile spans, degrees-per-pixel per level.                                                         |
| `navigation.ts`   | Fly-to camera distance and rotate-speed heuristics.                                                                     |
| `viewState.ts`    | Encode/decode camera + view state for shareable deep links.                                                             |

**Time, catalog & session**

| File                | Responsibility                                                                    |
| ------------------- | --------------------------------------------------------------------------------- |
| `timeline.ts`       | The temporal model: layer catalog, year/month math, dataset refs, slider mapping. |
| `freshness.ts`      | Discover each layer's latest available date from the GIBS domains document.       |
| `sceneSelection.ts` | Cloud/coverage-aware "clearest pass" selection for the study patch.               |
| `sessionState.ts`   | Serialize/parse session state so a reload restores where you were.                |

**Probe, colormaps & statistics**

| File          | Responsibility                                                                                      |
| ------------- | --------------------------------------------------------------------------------------------------- |
| `probe.ts`    | Pixel↔lat/lon, colormap LUT construction, and the colormap inversion behind the point time series.  |
| `colormap.ts` | GIBS colormap metadata — parses the documents that map each ramp color to its data value and units. |
| `legend.ts`   | Gradient and class legend specifications for the in-app legend.                                     |
| `numerics.ts` | Neumaier compensated summation — order-independent accumulation for every scientific average.       |
| `trend.ts`    | Seasonal Mann–Kendall test and Sen's slope estimator.                                               |
| `compare.ts`  | Split-view comparison: clamping, pointer-to-split mapping, captions.                                |

**Domain datasets**

| File                                                    | Responsibility                                                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------- |
| `climate.ts`, `meteorology.ts`                          | Climate metric definitions, coverage, and rendered-sample → observations. |
| `marineCoverage.ts`, `marinePlaceInsight.ts`            | Sea-surface-temperature footprint/coverage and per-boundary readings.     |
| `landCover.ts`, `landCoverPalette.ts`                   | IGBP land-cover classes and decoding of rendered palette pixels.          |
| `terrainContext.ts`                                     | Terrain layer context for the readout.                                    |
| `earthquakes.ts`                                        | USGS earthquake feed model (parsing, filters, summaries).                 |
| `volcanoes.ts`, `volcanoContext.ts`, `volcanoExtent.ts` | Smithsonian GVP volcano model, selection facts, and in-extent lookup.     |
| `plates.ts`                                             | Plate-boundary parsing.                                                   |
| `cities.ts`                                             | Natural Earth populated places — parsing, hover labels, label density.    |

**Provenance & export**

| File                        | Responsibility                                                                        |
| --------------------------- | ------------------------------------------------------------------------------------- |
| `placeInsights.ts`          | Place metric definitions, readings, and sampling provenance.                          |
| `placeObservationExport.ts` | The provenance-stamped CSV export schema.                                             |
| `citation.ts`               | BibTeX / RIS / plain-text citations for the tool and each dataset.                    |
| `providers.ts`              | Catalogue of the open EO data ecosystem, with how each source relates to the project. |

**Platform**

| File                 | Responsibility                                                              |
| -------------------- | --------------------------------------------------------------------------- |
| `net.ts`             | Resilient fetch (timeout + bounded backoff + abort) used by all data calls. |
| `geocoding.ts`       | OpenStreetMap Nominatim client, with an LRU cache and a politeness gate.    |
| `perf.ts`            | Adaptive pixel ratio — trades resolution for frame rate on weak GPUs.       |
| `theme.ts`           | Light/dark theme resolution (DOM wiring lives in `ui/ThemeToggle.ts`).      |
| `shortcuts.ts`       | Keyboard/mouse bindings as data, for the `?` help overlay.                  |
| `textures.ts`        | Shared texture-loading options.                                             |
| `softwareCatalog.ts` | The open-source EO software catalogue (parsing, filtering, facets).         |
| `agentFleet.ts`      | Parses the agent-fleet status shown in the About panel.                     |

#### The library beyond the app surface

The other **134** modules in `src/lib/` are _not_ reachable from `src/main.ts`.
They are the project's science library — statistical tests, provenance and
citation checks, per-domain index calculations — written ahead of the UI that
would surface them. Of those 134, **108 are imported by nothing but their own
unit test**, and the remaining 26 only by each other. None are used by
`scripts/`, `contract/`, or the e2e suite.

They are unit-tested and generally sound. They are simply not connected yet.
Two things follow for contributors:

- **A module existing here does not mean it runs in the app.** Before building
  on one, follow its imports outward:

  ```bash
  grep -rn "from '.*/theModuleName'" src --include=*.ts | grep -v '\.test\.ts'
  ```

  If the only hit is its own test, it is not wired in.

- **Wiring one up is among the highest-impact changes available.** Surfacing an
  existing, tested module in the UI is a much smaller change than writing new
  science, and it moves something from the library into the product. Open an
  issue describing which module and where it would surface before starting, so
  the UI placement can be agreed first.

> Counts verified against the import graph on 2026-07-27. They drift as modules
> land, so re-derive them rather than trusting the numbers if precision matters.

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
