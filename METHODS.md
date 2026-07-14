# Methods & limitations

How RoamingEye computes what it shows, and where it stops being trustworthy.
This is the reference a reviewer, a student, or a future maintainer should read
end to end before relying on a number the tool produces. Every claim here is
enforced by a test or a weekly contract check; where a figure appears, it is
kept in sync with the code that produces it (see the drift guard in
`src/lib/methods-doc.test.ts`).

## 1. The point / region probe

The globe is draped with **rendered** imagery from NASA GIBS — a colormap
applied to an underlying Level-3 science product. The probe reconstructs an
approximate data value by:

1. **Sampling** the GIBS monthly composite at the clicked location (a 3×3 pixel
   median for a point; an area-weighted grid mean for an area or drawn region).
2. **Inverting the colormap**: finding where the sampled RGB sits on the
   layer's legend gradient (nearest-neighbour over a 256-entry lookup table),
   which gives a 0–1 position.
3. **Scaling** that position onto the layer's physical range, which was
   [derived from GIBS's own colormap metadata](src/lib/colormap.ts) and is
   re-verified weekly against the live document.

The result is an **approximation** — reconstructed from public imagery colours,
not read from the L3 product — and every output is labelled `APPROXIMATE`.

## 2. Spatial statistics

Region and area means weight each sample by **cos(latitude)**. On an equal-angle
lat/lon grid the ground area a sample represents shrinks toward the poles;
averaging without weights biases a latitude-spanning box toward its poleward
rows (the canonical gridded-data mistake). Coverage is gated on the valid
**area** fraction, not the sample count, so a box whose only data is a few
polar slivers is correctly rejected rather than reported as a region mean.

## 3. Uncertainty

Two sources, both stated in every export:

- **Quantization**: the inversion resolves values only to one lookup-table step
  (`span / 255`), reported as `± half a step` per value.
- **End-to-end inversion error**: measured by feeding GIBS's authoritative
  colormap colours through the production inversion and comparing to truth.
  This is the real accuracy of the pipeline, and it is layer-dependent:

  | Layer                 | Inversion RMSE  | Recovered |
  | --------------------- | --------------- | --------- |
  | Aerosol optical depth | 0.13 (of 0–0.9) | 180 / 180 |
  | Sea surface temp      | 5.1 °C          | 128 / 213 |
  | Soil moisture         | 8.2 kg/m²       | 21 / 50   |
  | Air temperature (2 m) | 19.0 K          | 46 / 90   |
  | Precipitation         | 20.4 mm/day     | 27 / 50   |
  | Land surface temp     | no-data (all)   | 0 / 250   |

  These are honest and, for several layers, poor: our legend gradients are
  coarse approximations of GIBS's finely-hued colormaps. **Absolute values for
  temperature, precipitation, and soil moisture carry large uncertainty; use
  the probe for relative and temporal analysis on those layers.** The full
  method and framing is in [docs/validation.md](docs/validation.md); tightening
  this by inverting against the real GIBS colormaps is tracked as
  [#170](https://github.com/zkWizard/RoamingEye/issues/170).

## 4. Trend analysis

For a probed time series, the tool reports a nonparametric trend — chosen
because colormap-inverted values don't follow a clean distribution:

- **Seasonal Mann-Kendall** (Hirsch & Slack 1982) for significance. Values are
  compared **only within the same calendar month across years**, and the twelve
  per-month statistics are summed — so the seasonal cycle cannot masquerade as a
  trend (a mistake the plain Mann-Kendall test makes on seasonal data). Reports
  Kendall's τ (effect size) and a two-sided p-value.
- **Sen's slope** for magnitude: the median of all within-season pairwise
  slopes — robust to outliers, no linearity assumption — with the rank-based
  95% confidence interval (Gilbert 1987). Reported in units/decade.

A trend is called **significant** only at α = 0.05 _and_ with enough record to
test (≥ 3 years in a season); a two-point series is never "significant" whatever
the arithmetic says. Because these estimators depend on the _ordering_ of
values, they are robust to the absolute inversion error above — which is why
temporal analysis is the probe's reliable primary use.

## 5. Reproducibility

Every CSV export carries, in `#` comment headers, everything needed to
reproduce it: the `# view_url` (layer, month, and camera position encoded in the
address bar), the `# tool_version`, the `# data_product` and `# data_doi` of the
source dataset, the sampling method, and the trend statement. Cite the **view**,
not just the tool — the URL reproduces exactly what was seen. Machine-readable
tool and dataset citations (BibTeX / RIS) are one click away on the in-app Data
providers page.

### Loading the CSV

The supported way to read an export is to treat `#` lines as comments:

```python
import pandas as pd
df = pd.read_csv("roamingeye_probe_….csv", comment="#")
```

```r
df <- read.csv("roamingeye_probe_….csv", comment.char = "#")
```

The file is also safe for parsers that know nothing about comments
(RFC 4180 tokenizers, Excel, Sheets): every `#` header line is a single
delimiter-free field — free text is scrubbed of `,`, `"`, and line breaks
at generation time, and a CI property test holds the exports to it — and
every data cell is a `YYYY-MM` stamp, a fixed-decimal number, or empty.
One documented exception: the `# view_url` line reproduces the deep link
byte-exactly, and URLs may legitimately contain commas — treat it as a
comment, not a row.

## 6. Data currency & recency

The environment brief composes four independent monthly products, each on its
own publication schedule, so their data months rarely line up. Alongside the
cross-signal temporal spread (are the signals a synchronized snapshot?), the
brief can state, per observation, how many **whole months** its data month sits
behind an "as of" reference month, and bucket that distance into a neutral,
purely-temporal tier (`current-month`, `past-quarter`, `past-half-year`,
`older`; plus `after-reference` and `invalid-date` for the off-nominal cases).

This lag is a **distance in months, not a quality judgement**. Monthly
composites are lagged by design, so a larger lag reflects a product's
publication cadence — never that the data is less trustworthy. Every observation
keeps its source DOI, and observations without a valid data month are listed but
excluded from the range statistics (`src/lib/observationRecency.ts`).

## 7. What this tool does not do

- It does **not** validate the GIBS L3 products against in-situ measurements —
  that is the instrument teams' published validation, which we cite via the
  per-dataset DOIs ([DATA_SOURCES.md](DATA_SOURCES.md)).
- It does **not** replace the underlying L3/L4 granules for measurement-grade
  work; it reconstructs values from rendered imagery for exploration, teaching,
  and hypothesis-forming.
- Land-surface temperature currently inverts to no-data for most values (its
  gradient misses GIBS's cold-end hues); see §3.
