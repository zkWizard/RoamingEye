# Draft: r/gis (also fits r/remotesensing with the intro line tweaked)

**Title:** I built an open-source 3D globe that scrubs through 26 years of
monthly satellite data — click any point for a time-series CSV. No accounts,
no API keys, all open data.

**Body:**

Live site: https://zkwizard.github.io/RoamingEye/ · Code (MIT):
https://github.com/zkWizard/RoamingEye

I kept hitting the same wall: decades of open EO data (MODIS, MERRA-2, GLDAS,
HLS) exist, but _looking_ at them means GIS software, API keys, or wrestling
with Worldview for the tenth time. So I built RoamingEye — a browser-based 3D
Earth where the entire archive is a slider.

What it does:

- **Temporal scrubbing** — 9 NASA layers (NDVI/EVI, LST, 2 m air temp, SST,
  precipitation, soil moisture, snow cover, aerosols), every published month.
  MERRA-2 layers reach back to **1980**.
- **Click → time series** — click any point on the globe and get a chart of
  that layer across the full record, plus a CSV with provenance headers.
  (Honest caveat: values come from colormap inversion of the rendered
  imagery, so they're approximate — great for trends/anomalies screening,
  not a substitute for the L3 product. The CSV says so.)
- **Geology pack** — Bird 2003 plate boundaries + ~1,200 Smithsonian GVP
  Holocene volcanoes + live USGS quakes colored by depth, over ASTER shaded
  relief.
- **30 m study patches** — search a place and it drapes the clearest HLS pass
  per month (cloud-aware scene selection), scrubbable across years.
- **Reproducible views** — the URL encodes layer/month/camera, so a link
  reproduces exactly what you saw. There's a CITATION.cff and step-by-step
  "research recipes" for common workflows.

No backend — GIBS is CORS-open, so it's a static site you can fork and host
free. TypeScript + Three.js, ~100 unit tests on the pure logic.

Would genuinely love feedback from people who do this professionally: what
would make it useful for your actual workflow? The flagship roadmap item is
quadtree tiled streaming (sharp at any zoom, everywhere) — RFC is open if
anyone wants to get involved.
