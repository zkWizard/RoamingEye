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
- 2026-07-15 — Filled the biggest audience gap: educators had no tailored material despite
  being a core stated audience and a 2026 roadmap goal ("Teaching adoption, ≥3 courses").
  Drafted a reusable classroom/lab one-pager (`outbox/classroom-lab-one-pager.md`) — leads
  with classroom utility (no login/install/fee, runs on Chromebooks), five ready-to-use
  lesson ideas mapped to real features (NDVI phenology scrub, wet-vs-dry drought compare,
  point-probe→CSV data-literacy exercise, tectonics/volcano/seismicity pattern-find,
  snow-cover cryosphere), a 5-minute quickstart, and the honest limits reframed as teachable
  moments (medium-res open imagery, approximate colormap-inversion probe, timeline-vs-probe
  record window). It's a SOURCE asset, not a cold post — added an "Educators & classrooms"
  section to TARGETS.md (status: drafted) noting the next step is to vet a specific educator
  venue's rules (Project Pythia / a university course network) and adapt it into that format.
  Verified every claim against README.md / METHODS.md (9 layers, MIT, live URL, CITATION.cff,
  provenance CSV headers).
- 2026-07-15 — Monitored signals (`gh api`): 1 star, 0 forks, 0 external watchers, and every
  open issue is maintainer-authored — the project is pre-traction with no newcomer activity
  to welcome yet, and the outbox already holds 5 unsent drafts. So instead of a 6th draft,
  expanded the venue pipeline (Duty 1), reading each venue's actual rules first. Added two
  vetted entries to TARGETS.md: **OSGeo Discourse** (ToS bans "advertisements/solicitations"
  → compliant path is Introductions/participation, or an OSGeo Community Projects application;
  MIT satisfies its license bar — never a promo post) and **Fediverse/Mastodon** Earth-science
  & open-science community (value-first norm, 3–5 hashtags; FediScience.org + curated
  all-geo/germanrepro account lists; ready to draft once zkWizard has an account). Vetted and
  **declined** Project Pythia's Resource Gallery — its criteria are "Python-justified learning
  resources" and RoamingEye is a TS/browser app (off-scope; recorded so no one files an
  off-topic PR — the drafted Pangeo Showcase post already reaches that audience). Trimmed the
  "candidate venues" note accordingly. No outbox draft this run (avoids saturating the queue).
- 2026-07-16 — Reached a new contributor persona. The pipeline's 5 drafts all target science /
  EO / educator audiences; none reached **graphics engineers**, whom the README explicitly
  recruits. RoamingEye _is_ a three.js app, and the three.js forum has a dedicated **Showcase**
  category whose stated purpose is literally "showcase any projects you have created using
  three.js" — the rare venue where a project post is the intended content (moderator-approved,
  standard civil/no-spam guidelines; posts are also considered for the three.js homepage).
  Read the category + forum guidelines, added it to TARGETS.md, and drafted a tailored post
  (`outbox/threejs-showcase-roamingeye.md`) that leads with the **rendering/engineering** story
  (single-globe, screen-space-error WMTS LOD, parent-tile fallback, no-backend static site) and
  invites help on the open graphics problems (tile skirts, polar handling, Sentinel-2 10 m) —
  awareness plus contributor recruitment. Verified claims against README (9 layers, ~31 m,
  Three.js, colormap-inversion probe). Also flagged a free discoverability win in TARGETS Notes:
  the repo's GitHub **description is empty** (`"description": null`) despite topics/homepage being
  set — left a ready-to-apply `gh repo edit` command + proposed text for zkWizard (editing public
  repo metadata unattended is a maintainer call, not the comms agent's to push).
- 2026-07-15 — Consolidated the entire `comms/` workspace into one PR against `main`
  so the improvements actually land. The prior work sat in an 8-deep base-to-base PR
  stack (#363→#401) whose root #363 was the only one targeting `main` and was blocked
  by a flaky "E2E smoke (WebGL)" required check; the chain could not drain. This PR
  carries the full workspace (TARGETS, LOG, and all outbox drafts) as a single
  docs-only change off `origin/main`, superseding the stack.
- 2026-07-15 — Filled the biggest strategic gap in the outreach portfolio: every prior
  draft is a broad-community post (Pangeo / HN / three.js / awesome-lists / classroom), but
  two _institutional_ roadmap goals had zero drafted outreach — **"NASA engagement"** and
  "Research partnerships". Drafted the NASA one (`outbox/nasa-gibs-ecosystem-engagement.md`):
  a value-first email to **earthdata-support@nasa.gov** (the GIBS "Contact Us" recommended
  path; Earthdata Forum noted as the technical alternative — verified both against the live
  GIBS docs). It leads with a thank-you + a concrete, answerable colormap question tied to
  flagship issue **#170** (canonical machine-readable GIBS colormap per layer, how to detect
  colormap/range drift, which products should not be pixel-inverted), and keeps the
  "ecosystem listing" ask soft and secondary — genuinely useful to the GIBS team, not a
  pitch. Added a new **Institutional / ecosystem engagement** section to TARGETS.md with the
  compliant channels and the explicit "email/forum, never a GitHub issue on nasa-gibs repos"
  boundary. Verified all claims against README (built on GIBS WMTS, 9 layers, MIT, live URL,
  probe inverts the rendered colormap). Stacked on the consolidation PR (#408) since the
  workspace isn't on `main` yet. Still undrafted: the **Research partnerships** goal
  (≥2 PhD-level EO/remote-sensing groups) — a natural next institutional-outreach run.
