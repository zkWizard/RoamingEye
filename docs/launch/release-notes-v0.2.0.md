# v0.2.0 — the research-instrument release

RoamingEye grew from a beautiful globe into something you can do research on.
Everything below runs in the browser at
[zkwizard.github.io/RoamingEye](https://zkwizard.github.io/RoamingEye/) —
no account, no install, 100% open data.

![Two years of monthly NDVI composites scrubbing on the globe](https://raw.githubusercontent.com/zkWizard/RoamingEye/main/docs/demo.gif)

## 📈 Point time-series probe

Click anywhere on the globe → a chart of the active layer's value at that
point across its **full published record** (26 years for MODIS layers, 46 for
MERRA-2), with a **CSV download** whose headers carry full provenance (GIBS
product, coordinates, method, caveats). Values are reconstructed by inverting
the layer's colormap on the streamed imagery — approximate by design, labeled
approximate everywhere, and ideal for trend-spotting before a real data pull.

## 🌋 Plate-tectonics context pack

Two new overlays alongside the live USGS earthquakes:

- **Plate boundaries** — the Bird (2003) digital plate model.
- **Volcanoes** — all ~1,200 Holocene volcanoes from the Smithsonian Global
  Volcanism Program, colored by eruption recency.

With the shaded-relief terrain layer, the whole intro-geology narrative sits
on one globe — and the address bar encodes the exact view, so a lecture link
reproduces it for every student.

## 🧪 Nine scientific layers, full records

Vegetation (NDVI/EVI), land/air/sea temperature, precipitation, soil
moisture, snow cover, and aerosols — each scrubbable across every published
month (MERRA-2 layers reach back to 1980), with legends, provenance tags, and
a cloud-aware ~30 m study patch over any searched place.

## 📚 For researchers

- [Research recipes](https://github.com/zkWizard/RoamingEye/blob/main/docs/research-recipes.md) —
  five step-by-step workflows: drought signals, LST trends, the
  plate-tectonics lecture view, snowpack tracking, deforestation figures.
- [Data sources & licensing](https://github.com/zkWizard/RoamingEye/blob/main/DATA_SOURCES.md) —
  every product, resolution, and citation.
- `CITATION.cff` — GitHub's "Cite this repository" works out of the box.

## 🙏 Contributing

We're actively looking for collaborators — the
[good first issues](https://github.com/zkWizard/RoamingEye/labels/good%20first%20issue)
are seeded and scoped, and the flagship
[RFC-001 tiled-imagery streaming](https://github.com/zkWizard/RoamingEye/blob/main/docs/rfcs/RFC-001-tiled-imagery-streaming.md)
effort has begun landing (pure tile math + single-level tiling).

Full change list: [CHANGELOG.md](https://github.com/zkWizard/RoamingEye/blob/main/CHANGELOG.md)
