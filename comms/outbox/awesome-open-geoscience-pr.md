To: softwareunderground/awesome-open-geoscience (maintainers)
Venue: GitHub — Awesome Open Geoscience (Software Underground)
Channel: Pull request → `Visualization` section
Status: DRAFT
Date: 2026-07-15

---

## Compliant path (read before submitting)

This is a **pull request** to https://github.com/softwareunderground/awesome-open-geoscience,
not a post. That is the list's intended, rules-respecting contribution path. Before
opening it, please:

1. Re-read the repo's `contributing.md` — confirm the current entry format and the
   quality bar (the awesome-manifesto expects genuinely useful, maintained projects).
2. Confirm the **Visualization** section still exists and check the alphabetical
   position for `RoamingEye` (it sorts after `PyVista`, before `Redflag`/etc. — verify
   against the live file at PR time).
3. Confirm the language-badge convention. The list uses small icon images from
   `media/icon/` (e.g. the Python badge). There is a **JavaScript** icon in that folder;
   RoamingEye is TypeScript, but JavaScript is the closest existing badge and matches how
   other browser/JS tools are tagged. If a badge feels wrong, it is fine to omit it — a
   few entries have no badge.

Keep it to **one entry, one honest sentence, no trailing period** (house style). Do not
edit unrelated lines.

---

## The entry to add (under `## Visualization`, in alphabetical order)

```text
*   [RoamingEye](https://github.com/zkWizard/RoamingEye) – [![JavaScript](/softwareunderground/awesome-open-geoscience/raw/main/media/icon/javascript.png)](/softwareunderground/awesome-open-geoscience/blob/main/media/icon/javascript.png) browser-based, provenance-first 3D globe for scrubbing decades of open NASA MODIS and Harmonized Landsat-Sentinel imagery, with a point time-series probe and citable CSV export
```

**Verify the badge path** against how a neighbouring JavaScript entry references its icon
(the exact `media/icon/…` filename must match what is in the repo). If there is no
`javascript.png`, drop the badge and use the plain form:

```text
*   [RoamingEye](https://github.com/zkWizard/RoamingEye) – browser-based, provenance-first 3D globe for scrubbing decades of open NASA MODIS and Harmonized Landsat-Sentinel imagery, with a point time-series probe and citable CSV export
```

---

## Suggested PR title

```
Add RoamingEye to Visualization
```

## Suggested PR description

```
Adds RoamingEye under Visualization — an open-source (MIT), browser-based 3D globe for
exploring decades of open satellite imagery (NASA MODIS + Harmonized Landsat-Sentinel)
with a temporal scrubber, native-resolution WMTS tile streaming, a point time-series
probe with provenance-stamped CSV export, and a plate-tectonics / volcano / seismicity
context pack. TypeScript + Three.js, no account or install.

- Repo:  https://github.com/zkWizard/RoamingEye
- Live:  https://zkwizard.github.io/RoamingEye/
- License: MIT
- Data: 100% open, every dataset cited and every export uncertainty-labelled

Follows the list's one-line, alphabetical-within-section format. Happy to adjust the
badge or wording to match house style.
```

---

## Why this fits (context for the reviewer, not part of the PR)

The Visualization section already holds interactive geospatial-display tools (PyVista,
ipyleaflet-style viewers). RoamingEye is the same shape — a visualization tool — but web-
native and provenance-first: every layer is cited and every probe export is an
uncertainty-labelled CSV, which is squarely in the SWUNG open/reproducible ethos. MIT
license + a live, no-signup demo satisfy the inclusion criteria.
