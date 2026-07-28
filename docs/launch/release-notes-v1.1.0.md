<!-- Draft for the GitHub release on the existing v1.1.0 tag (610ef2a, 2026-07-10). Not yet published.
     Status: DRAFT · Claims re-verified 2026-07-27 against CHANGELOG.md, docs/validation.md, METHODS.md.
     ⛔ Publish gate + the exact `gh release create` command: see comms/LOG.md (2026-07-27 entry) and
     the HTTPS send gate in comms/outbox/README.md. This file is the release BODY only. -->

# v1.1.0 — measure the trend, and how much to trust it

The first feature release since launch. RoamingEye could already chart a
region's history across decades of open satellite imagery; 1.1 makes those
charts answerable to a reviewer — a real trend test, published accuracy
numbers for our own probe, physical units with stated uncertainty, and a
citation chain that reaches the datasets themselves.

Everything below runs at [roamingeye.org](https://roamingeye.org/) — no
account, no install, no backend, 100% open data.

## 📈 Is that a trend, or just the seasons?

Probe any point or region and RoamingEye now runs the **seasonal
Mann-Kendall** test — the field-standard nonparametric trend test, with the
seasonal correction that stops the annual cycle masquerading as a trend —
plus **Sen's slope** in units per decade and its 95% confidence interval.

The result appears three ways: in the probe panel
(`trend +0.18 NDVI/decade · p = 0.004`), as `# trend_*` headers in the CSV
export, and drawn on the chart itself as a dashed slope line with its CI
band. The estimators are pure functions, unit- and property-tested.

## 🔬 We measured our own accuracy and published the bad numbers

RoamingEye reconstructs physical values by inverting each layer's colour
ramp on the imagery it streams. That has always been labelled approximate.
As of 1.1 it is **quantified**: every colour in NASA GIBS's own authoritative
colormap is fed through our production inversion and the residual is
measured, per layer.

| Layer                 | RMSE               | Verdict                           |
| --------------------- | ------------------ | --------------------------------- |
| Aerosol optical depth | 0.13 (scale 0–0.9) | Good — usable for absolute values |
| Sea surface temp      | 5.1 °C             | Coarse — relative use recommended |
| Soil moisture         | 8.2 kg/m²          | Coarse — relative use recommended |
| Air temperature (2 m) | 19.0 K             | Poor absolute accuracy            |
| Precipitation         | 20.4 mm/day        | Poor absolute accuracy            |
| Land surface temp     | — (all no-data)    | Gradient misses GIBS's hues       |

Several of those are poor, and that is the point of printing them. Our
legend gradients are coarse approximations of the real colormaps, so on
those layers the probe is trustworthy for **relative** analysis — shape,
timing, direction of change — and not for absolute values. The full table
and what it does and doesn't mean live in
[docs/validation.md](https://github.com/zkWizard/RoamingEye/blob/main/docs/validation.md),
re-measured against the live colormaps weekly by a contract test and
CI-guarded against drift. Closing the gap is tracked as
[#170](https://github.com/zkWizard/RoamingEye/issues/170).

## 📐 Real units, honest precision

- **Region means are no longer latitude-biased.** Drawn-region and area
  probes averaged an equal-angle grid with equal weights, overweighting
  poleward rows by up to ~2.5× across a 30–70°N box — the canonical
  gridded-data mistake. Sample weights are now cos(latitude), carried
  through pixel dedup, and CSVs name the estimator in `# method:`.
- **Six layers upgraded from "fraction of the colour scale" to physical
  units** — land-surface and 2 m air temperature, SST, precipitation, soil
  moisture, and aerosol optical depth — derived from the colormap documents
  GIBS itself renders with, every ramp verified linear-in-value. A weekly
  contract test re-derives all six from the live XML, so an upstream palette
  re-render fails CI instead of silently mis-scaling every probe.
- **Stated uncertainty everywhere.** CSV decimals follow the colormap
  quantization step rather than a fixed four, every export carries
  `# uncertainty: ±<half-step>`, the probe panel says `±0.002 per value`
  right where the numbers are, and region CSVs gain a `valid_fraction`
  column so a 25%-valid month no longer prints like a full one.
- **Quantitative legends.** Gradient bars gained min/mid/max value ticks in
  the same physical units the probe reports, so legend and probe can never
  disagree. Uncalibrated layers show no ticks rather than fake ones.

## 📚 Cite the data, not the picture

- **Every layer pins its source dataset** — short name, version, and DOI,
  resolved live through GIBS layer metadata to NASA CMR. Exports carry
  `# data_product` and `# data_doi` headers, and a weekly contract test
  verifies the layer→product mapping and that every DOI still resolves.
- **One-click BibTeX and RIS export** for the tool and for every source
  dataset, following ESIP's machine-readable citation guidelines.
- **[METHODS.md](https://github.com/zkWizard/RoamingEye/blob/main/METHODS.md)** —
  a methods and limitations handbook covering the probe pipeline, area
  weighting, uncertainty, the trend method, the measured inversion accuracy,
  and what the tool explicitly does _not_ do. Its figures are drift-guarded
  against the code.
- The README gained a **"Citing RoamingEye and its data"** section naming
  the three citable objects (tool, imagery service, datasets) with a
  per-dataset DOI table, plus a statement of need.

## 📍 One friendly thing

**"You are here"** — an opt-in **My location** toolbar toggle drops a pin at
your own location with a hover label. The browser's permission prompt is the
consent gate: nothing is requested until you click it, denial reverts the
toggle and explains why, and the choice is never persisted, so a returning
visitor is never silently re-prompted.

## Under the hood

Unit tests 314 → ~375 across the two rounds, including a property suite for
the trend estimators checked against an exact reference. Live contract
assertions 22 → 44 (probe scales, data citations, inversion accuracy — all
re-run weekly against the real GIBS catalog). The end-to-end "no console
errors" gates now tolerate transient GIBS tile CORS/timeout hiccups — an
upstream condition the app degrades gracefully around — while keeping
genuine app exceptions strict. CodeQL caught a real incomplete-escaping bug
in the BibTeX generator, which we fixed.

Full details in
[CHANGELOG.md](https://github.com/zkWizard/RoamingEye/blob/main/CHANGELOG.md).

New here? The [good first issues](https://github.com/zkWizard/RoamingEye/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22)
queue is stocked, and [#170](https://github.com/zkWizard/RoamingEye/issues/170)
— replacing our approximate legend gradients with GIBS's real colormaps — is
the highest-value open problem in the project.
