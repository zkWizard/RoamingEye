# Research recipes

Five short walkthroughs that turn RoamingEye from "a pretty globe" into a
day-one research tool. Each maps to a workflow we've seen in real earth-science
and geology work — no GIS software, no API keys, no downloads beyond a CSV.

Everything below runs in the browser at
**[roamingeye.org](https://roamingeye.org/)**.

> **A note on probe values.** The point probe reconstructs values by inverting
> the layer's colormap on the rendered imagery. That makes it **approximate** —
> excellent for spotting trends, seasonality, and anomalies, and for deciding
> _whether a site is worth a real data pull_ — but for measurement-grade work,
> follow up with the underlying L3 product (each CSV header names the exact
> GIBS layer to look up). The CSV states all of this in its provenance headers.
> Accuracy is **layer-dependent and measured** — check the per-layer table in
> [METHODS.md §3](../METHODS.md) before trusting an absolute value.

> **Teaching rather than researching?** These recipes are workflows, not lesson
> plans. [`teaching/ndvi-phenology-lab.md`](teaching/ndvi-phenology-lab.md) is a
> ready-to-run 60–75 minute classroom lab on the seasonal vegetation cycle, with
> learning objectives, a student worksheet, an assessment rubric, and instructor
> answer notes.

---

## 1. Pull a drought signal for a field site

_Hydrology / agriculture / ecology — "did the 2023–24 drought reach my site?"_

1. Pick **Soil moisture** (or **Precipitation**) in the layer picker.
2. Search your field site by name, or rotate/zoom to it.
3. **Click the exact point.** The probe panel charts root-zone soil moisture
   at that spot for every month since 2000.
4. Drought years read directly off the chart as troughs that undercut the
   usual seasonal cycle. Hit **Download CSV**.
5. Repeat the click on **Vegetation (NDVI)** — a lagging NDVI trough at the
   same site is the vegetation response that makes the story complete.

With the CSV in pandas:

```python
import pandas as pd
s = pd.read_csv("roamingeye_probe_soil_*.csv", comment="#",
                parse_dates=["year_month"], index_col="year_month")["value"]
anomaly = s - s.groupby(s.index.month).transform("mean")  # seasonal anomaly
anomaly.rolling(6).mean().plot()  # the drought signal, de-seasonalised
```

## 2. A land-surface-temperature trend for a study area

_Urban climate / land-use change — "is my city measurably hotter than 2000?"_

> ⚠️ **Read this before you start: the LST _probe_ is currently broken.** Its
> legend gradient misses GIBS's cold-end hues, so colormap inversion returns
> **no data for effectively all values** (0 of 250 recovered — see the accuracy
> table in [METHODS.md §3](../METHODS.md)). Fixing it by inverting against
> GIBS's real colormaps is tracked as
> [#170](https://github.com/zkWizard/RoamingEye/issues/170). Until then, use
> this recipe **visually** — the imagery itself is fine — and pull MOD11C3 for
> numbers.

1. Pick **Land surface temp**, search the city, click the urban core.
2. Scrub the record. The city reading hotter than the farmland around it is the
   urban-heat-island signal, and it is legible directly in the imagery: hold a
   summer month and step year-by-year with PageUp/PageDown to compare like with
   like.
3. **Save PNG** at each end of your study window for a before/after pair, then
   pull **MOD11C3 v061** (`10.5067/MODIS/MOD11C3.061`) for the actual values.
   Use this recipe to decide _whether_ a site is worth that pull — which is what
   it is genuinely good for — not to produce the numbers themselves.

Want a probe-based temperature series today? **Air temperature (2 m)** is the
layer to reach for: its legend is taken from the colormap GIBS renders with, so
inversion recovers every ramp colour at 0.51 K RMSE (METHODS §3) — tight enough
to read in absolute degrees, unlike the coarser gradients on this list. It is
still MERRA-2 reanalysis rather than a station measurement, and readings near
271 K sit on the ramp's low-contrast pale-yellow shoulder (docs/validation.md).

## 3. The plate-tectonics lecture view

_Intro geology / geophysics teaching — one link, the whole story._

1. Pick the **Terrain (shaded relief)** layer.
2. In the overlay toolbar, enable **Plates**, **Volcanoes**, and **Quakes**.
3. Rotate to the Pacific rim: the Andes and Cascades ranges (terrain), the
   Bird 2003 plate boundaries (orange lines), ~1,200 Holocene volcanoes
   (triangles, colored by eruption recency), and the last 30 days of real
   M4.5+ earthquakes (rings, colored by depth) line up on one globe.
4. Copy the URL — **the address bar encodes the exact view**, so the link you
   paste into your slides or LMS reproduces it for every student. Live
   seismicity means the map is different — and current — every lecture.

Bonus: rotate to a subduction zone and note quake colors turning from red
(shallow, at the trench) to blue (deep, under the arc) — the Wadati-Benioff
zone, visible without a single slide.

## 4. Watch a snowpack shrink

_Cryosphere / water resources — seasonal snowline behaviour across decades._

1. Pick **Snow cover**, search your basin or range (e.g. "Sierra Nevada").
2. Scrub one water year with the ←/→ keys to see the advance/retreat cycle;
   then hold a month (say, April — peak snowpack) and step year-by-year with
   PageUp/PageDown to compare like with like.
3. Click a mid-elevation point: the probe charts April-to-April snow-cover
   percentage across 26 years. Export the CSV and regress.
4. For the close-up: the searched area gets a ~30 m HLS true-colour patch,
   auto-selected for the clearest pass each month — scrub to watch the
   actual snowline, not a proxy, move across years.

## 5. A deforestation before/after for a figure

_Land-use change / conservation — publication-ready evidence in minutes._

1. Pick **Vegetation (NDVI)** and search the frontier you study (e.g.
   "Novo Progresso, Pará").
2. The high-res study patch drapes over the area. Scrub to a year early in
   your study window; **Save PNG** exports the view, provenance included in
   the filename.
3. Scrub to the present, export again. The scene chip labels each image with
   instrument + acquisition date (e.g. _Sentinel-2 · HLS S30 · 2026-05-11_),
   so both panels of your figure are fully citable.
4. Click the cleared area for the NDVI time series — the CSV gives you the
   collapse date to the month, which is the caption for that figure.

---

## Citing what you find

See [How to cite](../README.md#-how-to-cite): include the view URL (it
reproduces the exact layer/month/camera), the product identifiers shown in
the app, and the CSV provenance headers where a probe was involved.
