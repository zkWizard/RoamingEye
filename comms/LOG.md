# Comms Log

One line per run: date — what was done. Terse.

- 2026-07-15 — Bootstrapped the `comms/` workspace (TARGETS.md, LOG.md, outbox/).
  Seeded the pipeline with 5 vetted venues, each with its posting rules read and a
  compliant path noted: Pangeo Discourse (Showcase category), Hacker News (Show HN
  guidelines), Reddit r/gis + r/remotesensing (rules pending sidebar confirmation),
  awesome-open-geoscience (PR → Visualization), awesome-earthobservation-code (PR).
- 2026-07-15 — Drafted the first outreach: Pangeo Showcase post
  (`outbox/pangeo-showcase-roamingeye.md`), tailored to the reproducible/cloud-native
  EO crowd — "look first, then pull granules" framing, honest about colormap-inversion
  limits (links METHODS.md), asks for feedback on making the CSV export Xarray-loadable.
  TARGETS.md Pangeo entry → drafted.
- 2026-07-15 — Contributor onboarding: the README advertises a "good first issues" link
  but the queue was empty (all 11 prior good-first-issues have been completed). Refilled
  it with 3 fresh, code-verified starter issues: #373 (a11y — time-slider announces
  "Month" on annual year-stepping layers, `TimeSlider.ts:53`), #374 (a11y — keyboard
  navigation for place-search results, `SearchBox.ts`, with `LayerSelector.ts` as an
  in-repo reference), #375 (docs — `CONTRIBUTING.md` Node version vs `package.json`).
  Held for a future run: a "Searching…" in-flight indicator for `SearchBox` (overlaps
  #374's file) and reconciling the README "9 layers" count with the 11 in `LAYERS`
  (maintainer judgment call — continuous seasonal layers vs. incl. land-cover/terrain).
- 2026-07-15 — Drafted the Show HN post (`outbox/hacker-news-show-hn.md`): "Show HN:
  RoamingEye – open-source 3D Earth for scrubbing decades of satellite imagery", with a
  title + author's first comment (thesis, feature list, build notes, and the
  colormap-inversion caveat up front), plus posting notes (submit the live URL, no
  upvote-soliciting, US-morning weekday timing). Verified all claims against README
  (kept "9 scientific layers" to match the public count). TARGETS.md HN entry → drafted.
  Still researched-not-drafted: the two awesome-list PRs (draft as ready-to-submit PR
  bodies next) and Reddit (rules still pending in-app confirmation).
- 2026-07-15 — Drafted both awesome-list PR submissions (compliant path = a PR to those
  external repos; drafted into the outbox for zkWizard to open, never submitted by me).
  Fetched each list's live format: `outbox/awesome-open-geoscience-pr.md` (SWUNG →
  Visualization section, en-dash + JS-badge + no-trailing-period house style, alphabetical
  placement + badge-path caveats noted) and `outbox/awesome-earthobservation-code-pr.md`
  (→ Visualisation, mirrors the existing Worldview row: name - one sentence - `Javascript`
  - [here](live)). Each file carries the exact entry line, a suggested PR title/body, and
    a "read before submitting" checklist. Verified all claims against README (MIT, live URL,
    MODIS + HLS, ~31 m, TS + Three.js). TARGETS.md both entries → drafted. Remaining pipeline:
    Reddit (rules pending in-app confirmation); candidate venues in TARGETS "Notes" still to
    vet before drafting.
