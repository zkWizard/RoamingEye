To: public
Venue: Pangeo Discourse (https://discourse.pangeo.io/)
Channel: "Pangeo Showcase" category — text post (optionally follow up with a monthly Showcase talk proposal)
Status: DRAFT
Date: 2026-07-15

---

**Title:** RoamingEye — a zero-install, provenance-first 3D globe for eyeballing multi-decadal open records before you pull granules

Hi Pangeo folks,

I've been building **RoamingEye**, an open-source (MIT) browser globe for looking at the public satellite archives — NASA MODIS and Harmonized Landsat-Sentinel — and I wanted to share it here because it's meant to sit _next to_ the cloud-native stack most of you already use, not compete with it.

**Live, no account/install/fee:** https://zkwizard.github.io/RoamingEye/
**Code:** https://github.com/zkWizard/RoamingEye

**Where it fits in a Pangeo workflow.** It's a fast visual reconnaissance step _before_ you pull L3 granules into an Xarray/Zarr/Dask pipeline. Grab the globe, scrub the temporal slider month-by-month through the last few years of monthly composites, click a point to see that layer's full-record time series, decide whether a site is worth the compute — then go do the real analysis in your notebook. It answers "is there a signal here, and over what window?" in a few seconds without spinning anything up.

**What's in it right now:**

- 9 open NASA products across vegetation (NDVI, EVI), temperature (LST, 2 m air, SST), water (precipitation, soil moisture), cryosphere (snow cover), and atmosphere (aerosols).
- Native-resolution WMTS tile streaming chosen by screen-space error, refining down to ~31 m terrain, with parent-tile fallback so detail refines instead of popping.
- A point time-series probe: click anywhere, chart that layer across its full record (26–46 years depending on product), and download a **provenance-stamped, uncertainty-labelled CSV**.
- A built-in open-data providers catalogue (~33 agencies/archives) — every layer is cited in-app.

**The honesty part, because this crowd will (rightly) ask.** The probe does _not_ read source granules — it inverts the rendered colormap back to a physical value. That's approximate, and the app says so everywhere it matters. [`METHODS.md`](https://github.com/zkWizard/RoamingEye/blob/main/METHODS.md) documents the probe pipeline, area weighting, the measured per-layer inversion accuracy, and the seasonal Mann-Kendall / Sen's-slope trend test it uses — so you can see exactly where it stops being trustworthy. It's a reconnaissance and teaching instrument, not a replacement for the actual archive.

Stack is TypeScript + Three.js; everything's open and the data is data humanity already paid for.

I'd genuinely value this community's eyes on two things: (1) does the "look first, then pull granules" framing match how you actually work, and (2) what would make the CSV export more directly loadable into an Xarray/pandas workflow (schema, units metadata, a sidecar STAC-ish reference)? Happy to answer anything about how it's built. And if a live walkthrough would be useful, I'm glad to propose one for the monthly Showcase.

Thanks for building so much of the open-EO foundation this leans on.

— zkWizard
