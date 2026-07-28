# Draft: r/gis (also fits r/remotesensing with the intro line tweaked)

```
To:      public (r/gis, r/remotesensing)
Venue:   Reddit
Channel: NOT YET DETERMINED — see "Two gates" below
Status:  DRAFT — BLOCKED
Date:    drafted pre-v1.0; claims repaired 2026-07-27
Claims re-verified: 2026-07-27
```

> **Two gates before this is sendable.** Both are tracked in the comms workspace:
>
> 1. **HTTPS is not working yet.** Every link below points at `https://roamingeye.org/`,
>    which has no certificate yet. See the send gate in
>    [`comms/outbox/README.md`](../../comms/outbox/README.md) for the exact check to run.
> 2. **Reddit's own rules have not been read.** Both subs likely confine self-promotion
>    to a designated showcase thread and may require flair or affiliation disclosure. The
>    four questions to answer from each sidebar are in the Reddit entry of
>    [`comms/TARGETS.md`](../../comms/TARGETS.md). **Do not post this as a drive-by link
>    until those are answered** — it risks removal and a bad first impression in the exact
>    community we most want.

---

**Title:** I built an open-source 3D globe that scrubs through decades of monthly
satellite data — click any point for a time-series CSV. No accounts, no API keys, all
open data.

**Body:**

Live site: https://roamingeye.org/ · Code (MIT):
https://github.com/zkWizard/RoamingEye

I kept hitting the same wall: decades of open EO data (MODIS, MERRA-2, GLDAS,
HLS) exist, but _looking_ at them means GIS software, API keys, or wrestling
with Worldview for the tenth time. So I built RoamingEye — a browser-based 3D
Earth where the entire archive is a slider.

What it does:

- **Temporal scrubbing** — 9 NASA layers (NDVI/EVI, LST, 2 m air temp, SST,
  precipitation, soil moisture, snow cover, aerosols), every published month.
  Records run **26–46 years** depending on the layer; MERRA-2 reaches back to **1980**.
- **Native-resolution streaming, on by default** — zoom in and the globe re-drapes
  itself with WMTS tiles chosen by screen-space error, up to each layer's native
  resolution (terrain reaches ~31 m), with parent-tile fallback so detail refines
  instead of popping.
- **Click → time series** — click any point on the globe (or draw a study region)
  and get a chart of that layer across the full record, plus a CSV with
  provenance headers.
  (Honest caveat: values come from colormap inversion of the rendered
  imagery, so they're approximate — great for trends/anomalies screening,
  not a substitute for the L3 product. The CSV says so, and METHODS.md
  publishes the measured per-layer inversion accuracy.)
- **Trend testing, not just eyeballing** — the probe runs a seasonal Mann-Kendall
  test with Sen's slope, so "is this actually a trend?" gets an answer with an
  uncertainty attached rather than a vibe.
- **Geology pack** — Bird 2003 plate boundaries + ~1,200 Smithsonian GVP
  Holocene volcanoes + live USGS quakes (M4.5+, rolling 30 days) colored by
  depth, over ASTER shaded relief.
- **30 m study patches** — search a place and it drapes the clearest HLS pass
  per month (cloud-aware scene selection), scrubbable across years.
- **Reproducible views** — the URL encodes layer/month/camera, so a link
  reproduces exactly what you saw. There's a CITATION.cff and step-by-step
  "research recipes" for common workflows.

No backend — GIBS is CORS-open, so it's a static site you can fork and host
free. TypeScript + Three.js, with over 2,000 unit tests on the pure logic.

Would genuinely love feedback from people who do this professionally: what
would make it useful for your actual workflow? The flagship open issue is
[#170](https://github.com/zkWizard/RoamingEye/issues/170) — inverting against GIBS's
real colormaps so the probe returns properly accurate absolute values instead of the
approximation above. If you know that corner of the GIBS stack, that's the one to
weigh in on.
