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

**It is also much bigger than the table below.** `src/lib/` holds **159 modules**
(plus 166 test files) as of `eabc5ea`, 2026-07-27. Listing them all here would
go stale quickly — the directory grows frequently. So this guide documents
the **core modules on the app's critical path**, and the section below explains
how to orient yourself among the rest.

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

#### Wired vs. staged modules — read this before picking a task

`src/lib/` contains two kinds of module, and telling them apart will save you a
lot of confusion:

- **Wired** — reachable by following `import` statements from `src/main.ts`.
  Changing one of these changes what a user sees in the browser.
- **Staged** — a self-contained, unit-tested analysis function that nothing in
  the app imports yet. It is real, reviewed, passing code; it simply has no call
  site on the critical path.

Measured at `eabc5ea` (2026-07-27) by walking the import graph from
`src/main.ts`: **42 of 159 `src/lib` modules are wired, and 117 are staged.**
Every other source directory (`ui/`, `overlays/`, `scene/`, `textures/`,
`probe/`) is fully wired.

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
