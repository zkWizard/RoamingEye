To: public — instructors, TAs, lab leads, and outreach coordinators (secondary through undergraduate)
Venue: reusable asset (not a single-venue post) — hand out as a course-page link, a printed one-pager, or the body of an email to an educator / course network
Channel: classroom handout / course website / workshop packet / instructor email
Status: DRAFT
Date: 2026-07-15

<!--
  This is a SOURCE ASSET, not a one-off message. It is a single-page,
  claim-checked overview an instructor can adopt as-is or trim per course.
  When zkWizard tailors it for a specific course network (e.g. an intro-GIS
  syllabus, an Earth-science methods lab, a data-literacy unit), copy the
  relevant sections into that venue's format and flip Status. Every feature
  claim below is verified against README.md / METHODS.md as of 2026-07-15.
-->

---

# RoamingEye in the classroom

**A free, open 3D Earth for teaching how the planet changes — nothing to install, no account, no fee.**

RoamingEye turns the public satellite archives that governments already fund — NASA's MODIS and Harmonized Landsat–Sentinel collections — into a browser-based globe your students can grab, spin, and scrub through time. It runs on any modern laptop or Chromebook, opens from a single link, and asks for no login. Open-source (MIT), so you can fork it, screenshot it, or build a lab around it freely.

**Open it and go:** https://zkwizard.github.io/RoamingEye/
**Source & license (MIT):** https://github.com/zkWizard/RoamingEye

---

## Why it works in a teaching setting

- **Zero friction.** No account, no install, no license seat, no API key — just a URL. Works on school-managed laptops, Chromebooks, and lab machines where you can't install GIS software.
- **The data is real and open.** Every layer is an actual NASA product, not a stylised demo. Students look at the same archives researchers use.
- **It teaches good data habits by default.** Every scene is stamped with its instrument and acquisition date (e.g. _Sentinel-2 · HLS S30 · 30 m · 2024-08-05_), every dataset is cited, and the tool is openly honest about where its numbers are approximate — a built-in lesson in provenance and uncertainty.
- **One link = one reproducible view.** The address bar encodes the layer, month, and camera angle, so you can send a class a link that opens exactly the scene you set up.

---

## Ready-to-use lesson ideas

Each maps to a real feature. Pick by level; all run in a browser tab.

**1. Watch the seasons turn — vegetation phenology _(secondary → intro undergrad)_**
Load the monthly NDVI (vegetation) layer and drag the temporal scrubber month-by-month. Have students describe the green-up and senescence cycle over a region they know, then contrast a temperate forest with a tropical or desert site. _Concept:_ seasonality, the growing season, why a single snapshot misleads.

**2. Wet year vs. dry year — drought & agriculture _(undergrad)_**
Compare vegetation vigour over the same farming region between a known wet year and a dry year. Bring in the precipitation and soil-moisture layers to build the causal story. _Concept:_ multi-variable reasoning, interannual variability.

**3. Click a point, chart the record — data literacy _(undergrad / methods lab)_**
Use the point time-series probe: click any spot and get that layer's value charted across its full record (decades, depending on layer), then download a **provenance-stamped CSV**. Students plot it themselves in a spreadsheet or notebook and write up what they see. _Concept:_ turning imagery into a time series, reading trends, and — because the tool labels the probe as approximate by design — a frank discussion of measurement uncertainty. (The method and its limits are documented in [METHODS.md](https://github.com/zkWizard/RoamingEye/blob/main/METHODS.md).)

**4. Where the Earth is restless — plate tectonics & geohazards _(secondary → undergrad)_**
Turn on the tectonics context pack: plate boundaries, ~1,200 Holocene volcanoes coloured by eruption recency, and live recent earthquakes coloured by depth, all on the 3D globe. Ask students to find the pattern before you name it. _Concept:_ plate boundaries, the ring of fire, why quakes and volcanoes cluster.

**5. Snow that comes and goes — the cryosphere _(secondary)_**
Scrub the monthly snow-cover layer across a winter and into spring over a mountain range. _Concept:_ seasonal snowpack advance and retreat, and why it matters for water supply.

> Five step-by-step research walkthroughs (drought signals, land-surface-temperature trends, a plate-tectonics lecture view, snowpack tracking, deforestation figures) live in
> [docs/research-recipes.md](https://github.com/zkWizard/RoamingEye/blob/main/docs/research-recipes.md) — several adapt directly into a lab handout.

---

## Getting started in five minutes

1. Open **https://zkwizard.github.io/RoamingEye/** — the globe loads with no sign-in.
2. Drag to rotate, scroll to zoom. Zoom in and the imagery re-draws at higher resolution automatically.
3. Open the **layer picker** and choose a scientific layer (start with vegetation / NDVI).
4. Drag the **temporal scrubber** to step through months and watch the layer change.
5. **Click a point** to chart its time series, then **download the CSV** for a spreadsheet exercise.
6. Copy the browser URL to hand the class the exact view you set up.

---

## Honest limits (worth saying out loud to students — they're teachable)

- **Open imagery is medium-resolution.** Recent, frequently-revisited open data tops out around 10 m (Sentinel-2) to 30 m (Landsat/HLS). Sub-metre "street-level" imagery lives only in commercial archives; RoamingEye stays fully open on purpose. Great prompt: _why is the freely available picture coarser, and who pays for the sharp one?_
- **The point probe is approximate by design.** Values are recovered from the displayed colour (colormap inversion), so it's reliable for **trends and comparisons**, not exact absolute measurements — and the app says so wherever it shows a number. That honesty is itself the lesson.
- **The timeline shows recent monthly composites; the probe charts the longer record.** The scrubber sweeps the last few years month-by-month, while the point time series reaches back across the full multi-decadal archive.

---

## Free to cite, fork, and keep

- **Cite the tool:** the repo ships a `CITATION.cff` — GitHub's **"Cite this repository"** button gives ready APA/BibTeX. CSV exports embed their own provenance (source, view URL, tool version) in the header, so student work is reproducible.
- **Make it your own:** MIT-licensed — fork it for a course, restyle it, or add a dataset. A newcomer's tour is in [ARCHITECTURE.md](https://github.com/zkWizard/RoamingEye/blob/main/ARCHITECTURE.md), and student-friendly starter tasks are labelled [good first issue](https://github.com/zkWizard/RoamingEye/labels/good%20first%20issue) — a real open-source contribution as a class project.
- **Tell us how it went:** if you use it in a class, the two-minute [feedback form](https://github.com/zkWizard/RoamingEye/issues/new?template=feedback.yml) shapes what gets built next. Instructor feedback is explicitly on the project's 2026 roadmap.

_RoamingEye is a volunteer, open-source project. It collects no student data and shows no ads — it's just a link._
