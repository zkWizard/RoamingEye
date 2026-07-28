To: public
Venue: three.js forum (https://discourse.threejs.org/)
Channel: "Showcase" category (https://discourse.threejs.org/c/showcase/7) — text post; posts require moderator approval before they appear
Status: DRAFT
Date: 2026-07-16

---

**Title:** RoamingEye — a streaming 3D Earth for scrubbing decades of open satellite imagery

Hi everyone,

I've been building **RoamingEye**, an open-source (MIT) three.js globe for exploring the public satellite archives — NASA MODIS and Harmonized Landsat-Sentinel — and I'd love this forum's eyes on the rendering side, because the interesting problems here are graphics problems.

**Live, no account/install/fee:** https://zkwizard.github.io/RoamingEye/
**Code:** https://github.com/zkWizard/RoamingEye

**The rendering, since that's what this crowd cares about.** It's a single textured sphere in three.js — no heavy GIS framework. The globe re-drapes itself with WMTS imagery tiles chosen by **screen-space error**: as you zoom, only the visible tiles refine, up to each layer's native resolution (terrain reaches ~31 m), with **parent-tile fallback** so detail sharpens progressively instead of popping to blank while a child tile loads. NASA's GIBS WMS is CORS-open, so tiles stream straight into GPU textures with **no backend at all** — the whole thing is a static site. The geodesy, timeline, tile selection, and geocoding are pure, unit-tested functions kept deliberately separate from the rendering and DOM.

**What you can actually do with it:**

- Grab and spin a real 3D Earth; scrub a temporal slider month-by-month through years of composites and watch seasons turn.
- 9 open NASA science layers (vegetation, temperature, water, cryosphere, atmosphere).
- Click any point to chart that layer's full-record time series and export a provenance-stamped CSV.
- A context pack of plate boundaries, ~1,200 Holocene volcanoes, and live USGS seismicity on the same globe.

**The honest part.** The point-probe reads values back by inverting the rendered colormap, not from source granules — it's approximate and the app says so everywhere it matters. It's a reconnaissance and teaching instrument, not a lab-grade extraction tool.

**Where I'd love help / feedback.** The hard graphics problems are exactly the open ones: tile-edge **skirts** to hide seams between LOD levels, **polar tile handling** near the singularities of the lat/long grid, and pushing toward Sentinel-2 at 10 m. If any of that is your kind of fun, the repo is contributor-friendly (there's an `ARCHITECTURE.md` tour and `good first issue`s), and I'm very happy to talk through how the tile pyramid and screen-space-error picker work.

Thanks for three.js — this project leans on it heavily and it's been a joy to build on.

— zkWizard
