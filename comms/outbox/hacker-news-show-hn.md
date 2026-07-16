To: public
Venue: Hacker News (https://news.ycombinator.com/)
Channel: "Show HN" submission (URL = live app) + author's first comment. Guidelines: https://news.ycombinator.com/showhn.html
Status: DRAFT
Date: 2026-07-15

---

**Posting notes for zkWizard (not part of the post):**

- Submit as a **Show HN**. The submission URL should be the live app: `https://zkwizard.github.io/RoamingEye/` (Show HN wants something people can try right away — the live, no-signup site qualifies; a repo or landing page does not).
- Title field goes in verbatim (below). Then post the "First comment" immediately as the top comment ("explain how and why you built it").
- **Timing:** a US-morning weekday (roughly 8–10am ET, Tue–Thu) tends to do best. Post once.
- **Do not** ask for upvotes anywhere (against the rules). Just be around for a few hours to answer questions — that's what actually makes a Show HN work.
- Re-skim the README + recent `git log` right before posting so every claim still matches the app.

---

**Title:**

Show HN: RoamingEye – open-source 3D Earth for scrubbing decades of satellite imagery

---

**First comment (post as the top comment right after submitting):**

Hi HN — I built RoamingEye, a browser-based 3D Earth for looking at the public satellite archives over time. Grab the globe, scrub a timeline month-by-month, and watch vegetation green up, snow advance and retreat, cities spread. No account, no install, no fee — it's live at the link, and it's MIT-licensed.

The thesis: decades of Earth observation already sit in open archives that the public paid for (NASA MODIS, Harmonized Landsat-Sentinel), but most of it is reached through GIS software, API keys, and data-wrangling pipelines that shut out all but a few trained users. I wanted the "point, drag, scrub, and the planet's recorded history is in front of you" version.

What it does right now:

- A real WebGL globe (Three.js + TypeScript) — rotate, zoom from orbit to the surface.
- 9 open NASA science layers across vegetation (NDVI, EVI), temperature (land-surface, 2 m air, sea-surface), water (precipitation, soil moisture), cryosphere (snow cover), and atmosphere (aerosols).
- Native-resolution tile streaming: zoom in and the visible globe re-drapes itself with tiles chosen by screen-space error, down to ~31 m, with parent-tile fallback so detail refines instead of popping.
- A point time-series probe: click anywhere, chart that layer's value at that point across its full record (26–46 years depending on the product), and download a provenance-stamped CSV.
- A plate-tectonics context pack: Bird (2003) plate boundaries, ~1,200 Smithsonian GVP Holocene volcanoes, and live USGS seismicity, all on the terrain.
- Every high-res scene is stamped with its instrument and acquisition date (e.g. "Sentinel-2 · HLS S30 · 30 m · 2024-08-05") so what you see is citable.

The honest caveat, up front: the point probe does **not** read source granules. It inverts the rendered colormap back to a physical value, which is approximate — and the app says so everywhere it matters. METHODS.md documents the probe pipeline, the area weighting, the measured per-layer inversion accuracy, and the seasonal Mann-Kendall / Sen's-slope trend test, so you can see exactly where it stops being trustworthy. It's a reconnaissance-and-teaching instrument, not a replacement for pulling the real data.

A few build notes, since this crowd tends to ask: the hardest parts were (1) draping WMTS tiles onto a sphere and picking tile levels by on-screen error without popping artifacts, and (2) getting the temporal scrubber to feel like a physical ruler rather than a loading spinner. It's a static site — no backend — talking directly to public tile services.

Code: https://github.com/zkWizard/RoamingEye

I'd love feedback on whether the "look first, then go pull the real granules" workflow is actually useful to people who work with this data, and on where the colormap-inversion approach is too lossy to trust. Happy to answer anything about how it's built.
