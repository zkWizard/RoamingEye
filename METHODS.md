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

### No-data separation (sea surface temperature)

GIBS serves these composites as JPEG, so a pixel the Level-3 product leaves
empty — land, sea ice, persistent cloud, missing swath — arrives as **black**
rather than as a flagged value. For most layers that black falls far outside the
colormap and is rejected by the app-wide 60-unit colour distance. The
sea-surface-temperature ramp is the exception: its coldest colour is only **53.0**
units from black, so the default threshold inverted empty pixels into a
plausible near-freezing reading and averaged them into boundary means. Measured
on five 2026-03 scenes, that pulled a Gulf-coast boundary mean from 22.8 °C down
to 17.3 °C, and reported a landlocked county as 0.1 °C water at full coverage.

The SST place card therefore samples with a **24**-unit threshold: roughly 3× the
worst deviation measured for genuine open-ocean pixels (**8.1**) and under half
the 53.0 separation, so no-data is excluded while every published ramp colour
still inverts — re-checked weekly against the live colormap. Coastline pixels
that genuinely blend water and land stay ambiguous at any threshold; they are
excluded rather than averaged in, which lowers the reported coverage fraction
instead of biasing the mean. A rejected pixel means the product reports no SST
there — not that the location is land, and not that the water is cold.

## 3. Uncertainty

Two sources, both stated in every export:

- **Quantization**: the inversion resolves values only to one lookup-table step
  (`span / 255`), reported as `± half a step` per value.
- **End-to-end inversion error**: measured by feeding GIBS's authoritative
  colormap colours through the production inversion and comparing to truth.
  This is the real accuracy of the pipeline, and it is layer-dependent:

  | Layer                 | Inversion RMSE   | Recovered |
  | --------------------- | ---------------- | --------- |
  | Precipitation         | 0.27 mm/day      | 50 / 50   |
  | Air temperature (2 m) | 0.51 K           | 90 / 90   |
  | Aerosol optical depth | 0.13 (of 0–0.9)  | 180 / 180 |
  | Snow cover            | 0.62 (of 0–100%) | 100 / 100 |
  | Sea surface temp      | 1.0 °C           | 213 / 213 |
  | Soil moisture         | 8.2 kg/m²        | 21 / 50   |
  | Land surface temp     | no-data (all)    | 0 / 250   |

  The spread is not about the layers — it is about how closely each legend
  follows the colormap GIBS renders with. Precipitation, air temperature, sea
  surface temperature, and aerosol take their stops from that colormap and
  invert tightly across the whole ramp. The rest are still coarse hand-drawn
  approximations of GIBS's finely-hued colormaps, and the cost shows up in the
  "Recovered" column: colours the gradient cannot place are rejected as
  no-data. **Absolute values for soil moisture carry large uncertainty; use
  the probe for relative and temporal analysis on that layer.** The full
  method and framing is in
  [docs/validation.md](docs/validation.md); rebuilding the remaining gradients
  from the real GIBS colormaps is tracked as
  [#170](https://github.com/zkWizard/RoamingEye/issues/170).

### Gross-error plausibility bands (atmosphere)

Separately from the uncertainty above, each atmospheric reading is checked
against a fixed **gross-error band** before it is shown: 170–340 K for 2 m air
temperature, 0–0.01 kg/m²/s for precipitation rate. A value outside its band
is withheld from the place panel as a unit or decode failure rather than
displayed as a measurement, and a month-over-month change is withheld when the
comparison month fails its band.

These bands are deliberately far wider than any real monthly mean. They sit
outside the recorded surface-air extremes (−89.2 °C Vostok 1983; +56.7 °C Death
Valley 1913) and outside the wettest calendar month on record (Cherrapunji 1861,
≈300 mm/day mean), and they are much wider than the inversion RMSE in the table
above. So they never flag a genuine extreme or ordinary inversion noise; they
catch only physically impossible readings, such as a °C figure left unconverted
to kelvin, or a mm/day rate left unscaled.

**A pass is a sanity check, not a correctness claim.** A value inside its band
still carries the full inversion uncertainty above. The bounds are fixed
reference values, never derived from the sampled data. No band is defined for
soil moisture, whose readings are passed through unchecked.

### Snow cover: a discrete ramp, and what it cannot say

Snow cover is the exception to the pattern above, in both directions. GIBS
renders it with `MODIS_NDSI_Snow_Cover`, a **discrete** colormap — one published
colour per whole percent — so the legend reproduces it stop for stop and the
inversion is near-exact on the published colours (RMSE 0.62 of 100 percentage
points, worst single colour 1.9). That is accuracy against the _rendering_;
MOD10CM's own snow-cover retrieval carries its own, larger uncertainty, which
is the product team's published validation, not ours.

That 0.62 is also not what a user gets. The probe fetches these composites as
**JPEG**, and the detail separating percentages inside a band is a 19-step
ripple in one channel — finer than compression noise. Re-measured with the
±8/channel perturbation the accuracy suite uses, the same ramp costs **6–12
percentage points RMSE**. So: treat a probed snow percentage as a band, not a
number, and the limiting factor as the transport rather than the colormap.

Three further limits of the rendered product that no inversion can remove:

- **The ramp is banded below 81%.** Percentages 1–20, 21–40, 41–60 and 61–80
  each share a colour family, so a probed value in that range identifies its
  band, not the percent within it. Above 81% the ramp resolves single points.
- **0% is not drawn.** Snow-free ground is transparent in the tile, so in
  rendered imagery "no snow" and "no observation" are indistinguishable. The
  probe reports neither rather than guessing.
- **Eight of the colours are flags, not amounts** — missing data, no decision,
  night, inland water, ocean, cloud, detector saturated, fill. These are
  rejected outright: the nearest sits 67 RGB units from the legend gradient,
  above the 60-unit no-data threshold, and a weekly contract check
  ([`contract/snow-cover-ramp.contract.test.ts`](contract/snow-cover-ramp.contract.test.ts))
  fails if a GIBS re-render ever narrows that margin.

  Both figures travel with the data, because quoting only the first overstates
  precision — for sea-surface temperature the quantization step is ±0.06 °C
  while the measured inversion error is ±5.1 °C, and the rejected 85 colours
  are contiguous temperature bands (near-freezing polar water, most of
  18–24 °C, and the warmest tropical water) rather than scattered noise. The
  probe panel carries the measured band next to the quantization step, and
  every probe CSV carries an `# inversion_validation` header naming the RMSE,
  the rejected-colour count, and the fact that this is rendering-inversion
  error only — not the L3 product's accuracy against in-situ measurement
  (`src/lib/probeInversionAccuracy.ts`).

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

## 7. Cross-signal comparability

The brief composes four independent products and, by design, never reduces them
to a single score. Several descriptors encode _why_ the signals must stay
separate: shared provenance (`src/lib/sourceIndependence.ts` — rainfall and soil
moisture are both GLDAS, so not independent evidence), differing data months
(the temporal-spread descriptor of §6), and differing spatial coverage
(`src/lib/coverageAdequacy.ts`).

`coverageAdequacy` reports each signal's **marginal** sampled coverage — the
share of the sampled area one product returned. That alone does not say whether
the signals describe the same ground: two signals each covering 60% of the area
might overlap fully or barely at all. `src/lib/coObservedCoverage.ts` bounds the
**co-observed** share — the area every usable signal returned data for
simultaneously — with the Fréchet inequalities (upper bound = the smallest
single-signal coverage; lower bound = `max(0, Σpᵢ − (K − 1))`). The exact
overlap is unknowable because per-signal pixel masks are not carried, so only the
bound is reported, never an invented figure. When the lower bound is 0 the
signals **may share no common area at all**, so a multi-signal brief must not be
read as one co-registered snapshot. This is a spatial-sampling bound, not a
measure of value agreement, accuracy, or condition.

The remaining reason is **dimensional**: the four signals are reported in
incommensurable native units — NDVI (unitless), precipitation rate (kg/m²/s),
soil moisture (kg/m²), and air temperature (K). No two share a unit, so none are
dimensionally comparable and none can be combined into a common index.
`src/lib/unitCommensurability.ts` makes this checkable rather than leaving it to
a comment: it groups the usable observations by native unit and reports whether
any two even share a unit. Native units are dimensional labels, **not** a
data-quality or fitness judgement, and same-unit signals — if any ever arose —
would be dimensionally comparable but are still reported separately, never merged.

Source independence has a coarser grain above the product level. A DOI is
`10.<registrant>/<suffix>`, and the registrant is the member a DOI Registration
Agency assigned that prefix to — the data-assigning authority. Every RoamingEye
Earthdata product (MODIS, GLDAS, MERRA-2, ASTER GDEM) mints its DOI under one
registrant, `10.5067` (NASA ESDIS). So the brief's four signals are three
_distinct products_ (independent at the product grain) yet a single _registering
authority_: a registration- or curation-authority-wide change (a DOI re-minting
after a DAAC migration, an ESDIS-wide reprocessing) would touch them together, so
they are not institutionally independent. `src/lib/registrantProvenance.ts`
groups the usable observations by the registrant parsed from each cited DOI and
reports whether the whole brief traces to one authority. It composes with — and
never replaces — `sourceIndependence`; a DOI with no parseable registrant is
listed as unknown, never assigned an invented authority.

A further axis is **how far each product sits from the raw instrument**. NASA
classifies Earth-science products on a standard processing ladder (EOSDIS Data
Processing Levels, L0–L4): higher levels carry more algorithmic processing,
gridding, or modeling between the sensor and the reported value. The brief's
products span two tiers — NDVI (MOD13A3) is a **Level-3** gridded index, while
the GLDAS land-surface fields and the MERRA-2 reanalysis are **Level-4** model
output. `src/lib/processingLevel.ts` makes that L3/L4 split (already noted in §9
below) checkable per signal and reports whether the usable signals share one
tier or span several. It is a companion to observation modality
(`src/lib/observationModality.ts`), not a duplicate: modality asks _how_ a value
is produced, processing level asks _how far_ from the raw sensor it sits — and
the two partition the products differently. A higher level is **not** worse
data; it is a position on a processing ladder, never a quality judgement, and a
product absent from the table is reported as unclassified rather than guessed.

## 8. Temporal commensurability

§7 covers whether the four signals are comparable _in kind_ (units, provenance,
coverage). Two further descriptors cover whether two monthly values may be read
together _in time_ — a distinct axis that a shared data month alone does not
settle.

**Within-month aggregation** (`src/lib/temporalAggregation.ts`). Each product
reduces its sub-monthly record to one monthly value differently, and the
reduction is a fixed property of the cited product, keyed by its short name:

| Signal (product)                          | Within-month value                  |
| ----------------------------------------- | ----------------------------------- |
| Vegetation NDVI (MOD13A3)                 | within-month composite (best-value) |
| Rainfall, soil moisture (GLDAS_NOAH025_M) | monthly time-average                |
| Air temperature 2 m (M2TMNXSLV)           | monthly time-average                |

A **composite** reports a single favourable within-month state (the best pixel
selected in the compositing window — e.g. peak greenness), **not** a mean over
the month; a **time-average** is the mean of the model's sub-monthly fields
across the whole month. So a composite and a time-average dated the same month
are **not temporally commensurate** — one is a selected within-month state, the
other a whole-month mean — and must not be read as the same reduction of the
month. A product not in the table is reported as `unclassified`, never inferred
from its value.

**Quantity kind & time-integrability** (`src/lib/quantityKind.ts`). Placing four
monthly numbers side by side invites accumulating them over time the same way,
but only one may be. Rainfall (precipitation rate, kg/m²/s) is a per-unit-time
**flux**: its integral over a period is a meaningful accumulated total (multiply
the mean rate by the period's seconds to reach a precipitation depth). Soil
moisture (kg/m²) and air temperature (K) are **states** — levels at an instant or
mean, with no such accumulation — and NDVI is a bounded **dimensionless index**,
not a physical amount at all. So the flux is time-integrable and the states and
index are not; a level must never be summed into a meaningless "total". Kind is a
property of the geophysical variable, not the product: the two GLDAS fields share
a product yet differ (rainfall is a flux, soil moisture a state).

**Panel contemporaneity** (`src/lib/placeMonthAlignment.ts`). Before either
descriptor above applies, two values must refer to the same month at all. The
place panel's five cards each read the latest month _their own_ product
publishes, and those calendars differ — the GLDAS fields, MERRA-2, MODIS SST and
the MODIS vegetation composite carry different publication lags, so the cards
routinely span three or four months. Laid out as one grid under one place name
they read as a single snapshot, which they are not. This descriptor partitions
the cards into cohorts sharing one month and reports the span, and the panel
renders that statement in place of its former hedge ("products may publish on
different monthly schedules"). Only cards inside one cohort may be read together
in time. It describes the month each card _reads_, not what it observed: a card
reporting no usable coverage contributes no observation for its month. A shared
month makes two cards contemporaneous, not commensurate — that is what the two
descriptors above settle.

All three descriptors report structure only — none combines, accumulates, or
ranks the values, and every signal keeps its source DOI.

**Month length in an accumulated total**
(`src/lib/placeRainfallMonthLength.ts`). Integrating the one time-integrable
signal has a consequence for reading two months side by side: because the
integration window is the calendar month, two rainfall **totals** are not
commensurate when the months differ in length (28–31 days). A February-to-March
step gains three days of accumulation at no change in rate at all — at 3 mm/day,
a spurious +9 mm. The place panel therefore splits the step it reports,

`Tₗ − Tₑ = rₑ(dₗ − dₑ)` (calendar) `+ (rₗ − rₑ)dₗ` (rate)

for `d` days and `r = T/d` the implied mean daily rate, and discloses the
calendar share alongside the total. The identity is exact; attributing the
calendar term at the **earlier** month's rate is a reporting convention (holding
the later rate fixed divides the same total differently), chosen because it
answers what a reader comparing two totals is implicitly asking. Where the total
moves one way while the mean daily rate moves the other, the panel says so —
that is the case in which reading the total alone inverts what the rain did. The
mean daily rate is a total over its own month's length, not an observation of
any individual day.

**Soil-moisture sampling depth** (`src/lib/soilMoistureDepth.ts`). A column
water content in kg/m² means nothing without the depth of the column it
integrates, and GLDAS Noah carries several. GIBS publishes the layer
RoamingEye renders, `GLDAS_Underground_Soil_Moisture_Monthly`, under the title
"Soil Moisture (Monthly, **0-10 cm**, Noah LSM, GLDAS)" — the topmost soil
layer. It is **not** the 0-100 cm root zone (`RootMoist`), which is the column
agronomy and agricultural-drought monitoring are defined on. Two independent
checks agree on the depth: NASA's own layer title, and the layer's GIBS
colormap, which tops out at 50 kg/m² — about what a saturated 10 cm column
holds (100 mm × ~0.45 volumetric ≈ 45 kg/m²) and roughly a tenth of a saturated
root zone. The distinction changes what a reading supports: a near-surface
column responds to individual rain events and to evaporative drying within
days, whereas the root zone integrates weeks to months, so reading the surface
value as root-zone water overstates both stored water and the persistence of a
wet or dry signal. The depth string is defined once and imported by every soil
surface (legend caption, layer picker, probe axis and CSV header, place-panel
metric label) so they cannot drift apart, and
`contract/soil-moisture-depth.contract.test.ts` re-checks the cited depth
against the live GIBS title weekly.

## 9. What this tool does not do

- It does **not** validate the GIBS L3 products against in-situ measurements —
  that is the instrument teams' published validation, which we cite via the
  per-dataset DOIs ([DATA_SOURCES.md](DATA_SOURCES.md)).
- It does **not** replace the underlying L3/L4 granules for measurement-grade
  work; it reconstructs values from rendered imagery for exploration, teaching,
  and hypothesis-forming.
- Land-surface temperature currently inverts to no-data for most values (its
  gradient misses GIBS's cold-end hues); see §3.
