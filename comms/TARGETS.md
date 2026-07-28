# Community & Venue Pipeline

Where RoamingEye can be shared honestly and usefully. One entry per venue.
**Read each venue's posting rules before drafting** — many communities ban drive-by
self-promotion, and the compliant path (a showcase category, a monthly thread, a
pull request) is noted below. All external posts are drafted into `outbox/` for
zkWizard to review and personally send — this file never triggers a send.

Status legend: `researched` → `drafted` → `sent-by-user` → `follow-up` / `declined`.

**This file is the research; [`SEND-PLAN.md`](SEND-PLAN.md) is the order.** Seven drafts
are ready and they should not all go out at once — the send plan holds the recommended
sequence (three.js → Pangeo → leafmap → Show HN → the awesome-list PRs), the reasoning
behind that order, the presence cost of each slot, and the pre-launch baseline to measure
against. Read it before sending anything.

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
- **Status:** **blocked on zkWizard — needs a 2-minute in-app rules check.** Programmatic
  verification has now failed **twice** (2026-07-15 and 2026-07-27): Reddit is unreachable
  from this agent's fetch layer, and web search returns only third-party SEO articles about
  "Reddit self-promotion rules" in general — not the actual sidebar text of these two subs.
  Third-hand rule summaries are not a sound basis for a compliance decision, so **no draft
  will be written for Reddit until the real rules are read.** This entry is deliberately
  parked rather than left ambiguous. What zkWizard needs to check in the sidebar / wiki of
  each sub (r/gis, r/remotesensing) — takes about two minutes:
  1. Is there a **self-promotion rule**, and does it confine promo to a designated
     weekly/monthly showcase or "what are you working on" thread?
  2. Is **post flair** required, and which flair covers a project/tool share?
  3. Is there a **karma / account-age minimum** for link posts?
  4. Does the sub require **affiliation disclosure** ("I built this") in the post body?
     Paste the answers into this entry and the draft can be written in the next run. Until
     then: no post, no link drop.

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

### NASA Earthdata Forum — participation-only (no announcement post)

- **URL:** https://forum.earthdata.nasa.gov/ (boards include _Projects → MODIS_,
  _Services/Usage → Visualization_, and a Worldview/GIBS board)
- **Audience & size:** the NASA Earth-science data user community talking directly with
  subject-matter experts from NASA's Distributed Active Archive Centers (DAACs). This is
  the most precisely on-target audience in the whole pipeline — these are literally the
  people using the MODIS, HLS, and GIBS products RoamingEye renders.
- **Why RoamingEye fits:** it is built entirely on the data these boards support (GIBS
  WMTS tiles, MODIS, Harmonized Landsat-Sentinel), and its provenance-first stance —
  every layer cited, every probe export uncertainty-labelled — matches how this community
  expects data to be handled and cited.
- **Posting rules / compliant path:** **this is a question-and-answer support forum, not a
  showcase.** Its stated purpose is for the scientific user community and DAAC experts to
  "discuss research needs, data, and data applications," moderators explicitly work to
  "prevent users from going off-question," and each board administrator sets additional
  rules with warnings for breaches. The published FAQ and Usage Terms do **not** grant any
  self-promotion allowance — so a "check out my tool" thread would be off-question by
  default and is **not** a compliant path. The only compliant path is
  **participation-first**: answer real GIBS/MODIS/HLS questions as a knowledgeable
  community member, and mention RoamingEye _only_ where it directly answers the specific
  question someone asked (e.g. someone asking how to eyeball a GIBS layer over time before
  ordering granules).
- **Best angle:** none as an announcement. Treat this as a long-game credibility venue:
  genuine help earns standing, and standing is what later makes a Worldview/GIBS-board
  mention welcome rather than spam. Also a strong listening post for real user problems
  worth putting on the roadmap.
- **Status:** researched → **participation-only; no draft, and none should be written.**
  Revisit only if a forum user asks a question RoamingEye genuinely answers. Requires
  zkWizard posting personally as himself — never an automated or agent-written post.

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

## Academic & citation venues

### Journal of Open Source Software (JOSS) — declined **for now**; earliest eligible 2026-12-29

- **URL:** https://joss.theoj.org/ (submission guide:
  https://joss.readthedocs.io/en/latest/submitting.html)
- **Audience & size:** JOSS is a peer-reviewed, open-access academic journal
  (ISSN 2475-9066) for research software. A JOSS paper is indexed and citable and comes
  with a DOI — it converts "a cool website" into something a researcher can _cite in a
  methods section_, which is the single highest-leverage credibility artifact available to
  this project and directly serves the roadmap's teaching- and research-adoption goals.
- **Why RoamingEye would fit (eventually):** it is MIT-licensed (JOSS requires an
  OSI-approved license ✅), has public development history, comprehensive tests, real
  documentation, `CITATION.cff`, a published methodology (`METHODS.md`), and clear
  contribution pathways — several of JOSS's "open development practices" indicators are
  already satisfied.
- **Why it is declined right now — two gates, one of them hard:**
  1. **Hard gate — age.** JOSS rejects software with **fewer than six months of public
     development history**. This repository's first commit is **2026-06-28** and it was
     created **2026-06-29**, making it **29 days old** as of this entry. A submission now
     would be desk-rejected on a rule with no judgment component. **Earliest eligible date:
     2026-12-29.** Do not submit before then.
  2. **Soft gate — "substantial scholarly effort."** JOSS wants evidence of research
     impact: publications _using_ the software, external adopters, integrations, or
     benchmarks showing credible near-term significance. Current signals are 1 star,
     0 forks, 0 outside contributors and zero outside-authored issues — no external
     adoption story exists yet. JOSS also rejects "minor utility" packages and single-
     function tools, so the submission must argue **research enablement**, not a nice
     globe.
- **What to accumulate before 2026-12-29 (this is the actual work):**
  - **External adopters** — even 2–3 named classrooms or researchers using it. This is
    exactly what the drafted outreach in `outbox/` is for; sending those drafts _is_ the
    JOSS runway.
  - **A defensible scholarly core.** The strongest claim is not the visualization but the
    combination of (a) the screen-space-error WMTS tile-streaming engine (RFC-001), (b) the
    provenance- and uncertainty-stamped time-series export, and (c) the documented
    colormap-inversion methodology. Note that flagship issue
    [#170](https://github.com/zkWizard/RoamingEye/issues/170) (invert against GIBS's real
    colormaps for accurate absolute probe values) is squarely on the critical path — until
    the probe returns defensible absolute values, a reviewer can fairly call the science
    surface approximate.
  - **Feature completeness**, since JOSS rejects "half-baked solutions."
- **Best angle when the time comes:** a paper framed as _"a zero-install, provenance-first
  reconnaissance instrument for multi-decadal open EO archives"_ — emphasize reproducibility
  and the citable export, not the rendering.
- **Status:** **declined for now (dated).** Re-evaluate on or after **2026-12-29** against
  both gates. Do not submit early — a desk rejection is a public record and burns the shot.

---

## Complementary open-tool maintainers (contributor outreach)

The people most likely to contribute usefully to RoamingEye are maintainers and users of
tools that sit **next to** it in a workflow — Python/notebook analysis stacks that start
where a browser globe stops. This is outreach to _people_, not a venue post, so the bar is
different: lead with something genuinely useful to them, keep the ask small enough for a
volunteer, and never cold-email an individual — post to the project's own public board and
address the project.

### leafmap (opengeos/leafmap) — drafted

- **URL:** https://github.com/opengeos/leafmap (docs: https://leafmap.org)
- **Audience & size:** ~3.7k stars, MIT, **actively developed** (last push 2026-07-27,
  verified via GitHub API). A Python package for interactive mapping and geospatial
  analysis in Jupyter with minimal coding; JOSS-published, maintained under the
  Open Geospatial Solutions (`opengeos`) org alongside geemap and segment-geospatial.
- **Why RoamingEye fits:** the strongest complementarity in the pipeline, and it is
  genuine rather than rhetorical. RoamingEye's own statement of need positions it as the
  reconnaissance step **before** you pull L3 granules; leafmap is where that pull happens.
  Same audience (researchers, educators, students), same licence (MIT), same
  no-friction-for-newcomers value. Crucially they do **not** compete — leafmap is
  Python/Jupyter, RoamingEye is browser/no-install, and RoamingEye sends traffic _toward_
  notebook work rather than away from it.
- **The concrete seam:** the probe's CSV header already carries `lat`, `lon`,
  `data_product` (short name + version), `data_doi`, the date range, and an explicit
  uncertainty line (`src/lib/probe.ts`). That is very nearly the argument list for a
  leafmap starter snippet — so a "copy as Python" action at the export is a small, real
  feature, not a pretext.
- **Posting rules / compliant path:** `docs/contributing.md` routes bug reports and
  feature requests to the **issue tracker** and asks proposals to "explain in detail how
  it would work" and "keep the scope as narrow as possible," noting it is volunteer-driven.
  Code of Conduct is the Contributor Covenant. No explicit self-promotion ban. Discussions
  are enabled with categories General / Ideas / Polls / Q&A / **Show and tell**.
  **Compliant path chosen: Discussions → "Ideas."** Not an issue, because the work being
  proposed lives in _our_ repo and an unsolicited external proposal shouldn't consume a
  volunteer's triage queue; if a maintainer wants it tracked, a discussion converts to a
  narrow issue on request. **Not "Show and tell"** — that category is for things built
  _with_ leafmap, which RoamingEye is not; posting there would be drive-by promotion.
- **Best angle:** ask, don't pitch. The post asks which leafmap entry points are stable
  enough to generate code against, so the snippet we ship is idiomatic and doesn't age
  badly — an implicit compliment, zero maintenance burden for them, and all the work on
  our side. The contributor invitation rides along at the end (flagship #170, real GIBS
  colormap inversion) rather than leading.
- **Status:** drafted → `outbox/leafmap-interop-invitation.md` (awaiting zkWizard review &
  post; ⛔ also gated on the HTTPS block)

### stackstac (gjoseph92/stackstac) — declined, dormant

- **URL:** https://github.com/gjoseph92/stackstac
- **Why it was considered:** "turn a STAC catalog into a dask-based xarray" is squarely the
  next step after visual reconnaissance, and it was listed as a candidate in earlier rounds.
- **Why declined:** **the project has not been pushed to since 2024-08-10** — nearly two
  years dormant as of 2026-07-27 (verified via GitHub API; 269 stars, MIT, not archived).
  Approaching a single-maintainer project that has gone quiet asks for time its maintainer
  has evidently not had. There is no version of this outreach that is useful to them.
- **Re-open only if:** the repo shows renewed commit activity, or maintenance moves to a
  new owner. Re-check the `pushed_at` date before reconsidering — that one API call is the
  whole test.

### TiTiler (developmentseed/titiler) — researched, not a contributor target

- **URL:** https://github.com/developmentseed/titiler
- **State:** active (last push 2026-07-27), ~1.1k stars, MIT, maintained by Development Seed.
- **Why not outreach:** it is a **server-side** dynamic raster tile service, and RoamingEye
  is deliberately a static, no-backend site — so there is no shared user journey to offer,
  and a company-maintained project is not a plausible source of volunteer contributors to a
  29-day-old globe. Logged so a future run doesn't re-research it.
- **Where it _is_ relevant:** as a possible future **dependency**, not a comms target — if
  RoamingEye ever needs to serve derived or user-supplied rasters, this is the reference
  implementation. That would be an engineering decision, not a comms one.

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
- **⛔ EVERYTHING IN THE PIPELINE IS SEND-BLOCKED until HTTPS works on the custom domain**
  (verified 2026-07-27). `https://roamingeye.org/` fails TLS — GitHub Pages has verified
  the domain but not yet issued a certificate (`https_certificate: null`,
  `https_enforced: false`), so the host serves the default `*.github.io` cert and browsers
  reject it. `https://zkwizard.github.io/RoamingEye/` now `301`s to **`http://`**
  roamingeye.org, an HTTPS→HTTP downgrade — so there is currently no working HTTPS route to
  the app. Do not send, and do not open awesome-list PRs (those links are permanent). The
  full gate, measurements, and the two commands that clear it are at the top of
  `outbox/README.md`. Nothing else in the pipeline needs to change — the drafts already
  carry the right URL.
- **Canonical live URL is `https://roamingeye.org/`** (custom domain, landed 2026-07-27 in
  `7bafef4`; `scripts/deploy.mjs` writes the `CNAME` on every deploy). The old
  `https://zkwizard.github.io/RoamingEye/` only redirects — never put it in a draft, and
  **never** in an awesome-list entry, where the link is permanent and gets scraped. All
  outbox drafts were corrected on 2026-07-27; check this before adding any new one.
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
  > **Safe to apply today.** The description is plain text and touches no link, so it is
  > independent of the HTTPS gate — it is the one awareness win available while all seven
  > drafts are send-blocked. Do _not_ bundle it with the homepage change below.
- **Repo homepage — DO NOT change it yet (corrected 2026-07-27, second measurement).** An
  earlier revision of this note told zkWizard to point `homepage` at
  `https://roamingeye.org/` and to "apply together with the description above". **Running
  that command today would break the repo's About link.** Re-measured:

  - `https://zkwizard.github.io/RoamingEye/` (the current, "stale" value) → `301` →
    `http://roamingeye.org/` → `200`. It reaches the app, over plain HTTP.
  - `https://roamingeye.org/` (previously recommended) → **connection failure.** No
    certificate exists for the host, so the browser cannot open it at all.

  A downgraded link is bad; an unopenable one is worse, and the About sidebar is the first
  thing anyone arriving from an awesome-list entry or a GitHub search clicks. The stale
  value is, for now, the _safer_ of the two.
  **Correct sequence — the homepage flip is the last step, not a companion step:**

  1. Wait for GitHub to issue the certificate (`https_certificate.state` → `approved`).
  2. Turn on **Enforce HTTPS** in _Settings → Pages_.
  3. Confirm `curl -sS -o /dev/null -w '%{http_code}\n' https://roamingeye.org/` returns
     `200` with no TLS error.
  4. _Then_ apply: `gh repo edit zkWizard/RoamingEye --homepage "https://roamingeye.org/"`
  5. The drafts unblock at the same moment — steps 1–3 are exactly the send gate in
     `outbox/README.md`.

- Candidate venues still to research (do NOT add until rules are read): university
  remote-sensing course networks. **Duty 3 (contributor outreach) is no longer the open
  gap** — the complementary-open-tool track was researched on 2026-07-27 and now has its
  own section above: leafmap **drafted**, stackstac **declined** (dormant since 2024-08-10),
  TiTiler **not a contributor target** (server-side; possible future dependency). The
  remaining untouched contributor source is RoamingEye's own stargazers/forkers — currently
  1 star and 0 forks, so there is nobody to invite until something has actually been sent.
  r/dataisbeautiful is parked with the other Reddit entries until the Reddit rules blocker
  above is cleared by zkWizard.
  _Researched most recently:_ **leafmap** (drafted), **stackstac** (declined — dormant),
  **TiTiler** (not a contributor target). Before that: **JOSS** (declined-for-now with a
  dated 2026-12-29 revisit) and the **NASA Earthdata Forum** (participation-only, no
  announcement). Prior rounds: three.js Showcase (drafted), OSGeo Discourse
  (participation-first), Mastodon/fediverse (value-first), Project Pythia (declined).
- **Venue maturity gate — worth knowing across the pipeline:** this repository is only
  **29 days old** (first commit 2026-06-28). Venues that gate on project maturity — JOSS
  (6 months), some awesome-lists' quality bars, and OSGeo Community Projects — will judge
  it as very young. Nothing in the pipeline is blocked by this _except_ JOSS, but it is a
  reason to prefer venues that reward usefulness now (three.js Showcase, HN, Pangeo,
  classrooms) and to let the citation-track venues mature.
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
