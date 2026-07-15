To: acgeospatial/awesome-earthobservation-code (maintainer)
Venue: GitHub — Awesome Earth Observation Code
Channel: Pull request → `Visualisation` section
Status: DRAFT
Date: 2026-07-15

---

## Compliant path (read before submitting)

This is a **pull request** to https://github.com/acgeospatial/awesome-earthobservation-code,
not a post. The list explicitly welcomes contributions ("Please suggest groupings or
re-assignments if needed") and has no strict alphabetical/format mandate, but please:

1. Open the current README and confirm the **Visualisation** section heading and its
   present entries at PR time (section names have shifted before).
2. Match the existing entry style exactly. The closest precedent already in the list is
   the **Worldview** row — a JavaScript satellite-imagery viewer with a live link — so
   mirror that shape (name, dash, one-sentence description, a `` `Javascript` `` tag, and a
   `[here](live-url)` link).
3. One entry, one line. Do not touch unrelated rows.

RoamingEye is the same category as the Worldview entry (an in-browser viewer over open
NASA imagery), so Visualisation is the natural home.

---

## The entry to add (under `## Visualisation`)

```text
*   [RoamingEye](https://github.com/zkWizard/RoamingEye) - Provenance-first 3D globe for scrubbing decades of open NASA MODIS + Harmonized Landsat-Sentinel imagery, with a point time-series probe and citable CSV export `Javascript` application [here](https://zkwizard.github.io/RoamingEye/)
```

(RoamingEye is written in TypeScript; the list tags browser tools with `` `Javascript` ``,
matching the Worldview row, so that tag is used for consistency. Adjust if the maintainer
prefers `` `Typescript` ``.)

---

## Suggested PR title

```
Add RoamingEye (3D open-satellite viewer) to Visualisation
```

## Suggested PR description

```
Adds RoamingEye under Visualisation — an open-source (MIT), browser-based 3D globe for
exploring decades of open satellite imagery (NASA MODIS + Harmonized Landsat-Sentinel).
It has a temporal scrubber, native-resolution WMTS tile streaming (down to ~31 m),
a point time-series probe with a provenance-stamped CSV export, and a plate-tectonics /
volcano / live-seismicity context pack. TypeScript + Three.js, no account or install.

- Repo:  https://github.com/zkWizard/RoamingEye
- Live:  https://zkwizard.github.io/RoamingEye/
- License: MIT

Same category as the existing Worldview entry (browser viewer over open NASA imagery),
so I placed it under Visualisation and matched that row's format. Happy to re-group if
you'd prefer it elsewhere.
```

---

## Why this fits (context for the reviewer, not part of the PR)

The list already carries Worldview (NASA-GIBS 2D viewer) and STAC/COG browser tooling.
RoamingEye is complementary: a 3D, provenance-first alternative that renders the same
open archives, adds a temporal scrubber and a citable time-series probe, and is fully
open-source. It fills a gap between Worldview (2D, hosted) and code-first EO stacks.
