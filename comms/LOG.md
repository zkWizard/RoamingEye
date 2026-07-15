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
