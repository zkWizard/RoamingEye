# Changelog

All notable changes to RoamingEye. This log captures milestones rather than
every commit. Format loosely follows
[Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

- **Timeline month steppers** — a ‹ › button pair at the bottom-right of the
  controls panel steps the timeline one month (one year on annual layers)
  per click — precise moves the drag handle can't do on decades-long
  records. The buttons disable at either end of a layer's published range.

Round 8 (issues #182–#189; PRs #190–#197 + this wrap-up): **robustness as a
research instrument** — the failure modes, numerics, and honesty gaps a tool
must close before institutions rely on it. Grounded in WCAG 2.1, RFC 4180,
RFC 7946, OpenSSF guidance, GIBS's DescribeDomains API, and Higham's
_Accuracy and Stability of Numerical Algorithms_.

### Correctness & science

- **Numerically disciplined statistics** — every published accumulation
  (region means, full-record means, the climatology anomalies subtract from)
  now uses compensated (Neumaier) summation: error bound independent of
  series length, order-independent means, proven by fast-check properties
  against an exact BigInt reference. (#185)
- **Per-product timeline freshness** — the boot DescribeDomains check now
  verifies each product family separately (MOD13A3 → NDVI/EVI, MOD11C3 →
  LST, MOD10CM → snow) so a lagging product is never offered a leader's
  unpublished month; a latent `isAvailable` bug that compared every layer
  against the global latest is fixed. New weekly freshness contract. (#186)
- **Seam-stitched study patches** — a dateline-straddling study region
  (Taveuni, Attu) now issues two legal GetMaps and composites them into one
  centred texture instead of sliding the box off-target; scene selection
  scores all of the region's area. The codebase's last prose-TODO, retired.
  (#187)
- **RFC 4180-safe CSV exports** — provenance headers can no longer be torn
  into ragged cells by naive parsers: interpolated free text is scrubbed, the
  region line is delimiter-free, `# view_url` stays byte-exact by documented
  exception, and a strict-parser round-trip gate (with adversarial fast-check
  inputs) holds exports to the contract. METHODS.md documents the pandas/R
  loading recipe. (#184)

### Access & accountability

- **Pinch-to-zoom restored (WCAG 2.1 SC 1.4.4)** — the viewport meta no
  longer disables zoom, and the a11y gate gained an `ENFORCED_RULES`
  escalation so a named rule fails CI regardless of axe's impact grade — the
  loophole that let this violation scroll past as advisory noise is closed.
  (#182)
- **OpenSSF Scorecard** — continuous, published supply-chain health scoring
  (weekly + on main), surfacing regressions as code-scanning alerts, with the
  public score as a README badge. (#183)
- **Cancelled imagery downloads** — scrubbing no longer pays for superseded
  months: all three imagery paths moved to an abortable
  fetch → ImageBitmap pipeline wired to their existing invalidation guards,
  which also buys imagery the WMS ServiceException/offline fetch guards.
  Rendering is pixel-identical; aborts are silent by design. (#189)
- **Cross-engine e2e lanes** — WebKit and Firefox advisory CI jobs run the
  user-facing suites per PR. WebKit passed its full suite on day one —
  automated Safari-class signal at last; the Firefox lane exposed missing
  headless WebGL on CI runners (#198), exactly the kind of intelligence an
  advisory lane exists to gather. (#188)

## [1.1.0] — 2026-07-10

The first feature release since launch: two rounds of instrument-grade
science and documentation (below), plus a small, friendly UX touch —

- **"You are here" geolocation pin (opt-in)** — a **My location** toolbar
  toggle drops a red pin at the visitor's own location (the browser
  permission prompt is the consent gate — nothing is requested until you
  click) with a "You are here!" hover label. Denial reverts the toggle and
  explains why; the choice is never persisted, so a returning visitor is
  never silently re-prompted. ([#178](https://github.com/zkWizard/RoamingEye/pull/178))

Round 7 (issues #162–#168, #170; PRs #169, #173, #174, #171, #172, #176 +
the e2e-resilience fix #175 and this wrap-up): **instrument-grade methods** —
the statistical rigor, external validation, and documentation a tool needs to
be cited in the literature. Grounded in community practice: the seasonal
Mann-Kendall test (Hirsch & Slack 1982) and Sen's slope (Gilbert 1987), NDVI
validation practice (RMSE vs a reference), and ESIP's machine-readable
citation guidelines.

### Science

- **Trend detection — seasonal Mann-Kendall + Sen's slope** — the field-
  standard nonparametric trend test, with the seasonal correction that stops
  the annual cycle masquerading as a trend, plus Sen's slope (units/decade)
  and its 95% CI. Surfaced in the probe panel ("trend +0.18 NDVI/decade ·
  p = 0.004"), in `# trend_*` CSV headers, and drawn as a dashed slope line +
  CI band on the chart. Pure, unit- and property-tested. (#162, #163, #164,
  #168)
- **End-to-end inversion validation** — the probe's colormap inversion is now
  measured against GIBS's authoritative colormap and reported per layer:
  aerosol RMSE 0.13, SST 5.1 °C, soil 8.2 kg/m², air temp 19.0 K, precip
  20.4 mm/day, LST no-data. These are honest and, for several layers, poor —
  our legend gradients are coarse approximations, so absolute values on those
  layers carry large uncertainty and the probe is reliable there for
  _relative_ analysis. Published transparently in
  [docs/validation.md](docs/validation.md), CI-guarded against drift, with the
  accuracy fix tracked as #170. (#165)

### FAIR / citation

- **Machine-readable citations** — one-click BibTeX and RIS export for the
  tool and every source dataset (DOIs and all), per ESIP guidelines. (#166)
- **METHODS.md** — a methods & limitations handbook (probe pipeline, area
  weighting, uncertainty, the trend method, the measured inversion accuracy,
  and what the tool does _not_ do), drift-guarded so its figures track the
  code. (#167)

### Robustness

- **e2e resilience to third-party imagery failures** — the "no console
  errors" gates now tolerate transient NASA GIBS tile CORS/timeout hiccups
  (an upstream condition the app degrades gracefully around) while keeping
  genuine app exceptions strict. (#175)

Unit tests 351 → ~375 (trend, validation, citation, methods-doc, plus a
property suite); contract assertions extended with the weekly inversion-
accuracy check; CodeQL caught and we fixed a real incomplete-escaping bug in
the BibTeX generator.

### Round 6 (issues #147–#153, PRs #154–#161): science-grade rigor

Where earlier rounds hardened the app against the network and the
browser, this one holds the _numbers_ to the standard a reviewer would:
correct spherical statistics, physical units, stated uncertainty, and a
citation chain that reaches the datasets themselves. Grounded in community
practice — xarray's area-weighting guidance, NASA's data-citation policy,
GIBS's own machine-readable metadata, and JOSS review criteria.

### Fixed

- **Region means are no longer latitude-biased** — drawn-region and ~1° area
  probes averaged an equal-angle grid with equal weights, overweighting
  poleward rows by up to cos 30°/cos 70° ≈ 2.5× across a 30–70°N box (the
  canonical gridded-data mistake). Sample weights are now cos(latitude),
  carried through coarse-image pixel dedup; the ocean-box validity gate
  measures valid _area_; CSVs name the estimator in `# method:`. (#147)

### Science

- **Six layers upgraded from "fraction of color scale" to physical units** —
  land-surface temp (200–350 K), 2 m air temp (220–310 K), SST (0–32 °C),
  precipitation (0–43.2 mm/day), soil moisture (0–50 kg/m²), and aerosol
  optical depth (0–0.9) — derived from the colormap documents GIBS itself
  renders with, every ramp verified linear-in-value (worst deviation
  0.16 %). A weekly contract test re-derives all six from the live XML, so
  an upstream palette re-render fails CI instead of silently mis-scaling
  every probe. (#148)
- **Quantified uncertainty everywhere** — CSV decimals now follow the
  colormap quantization step instead of a fixed four; every export states
  `# uncertainty: ±<half-step>`; the probe panel says "±0.002 per value"
  right where the numbers are; area/region CSVs gain a `valid_fraction`
  coverage column, so a 25 %-valid month no longer prints like a full
  one. (#149)
- **Quantitative legends** — gradient bars gained min/mid/max value ticks in
  physical units, from the same scales the probe reports (legend and probe
  can never disagree); uncalibrated layers show no ticks rather than fake
  ones. (#150)

### FAIR / citation

- **Cite the data, not the picture** — every layer (plus the HLS study
  patch) now pins its source dataset (short name, version, DOI — resolved
  live via GIBS layer-metadata → CMR): CSVs carry `# data_product` /
  `# data_doi` headers, the providers page gained a "Citing the data"
  section with GIBS's requested acknowledgment verbatim, and a weekly
  contract test verifies the layer→product mapping and that every DOI
  still resolves. (#151)
- **README: "Citing RoamingEye and its data"** — the three citable objects
  spelled out (tool / imagery service / datasets), a per-dataset DOI table
  drift-guarded by a unit test against the layer config, and a JOSS-style
  statement of need. (#152)

### Robustness

- **Long-session soak (advisory)** — a leak canary for field-day sessions:
  repeated working cycles (layer switches, scrubs, probes, overlay
  toggles) must leave the renderer's GPU-resource counters within a fixed
  budget of the post-boot baseline, with no late-session compounding.
  Own CI job + `npm run test:soak`; first CI run measured 14 → 35 textures
  over 6 cycles against a budget of 80. (#153)

Unit tests 314 → 351; live contract assertions 22 → 44 (probe scales +
data citations, weekly); one new advisory CI job; visual baselines
regenerated for the legend's new value-tick row.

## [1.0.1] — 2026-07-09

Two post-launch robustness rounds aimed at the standards a shared research
instrument is held to: policy citizenship, scientific correctness at the
edges, quantified honesty — and, in round two (#122–#128, PRs #129–#136),
adversarial verification of our own defenses. Capped by a round of fixes
from first-day user testing, including one critical correctness bug.

### Fixed — user-testing round (issues #139, #141, #142)

- **HD tiles draped imagery from the wrong place on Earth (critical)** —
  since the feature first shipped, every HD tile carried imagery for the
  wrong location: the tiler assumed a 180°-per-tile quadtree, but GIBS's
  EPSG:4326 matrix sets are 0.5625°/px at level 0 (tiles span 288°/2^L)
  with ceil-cover grids whose edge tiles overhang as padding. A displaced
  Earth still looks like Earth, so it survived until users cross-checked
  against the hover tooltip ("mousing over Africa shows Canada") and the
  zoom-in transition (North America becoming South America). The pyramid is
  now derived from GIBS's live GetCapabilities, the misaddressed tiles from
  the diagnosis are pinned as regression tests, and a contract test verifies
  our grid level-by-level against the live spec for all four matrix sets.
  ([#143](https://github.com/zkWizard/RoamingEye/pull/143))
- **Drag rotation scales with camera altitude** — rotating the globe while
  zoomed in no longer flings the view across continents; drag speed tracks
  the ground distance under the cursor.
  ([#140](https://github.com/zkWizard/RoamingEye/pull/140))
- **Hover readout names the province/state** — the tooltip now reports the
  admin-1 region (e.g. "Ontario, Canada"), not just the country.
  ([#144](https://github.com/zkWizard/RoamingEye/pull/144))
- **Visual-suite stability** — the transient status line is excluded from
  screenshots, with fresh baselines, so the advisory visual job stops
  flaking. ([#145](https://github.com/zkWizard/RoamingEye/pull/145))

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
