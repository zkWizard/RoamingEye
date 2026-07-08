# Launch checklist

The plan for taking RoamingEye from "built in the open" to "found in the open."
Working doc for maintainers — checked items are done, ☐ items are pending.
Strategy in one line: **the product and docs are ready; the bottleneck is
distribution.** Everything here serves getting the right first hundred people
to the live site and the issue tracker.

---

## 1. Pre-flight (repo puts its best foot forward)

- [x] Issue tracker triaged — stale/shipped issues closed, remaining 9 groomed
      with pointers + definition of done, `flagship` label on the drawn-study-regions
      effort ([#26](https://github.com/zkWizard/RoamingEye/issues/26)).
- [x] Repo topics set (`earth-observation`, `remote-sensing`, `threejs`, …) for
      GitHub search/Explore discovery.
- [x] GitHub Discussions enabled (ROADMAP already links to it).
- [x] README roadmap summary matches `ROADMAP.md`.
- [ ] **Zenodo DOI** — maintainer-only: connect the repo at
      [zenodo.org/account/settings/github](https://zenodo.org/account/settings/github),
      flip the switch for `zkWizard/RoamingEye`, cut a tagged release
      (e.g. `v1.0.0`), then add the DOI badge to the README and `CITATION.cff`.
      A citable DOI is a real credibility signal for the researcher audience.
- [ ] **Social preview image** — maintainer-only: repo Settings → General →
      Social preview. Upload a 1280×640 raster (a globe screenshot with the
      banner tagline beats the default auto-card). This is what every HN/Reddit/
      social link unfurls to.
- [x] Cut a release with human-readable notes — **v1.0.0 — the open
      Earth-observation globe** (docs/launch/release-notes-v1.0.0.md).
- [x] Final smoke pass on the live site (v1.0.0 deploy, 2026-07-08): cold
      load, scrub, probe, share-link round-trip — green on desktop + emulated
      mobile viewports. A real-device Safari/Android pass is still worthwhile
      before the HN submission.

## 2. Launch assets

- [x] **Demo GIF/video ≤ 30 s** — regenerated at v1.0.0 quality
      (scripts/capture-demo.mjs → docs/demo.gif).
- [ ] **Technical write-up** — working title: _"Streaming NASA's satellite archive
      to a 3D globe in the browser — with no backend."_ The RFC-001 story
      (screen-space-error quadtree, parent-tile fallback, GPU memory budget,
      all against a public WMTS endpoint) is genuinely interesting to graphics
      and infra people — exactly the contributors we want. Publish on a blog or
      dev.to; it doubles as the HN submission or first comment.
- [x] **Maintainer comment template** —
      docs/launch/maintainer-comment-template.md, with per-channel closing
      lines.

## 3. Channels (in order)

Tue–Thu, morning US Eastern is the best submission window for HN; stagger
channels a day or two apart so each gets a fresh push and feedback from one
improves the next.

1. **Show HN** — primary. Draft title (≤ 80 chars):
   > Show HN: RoamingEye – scrub decades of NASA satellite imagery on a 3D globe
   > First comment (from the maintainer, immediately): what it is, the open-data
   > thesis (30 m ceiling, stated honestly), the no-backend architecture in two
   > sentences, and "we're looking for contributors — good first issues here."
   > HN rewards the honest-limitations paragraph more than any feature list.
2. **r/gis and r/remotesensing** — the practitioner audience. Lead with a
   research recipe (drought signal or deforestation patch), not the tech stack.
   Read each sub's self-promo rules first; both allow OSS shares with engagement.
3. **Three.js Discourse (Showcase)** — recruits the graphics contributors for
   the RFC-001 follow-ons (skirts, polar handling, 3D terrain). Lead with the
   quadtree LOD engine.
4. **Awesome-list PRs** — `awesome-open-geoscience`, `awesome-gis`,
   `sacridini/Awesome-Geospatial`, and Earth-observation lists. Slow-burn
   discovery that compounds; one PR each, follow their contribution format.
5. **"Powered by GIBS"** — NASA GIBS showcases downstream apps; ask via their
   [gibs-api-docs](https://nasa-gibs.github.io/gibs-api-docs/) contact. A NASA
   page linking back is the single best backlink this project could get.
6. **Mastodon/Bluesky** — #EarthObservation / #RemoteSensing / science
   communities. Short video + live link + "100% open data" framing travels well
   there.
7. **Product Hunt** — optional, later; wrong audience for contributors but fine
   for users once the above has landed.

## 4. First 48 hours after each post

- Reply to every substantive comment within the hour where possible — thread
  velocity decides HN/Reddit ranking, and responsiveness _is_ the pitch to
  potential contributors.
- Watch the live site: GIBS rate limiting or a traffic-triggered bug during the
  launch window is the worst case. Have the graceful-degradation story ready.
- Triage new issues same-day; label `good first issue` generously; greet every
  first-time commenter by name.
- Convert recurring questions into README/FAQ edits immediately — the thread is
  telling you what the docs are missing.

## 5. After the wave (retention)

- Respond to first PRs within 24 h, review kindly, land them fast — the first
  merged PR is the moment a visitor becomes a contributor.
- Monthly "what shipped" post in Discussions (CHANGELOG is the raw material).
- Keep exactly one 🚩 flagship open and well-specced (#26 now) as the standing
  "come build something real" invitation.
- Story gallery (curated deep links to real Earth change — Aral Sea, urban
  growth, deforestation frontiers) — every shared story markets the tool.

## 6. What to watch (lightweight, no dashboards needed)

- GitHub: stars, **unique cloners**, issue comments from new accounts, first
  external PR (the real KPI).
- Traffic: repo Insights → Traffic referrers tells you which channel worked;
  double down there, skip the rest.
- Quality signal: are the research recipes being cited/linked? That's the
  researcher audience arriving.
