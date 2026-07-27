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
- **Status:** researched

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
- **Status:** researched

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
  streaming.
- **Status:** researched

---

## Notes for future runs

- Prefer **quality over quantity** — one excellent, rules-respecting artifact per venue
  beats a spray list. Do not add venues you have not actually vetted.
- Candidate venues still to research (do NOT add until rules are read): OSGeo Discourse /
  community, Project Pythia / educational geoscience networks, r/dataisbeautiful (OC
  rules), Mastodon/fediverse open-science tags, university remote-sensing course
  networks, and complementary open-tool maintainers (STAC / stackstac / leafmap /
  TiTiler) as potential contributors.
- Always re-skim `README.md` and recent `git log` before drafting so claims match the
  current app (feature set, layer count, resolution).
- **Contributor funnel:** the README links newcomers to the `good first issue` label, so
  keep that queue non-empty. As of 2026-07-15 it was refilled with #373/#374/#375 (see
  LOG). When those close, verify the code afresh and open 1–3 new well-scoped ones —
  never file vague or stale tasks. Held candidates already vetted: a "Searching…"
  in-flight indicator for `SearchBox`, and reconciling the README layer count with
  `LAYERS`.
