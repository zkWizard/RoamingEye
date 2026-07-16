# Community & Venue Pipeline

Where RoamingEye can be shared honestly and usefully. One entry per venue.
**Read each venue's posting rules before drafting** — many communities ban drive-by
self-promotion, and the compliant path (a showcase category, a monthly thread, a
pull request) is noted below. All external posts are drafted into `outbox/` for
zkWizard to review and personally send — this file never triggers a send.

Status legend: `researched` → `drafted` → `sent-by-user` → `follow-up` / `declined`.

---

## Forums & communities

### Pangeo Discourse — "Pangeo Showcase"

- **URL:** https://discourse.pangeo.io/ (category: _Pangeo Showcase_)
- **Audience & size:** the open, reproducible, scalable geoscience community —
  researchers and engineers around Xarray, Dask, Zarr, Jupyter, and the cloud-native
  Earth-observation stack. Active Discourse with a standing monthly _Pangeo Showcase_
  talk series.
- **Why RoamingEye fits:** provenance-first and reproducible by design — every layer
  is cited, every probe export is uncertainty-labelled CSV. It is a fast visual
  reconnaissance step _before_ pulling L3 granules into an Xarray/Zarr pipeline, not a
  competitor to it. That framing is exactly what this community values.
- **Posting rules / compliant path:** post in the **Pangeo Showcase** category (built
  for "open, reproducible, and scalable science" tools). A code of conduct and
  community guidelines apply — keep it substantive and reproducibility-forward, not
  promotional. Even better: the monthly Showcase accepts short talk proposals; consider
  offering a live walkthrough rather than only a text post.
- **Best angle:** "A zero-install, provenance-first 3D globe for eyeballing multi-decadal
  open records before you pull granules — and it exports the time series you charted as
  a citable CSV." Lead with reproducibility and the open-data catalogue.
- **Status:** drafted → `outbox/pangeo-showcase-roamingeye.md` (awaiting zkWizard review & post)

### Hacker News — "Show HN"

- **URL:** https://news.ycombinator.com/ (guidelines: https://news.ycombinator.com/showhn.html)
- **Audience & size:** very large general technical audience; strong sub-interest in
  open source, mapping, data visualization, and WebGL.
- **Why RoamingEye fits:** it cleanly meets the Show HN bar — something you made that
  people can **try live with no signup, no install, no fee**, non-trivial, and the author
  is available to discuss. It is explicitly _not_ a blog post, landing page, or sign-up
  funnel (all disqualifying).
- **Posting rules / compliant path:** title must begin with "Show HN"; the thing must be
  usable without barriers (the live site qualifies); "explain how and why" you built it in
  the top comment; do **not** solicit upvotes. Post once, then stay in the thread to
  answer questions.
- **Best angle:** _"Show HN: RoamingEye – open-source 3D Earth for scrubbing decades of
  satellite imagery."_ Top comment: the "watch the Earth change" thesis, the open-data
  provenance stance, the honest-about-approximation probe, and the TypeScript + Three.js
  stack. Timing matters — a US-morning weekday tends to do best.
- **Status:** drafted → `outbox/hacker-news-show-hn.md` (awaiting zkWizard review & post)

### three.js forum — "Showcase"

- **URL:** https://discourse.threejs.org/ (category: _Showcase_,
  https://discourse.threejs.org/c/showcase/7)
- **Audience & size:** the official three.js community — graphics engineers, creative
  coders, and WebGL developers. A large, active Discourse; this is the home crowd for the
  library RoamingEye is built on, and it reaches a contributor persona (**graphics
  engineers / designers**) that the README explicitly recruits but no other venue in this
  pipeline targets.
- **Why RoamingEye fits:** it is, by definition, on-topic — a non-trivial three.js
  application (single textured globe, screen-space-error WMTS tile streaming with
  parent-tile fallback, tiles straight into GPU textures with no backend). The Showcase
  category exists precisely to share three.js projects, so this is the rare venue where a
  project post is the _intended_ content, not tolerated self-promotion.
- **Posting rules / compliant path:** post in the **Showcase** category — its stated
  purpose is _"Use this category to showcase any projects you have created using
  three.js."_ **Showcase posts require moderator approval**, so it may not appear
  immediately (be patient; don't repost). Standard forum guidelines apply: be civil, post
  only your own work, no spam, no signatures (profile info is attached automatically).
  Bonus: _"Projects posted here will be considered for the three.js homepage, which is
  updated a couple of times a year"_ — a genuine, non-solicited distribution channel.
- **Best angle:** lead with the **rendering/engineering story**, not the science — the
  tile pyramid, screen-space-error LOD picker, parent-tile fallback, and no-backend
  static-site architecture — then invite help on the open graphics problems (tile-edge
  skirts, polar handling, Sentinel-2 at 10 m). This is as much contributor recruitment as
  awareness. Screenshot or the demo GIF helps.
- **Status:** drafted → `outbox/threejs-showcase-roamingeye.md` (awaiting zkWizard review & post)

### Reddit — r/gis and r/remotesensing

- **URL:** https://www.reddit.com/r/gis/ , https://www.reddit.com/r/remotesensing/
- **Audience & size:** large, practitioner-heavy GIS and remote-sensing communities
  (hundreds of thousands combined) — the exact people who wrangle these archives daily.
- **Why RoamingEye fits:** a free, open, browser-native way to preview multi-decadal
  imagery and grab a provenance-stamped time series — genuinely useful to students,
  educators, and analysts in these subs.
- **Posting rules / compliant path:** **CONFIRM THE SIDEBAR RULES BEFORE DRAFTING.**
  GIS/remote-sensing subs commonly restrict self-promotion to a designated
  weekly/monthly showcase thread or require specific flair, and enforce a ~90/10
  participate-vs-promote norm; a drive-by link post risks removal. The compliant path is
  likely a "what are you working on / showcase" thread or a genuinely
  discussion-first post (e.g. "we built an open provenance-first globe — how do you check
  a site before pulling granules?"). Rules could not be fetched programmatically; verify
  in-app first.
- **Best angle:** classroom/fieldwork utility and open data — lead with a question or a
  workflow, not the link.
- **Status:** researched (rules pending sidebar confirmation)

### OSGeo Discourse / OSGeo community

- **URL:** https://discourse.osgeo.org/ (Introductions: https://discourse.osgeo.org/c/introductions/75);
  Community Projects program: https://wiki.osgeo.org/wiki/OSGeo_Community_Projects
- **Audience & size:** the Open Source Geospatial Foundation community — the developers,
  analysts, and users behind and around the OSGeo project ecosystem (QGIS, GDAL,
  GeoServer, and more). Discourse is OSGeo's primary communication hub.
- **Why RoamingEye fits:** open-source (MIT) and contributor-welcoming — exactly the kind
  of tool this community builds and discusses; a genuinely useful browser-native way to
  preview open EO archives and export a provenance-stamped series.
- **Posting rules / compliant path:** **the OSGeo Discourse ToS bans "advertisements …
  or other solicitations"** — a drive-by promo post is _not_ compliant and risks removal.
  The compliant path is participation-first: introduce the project in the **Introductions**
  category and engage in relevant threads as a community member. For a deeper commitment,
  RoamingEye could apply to the **OSGeo Community Projects** program (requires an
  OSI-approved / free license — MIT qualifies — and a welcoming-to-contributors posture),
  which offers promotion and incubation support. Follow the code of conduct. Never post a
  standalone advertisement.
- **Best angle:** show up as a community member sharing a useful open tool and asking for
  feedback, not announcing a product. Lead with the open license, open data, and provenance.
- **Status:** researched (compliant path = Introductions/participation, or a Community
  Projects application — not a promo post; no draft yet)

### Fediverse / Mastodon — Earth-science & open-science community

- **URL / channel:** an account on a science-friendly instance such as
  https://fediscience.org/; curated audiences at Earth Science on Mastodon
  (https://all-geo.org/mastodon-earthsci/) and Open Science on Mastodon
  (https://germanrepro.github.io/Mastodon-OpenScience/).
- **Audience & size:** Earth scientists, remote-sensing / geospatial professionals, and
  the open-science community active on the fediverse — researchers, educators, and data
  people who explicitly value open data and reproducibility. Reachable via hashtags rather
  than a single forum.
- **Why RoamingEye fits:** open data + provenance-stamped CSV + honest uncertainty labelling
  is inherently value-providing content, which is what this crowd rewards; RoamingEye is an
  open-science tool, not a commercial pitch.
- **Posting rules / compliant path:** fediverse norms favor **value over self-promotion** —
  no repetitive or marketing-style spam, participate authentically, and keep hashtags
  moderate (3–5). A single, genuinely useful post (e.g. "scrub 20+ years of open NASA
  imagery in-browser and export a provenance-stamped CSV, no account") tagged
  `#RemoteSensing #EarthObservation #OpenData #geoscience` is welcome. zkWizard posts from
  a personal account and should build presence by engaging first; this is not an automated
  channel.
- **Best angle:** value-first — a short "here's a free, open thing you can use right now"
  post with a screenshot or the demo GIF, 3–5 relevant hashtags, honest about the probe
  approximation. Optionally reply into relevant #geoscience / #OpenScience threads.
- **Status:** researched (rules clear; ready to draft a short post once zkWizard has a
  fediverse account — low effort, high fit)

---

## Curated "awesome" lists (contribute via pull request)

### awesome-open-geoscience (Software Underground)

- **URL:** https://github.com/softwareunderground/awesome-open-geoscience
- **Audience & size:** the Software Underground (SWUNG) community of open geoscience
  hackers and data wranglers — a warm, builder-heavy crowd with an active Slack.
- **Why RoamingEye fits:** it is exactly the kind of open, useful tool the list curates;
  the **Visualization** section already holds 3D plotting / geospatial-viz tools.
- **Posting rules / compliant path:** open a **pull request** adding RoamingEye under
  _Software → Visualization_ (or _Geospatial_). Read `CONTRIBUTING` first and follow the
  awesome-manifesto quality bar and the one-line entry format used by existing rows
  (name — one honest sentence — link). MIT license and live demo satisfy inclusion
  criteria.
- **Best angle:** one honest line — "RoamingEye — browser-based, provenance-first 3D
  globe for scrubbing decades of open NASA/HLS imagery, MIT."
- **Status:** drafted → `outbox/awesome-open-geoscience-pr.md` (ready-to-submit PR for zkWizard to open)

### awesome-earthobservation-code (acgeospatial)

- **URL:** https://github.com/acgeospatial/awesome-earthobservation-code
- **Audience & size:** Earth-observation / satellite-imagery developers and analysts;
  well-known curated list in the EO space.
- **Why RoamingEye fits:** on-topic (open EO tooling, satellite imagery, web viewer);
  the list explicitly welcomes contributions.
- **Posting rules / compliant path:** **pull request** following the list's contribution
  guidelines and section format; place under a visualization / web-viewer / tools
  section as the existing structure dictates. Verify the current section headings in the
  README at PR time.
- **Best angle:** same one-line honest description; emphasize open data + native-res tile
  streaming. Mirror the existing **Worldview** row (JS satellite viewer + live link).
- **Status:** drafted → `outbox/awesome-earthobservation-code-pr.md` (ready-to-submit PR for zkWizard to open)

---

## Institutional / ecosystem engagement

### NASA GIBS / ESDIS / Worldview

- **URL / channel:** email **earthdata-support@nasa.gov** (the GIBS "Contact Us" page's
  recommended path for suggestions/questions, https://nasa-gibs.github.io/gibs-api-docs/contact-us/);
  technical alternative: the **Earthdata Forum** (https://forum.earthdata.nasa.gov/, GIBS
  subforum), where questions are answered by NASA data experts.
- **Audience & size:** the team behind Global Imagery Browse Services — the NASA EOSDIS
  service RoamingEye streams **all** its imagery from — plus the Worldview and ESDIS
  communities around it. Not a "size" target; a strategic, high-credibility one, and a
  stated 2026 roadmap goal ("NASA engagement — contact the GIBS / ESDIS / Worldview teams;
  validate our inversion approach and pursue an ecosystem listing").
- **Why RoamingEye fits:** it is a direct, honest downstream user of GIBS WMTS that cites
  GIBS in-app and in the README. The outreach is value-first — it thanks the team and asks
  a genuine technical question whose answer improves accuracy for everyone reading a GIBS
  colormap, not a promo pitch.
- **Posting rules / compliant path:** **email the support address, or ask on the Earthdata
  Forum** — those are the documented channels. Do **not** file it as an issue/PR on the
  `nasa-gibs` GitHub repos (that would be posting on another project's repo; also not the
  team's stated contact path for this kind of inquiry). This is drafted for zkWizard to send
  personally; the comms agent never emails or posts it. The mailing list
  (`eosdis-gibs-announce-join@lists.nasa.gov`) is info-only (subscribe for updates), not a
  support channel.
- **Best angle:** lead with the thank-you and the concrete colormap-inversion question tied
  to flagship issue [#170](https://github.com/zkWizard/RoamingEye/issues/170) — ask for the
  canonical machine-readable GIBS colormap source per layer, how to detect colormap/range
  changes, and which products should not be pixel-inverted at all. Keep the "ecosystem
  listing" ask soft and secondary. Honest that the project is small/early.
- **Status:** drafted → `outbox/nasa-gibs-ecosystem-engagement.md` (awaiting zkWizard review
  & send). Follow-up: if they answer the colormap question, it directly unblocks #170.

---

## Educators & classrooms (reusable asset, then targeted venues)

### Classroom / lab one-pager (source asset)

- **URL / channel:** not a single venue — a reusable one-pager to hand out as a course-page
  link, printed handout, workshop packet insert, or the body of an email to an instructor.
- **Audience & size:** secondary and undergraduate instructors, TAs, lab leads, and STEM
  outreach coordinators — a core stated RoamingEye audience, and a 2026 roadmap goal
  ("Teaching adoption — used in ≥3 university courses or classrooms").
- **Why RoamingEye fits:** zero-install, no-account, no-fee, runs on managed/Chromebook
  hardware; real open NASA data; provenance and honest-uncertainty labelling make it a
  live data-literacy lesson, not just a demo. Nothing in the pipeline targeted educators
  directly before this.
- **Posting rules / compliant path:** none — it's a source asset the user adapts per venue.
  When aiming it at a specific educator network (a syllabus, a methods lab, a Project
  Pythia / educational-geoscience channel), copy the relevant sections into that venue's
  format and vet that venue's own posting rules first.
- **Best angle:** lead with classroom utility (no login, works in a browser, real data)
  and five ready-to-use lesson ideas mapped to features; make the honest limits a
  teachable moment rather than a disclaimer.
- **Status:** drafted → `outbox/classroom-lab-one-pager.md` (reusable; awaiting zkWizard
  review before adapting to specific educator venues)

---

## Vetted & set aside (do not re-pursue without a new angle)

### Project Pythia Resource Gallery — declined (off-scope)

- **URL:** https://projectpythia.org/resource-gallery/ (Pythia is Pangeo's education working group)
- **Why it was considered:** an educational-geoscience audience overlapping our classroom
  goal, tied to the Pangeo community we already target.
- **Why declined:** the Gallery's stated inclusion criteria are **"Python-justified
  learning resources"** that are open-source, community-owned, and geoscience-focused.
  RoamingEye is a TypeScript / browser tool with no Python or Jupyter surface, so it does
  **not** meet the gallery's scope — submitting it would be an off-topic PR. Do not open one.
- **Still reachable:** the same broad Pangeo/Pythia audience is already addressed by the
  drafted **Pangeo Showcase** post (`outbox/pangeo-showcase-roamingeye.md`). If RoamingEye
  ever ships a companion Python notebook that loads a probe-export CSV into Xarray, _that
  notebook_ (not the app) could be a legitimate Pythia Cookbook/Gallery candidate.

---

## Notes for future runs

- Prefer **quality over quantity** — one excellent, rules-respecting artifact per venue
  beats a spray list. Do not add venues you have not actually vetted.
- **Repo discoverability (housekeeping — for zkWizard to apply):** the GitHub repo's
  one-line **description is currently empty** (`gh api repos/zkWizard/RoamingEye`
  → `"description": null`), even though topics and homepage are set. That one line is what
  shows in GitHub search results, the repo card, social/OG previews, and awesome-list link
  previews — an easy awareness win. Suggested text (≤ the display length, claims verified
  against README):
  > Open-source 3D Earth for exploring decades of open NASA/HLS satellite imagery in the browser — temporal scrubber, provenance-stamped time-series probe, native-resolution tiles. No account, no install (MIT).
  > Apply with:
  > `gh repo edit zkWizard/RoamingEye --description "<text above>"`
  > (Left for zkWizard rather than auto-applied — editing public repo metadata is a
  > maintainer call, not something the comms agent pushes unattended.)
- Candidate venues still to research (do NOT add until rules are read): r/dataisbeautiful
  (OC rules), university remote-sensing course networks, and complementary open-tool
  maintainers (STAC / stackstac / leafmap / TiTiler) as potential contributors.
  _Researched this round:_ **three.js forum Showcase** (added — reaches the graphics-engineer
  contributor persona; on-topic by definition, moderator-approved). Prior rounds: OSGeo
  Discourse (participation-first), Mastodon/fediverse (value-first); Project Pythia (declined).
- **Educator reach:** `outbox/classroom-lab-one-pager.md` is now a ready source asset —
  the next educator-facing step is to vet a _specific_ venue's rules (Project Pythia /
  educational-geoscience networks, a university remote-sensing course network) and adapt
  the one-pager into that venue's format, rather than posting the generic sheet cold.
- Always re-skim `README.md` and recent `git log` before drafting so claims match the
  current app (feature set, layer count, resolution).
- **Contributor funnel:** the README links newcomers to the `good first issue` label, so
  keep that queue non-empty. As of 2026-07-15 it was refilled with #373/#374/#375 (see
  LOG). When those close, verify the code afresh and open 1–3 new well-scoped ones —
  never file vague or stale tasks. Held candidates already vetted: a "Searching…"
  in-flight indicator for `SearchBox`, and reconciling the README layer count with
  `LAYERS`.
