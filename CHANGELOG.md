# Changelog

All notable changes to RoamingEye. This log captures milestones rather than
every commit. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

Two post-launch robustness rounds aimed at the standards a shared research
instrument is held to: policy citizenship, scientific correctness at the
edges, quantified honesty — and, in round two (#122–#128, PRs #129–#136),
adversarial verification of our own defenses.

### Round 5 highlights (#122–#128)

- **Status-aware retries** — definitive 4xx (a 404 month is a normal answer,
  asked ~550× per chart) fails fast without burning the retry budget;
  `Retry-After` on 429/503 overrides our backoff, capped at 30 s.
- **Property-based fuzzing** (fast-check) over every boundary parser — which
  caught **two real bugs in its first hour**: `Number()` throwing on exotic
  non-JSON values (feed parsers weren't total), and `#layer=toString`
  escaping the catalog guard because `in` walks the prototype chain (fixed
  with `Object.hasOwn`, both in URL hashes and stored sessions).
- **Enforced accessibility** — axe-core WCAG 2.x A/AA scans across seven app
  states in both themes; serious/critical violations fail CI. Its first run
  caught a real one (the layer-picker listbox had no accessible name).
- **Chaos e2e** — a seeded 60-action storm (scrub/switch/compare/draw/search
  mid-everything) with settle-healthy assertions and deterministic replay
  via `CHAOS_SEED`.
- **Weekly GIBS catalog contract check** — every hard-coded layer identifier,
  matrix set, and time dimension validated against NASA's live capabilities,
  with an auto-filed drift issue.
- **Visual-regression scaffolding (advisory)** — screenshot coverage of the
  scientific chrome with the canvas masked and the timeline frozen; a
  non-blocking CI job plus a baseline-update dispatch workflow.
- **Supply-chain gates** — `lockfile-lint` (registry + HTTPS + integrity)
  and a two-tier dependency-license allowlist enforcing "100% open".

Unit tests 293 → 314; e2e 24 → 33 (chaos + 7 axe states); plus 12 live
catalog contract assertions weekly.

### Round 4 (#105–#112)

#### Fixed

- **Antimeridian correctness** — a study region drawn across the dateline
  (Fiji, the Bering Strait) now charts the few degrees you swept, not a
  silent ~358° band around the rest of the planet: short-arc drag bounds,
  seam-safe grid sampling, an unambiguous CSV `# region:` header (RFC 7946
  west > east convention), and legal WMS boxes for near-dateline searches.
- **Fail fast on non-imagery responses** — GIBS WMS answers malformed
  requests with ServiceException XML under HTTP 200; that (and captive-portal
  HTML) is now caught at the fetch boundary with the actual exception message
  surfaced, instead of failing downstream as opaque decode errors.

#### Robustness

- **Offline awareness** — a quiet banner while disconnected, sub-millisecond
  fast-fail instead of burning 45 s of retries per request, and automatic
  view refresh on reconnect.
- **Nominatim policy compliance** — a single-flight gate guarantees ≤1
  request/second to the shared OSM geocoder (bursts collapse to the latest
  query), alongside the existing result LRU.
- **CI-enforced probe accuracy bounds** — every gradient legend now has
  quantified roundtrip-error guards (clean ≤0.01 of scale; documented
  per-layer bounds under JPEG-like noise), monotonicity and no-data
  separation checks; a legend edit that degrades chart/CSV accuracy fails CI
  naming the layer and the worst spot.
- **FAIR export provenance** — every probe CSV carries `# tool_version` and a
  `# view_url` deep link that reproduces the exact chart; PNG filenames carry
  the version; the Providers page names the running build (FAIR4RS R1.2).
- **Daily health check** — a scheduled workflow probes the live site and the
  upstream open-data services (GIBS, Nominatim, USGS) and files a single
  auto-closing issue after two consecutive failures.
- **CodeQL static analysis** — GitHub's security-and-quality suite on every
  PR plus a weekly re-scan, complementing `npm audit`'s dependency coverage.

Unit tests 222 → 293; e2e 23 → 24 (offline cycle, under the zero-pageerror
canary).

## [1.0.0] — 2026-07-08 · the launch release

Three same-day development rounds turned the viewer into a hardened research
instrument: an analysis flagship, nine capability features, and sixteen
robustness fixes — every one landed with tests (unit 164 → 222, e2e 4 → 23).

### Added

- **🚩 Drawn study regions with time-series charts** — arm "Draw region",
  drag a box on the globe, and the probe panel charts that region's monthly
  mean across the layer's full record, with the provenance-stamped CSV
  recording the exact bounds. The step from viewer to analysis tool.
- **Land cover (IGBP) layer** — MODIS MCD12Q1 annual classification
  (2001→2024): the catalog's first annual-cadence layer (the scrubber steps
  by year) and first categorical layer (the legend shows 18 named class
  swatches in GIBS's exact colors).
- **Hover identification** — city dots ("Tokyo · Japan") and volcano markers
  ("Etna · Stratovolcano · last erupted 2025") name themselves under the
  cursor; empty globe still reads coordinates + country.
- **In-app color keys** — toggling Quakes or Volcanoes adds a swatch key
  (depth classes / eruption recency) to the legend, sharing the exact
  constants the overlays render with.
- **City name labels at close zoom** (top 30 by population, far side culled),
  **keyboard-shortcuts overlay** (press ?), **probe copy-CSV button**, and
  **arrow-key navigation for the layer picker**.
- **Session restore** — layer, month, and enabled overlays persist across
  visits (a shared URL hash still wins).
- **Mobile layout** — the toolbar becomes a bottom app bar at phone widths;
  timeline year labels adapt to the track's real width.

### Robustness & performance

- **WebGL resilience** — a friendly explanation page when WebGL is
  unavailable, and in-place recovery from GPU context loss.
- **Failure visibility** — uncaught errors surface as a dismissible toast;
  imagery failures offer a Retry (fixing a latent bug where a failed month
  could never reload); search distinguishes "No matches" from "Search
  unavailable".
- **Resource discipline** — rendering pauses in hidden tabs; pixel ratio
  adapts under sustained low FPS; three.js ships as its own long-cached
  chunk (app payload 167 → 33 kB gzip) with size budgets enforced on every
  build; recent geocode queries serve from an LRU instead of re-hitting
  rate-limited Nominatim.
- **Accessibility** — modals trap and restore focus; camera flights respect
  prefers-reduced-motion.
- **Guarded foundations** — the bundled data files are validated by the real
  parsers in CI, and every feature e2e test doubles as an
  uncaught-exception canary.

### Earlier in this cycle

- **Give-feedback funnel** — a three-question feedback issue form (what you
  tried / what got in the way / what would bring you back, with an optional
  15-minute-call opt-in for researchers), linked from the in-app attribution
  bar and the README. Feedback issues are labeled `feedback` /
  `research-user`.
- **HD tile streaming on by default (RFC-001 complete, milestone 6)** — the
  quadtree tiler is now the primary rendering path (toolbar-toggleable as
  before); the single full-globe texture stays underneath as the far-zoom
  level 0. Scrubbing the timeline keeps the previous month's tiles draped
  until each replacement lands — no flash back to base resolution — and once
  a view settles, the adjacent months' tiles prefetch so stepping through
  time in HD is instant. In comparison mode, HD tiles (which stream the live
  month) are hidden on the pinned side of the divider so the "before" half
  never wears "after" imagery.
- **HD tiles: parent-tile fallback & cache budgeting (RFC-001, milestone 5)** —
  while a tile's own imagery loads, it shows the nearest cached coarser tile
  cropped to its footprint, so zooming refines progressively instead of
  opening holes; the tile-texture cache is now bounded by a GPU-memory budget
  scaled to the device (48–192 MiB), and on-screen textures are never evicted.

## [0.2.0] — 2026-07-03 · the research-instrument release

### Added

- **Analysis deep links** — the shareable URL now encodes an open probe
  (`probe=lat,lon`) and an active comparison pin (`pin=YYYY-MM`), so a link
  reproduces the whole analysis — chart, CSV and A/B divider included — not
  just the camera view.
- **Self-updating timeline** — at boot the app asks GIBS (WMTS
  DescribeDomains) for the newest published month and grows the timeline to
  it, so the deployed site stays current as NASA publishes new composites —
  no code bump required.
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
