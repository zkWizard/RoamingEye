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
- 2026-07-27 — **Outbox freshness audit — all six drafts pointed at a dead URL.** Twelve days
  after the workspace was written, none of it had landed on `main` (the consolidation PR sat
  `BEHIND`) and nothing had been sent. Re-checked every claim against the current repo and
  found a systemic defect: the site moved to the custom domain **roamingeye.org** earlier the
  same day (`7bafef4`; `scripts/deploy.mjs` now writes a `CNAME` on every deploy), so all
  **8** live-URL references across the six drafts still read `zkwizard.github.io/RoamingEye/`.
  That link only redirects — tolerable in a forum post, but wrong as a Show HN submission URL
  and _permanently_ wrong in an awesome-list entry, where the row is scraped and rarely
  revisited. Corrected all 8, stamped each draft with a `Claims re-verified:` header line, and
  added a "Before you send any draft" checklist to `outbox/README.md` plus a standing
  canonical-URL rule in TARGETS so this cannot regress. Also folded in the **place search**
  feature (shipped since the drafts were written — traces a searched boundary and surfaces its
  month-over-month vegetation/rainfall/soil-moisture/air-temperature signals) where it
  genuinely strengthens the pitch: the Show HN feature list and the classroom quickstart.
  Signals re-checked and still flat: **1 star, 0 forks, 0 external watchers, zero
  outside-authored issues** — expected, because nothing has been sent yet. The bottleneck is
  not draft supply (six are ready); it is that the workspace has never reached `main` for
  zkWizard to review. So this run added no seventh draft — it merged current `main` into the
  consolidation branch to clear its `BEHIND` state and put the whole corrected workspace one
  merge away. Second housekeeping item for zkWizard, alongside the empty repo description: the
  repo `homepage` field also still points at the old github.io URL (`gh repo edit` command in
  TARGETS Notes).
- 2026-07-27 — **Vetted the citation track; closed the pipeline's oldest open loop.** Duty 1
  (venue research), chosen because the outbox already holds six unsent drafts — supply is not
  the constraint — and three entries had been sitting unresolved. Three verdicts, each from
  the venue's own published rules rather than a guess:
  **(1) JOSS — declined for now, with a date.** The Journal of Open Source Software is the
  highest-leverage credibility artifact available to a research tool (peer-reviewed, DOI,
  citable in a methods section). It is also unreachable today: JOSS rejects software with
  **fewer than six months of public development history**, and this repo's first commit is
  2026-06-28 — **29 days old**, so a submission now is a guaranteed desk rejection on a rule
  with no judgment component. **Earliest eligible: 2026-12-29.** Recorded the second, softer
  gate too ("substantial scholarly effort" wants external adopters/citations; we have 1 star,
  0 forks, 0 outside contributors), plus the concrete runway: send the existing drafts to earn
  named adopters, and land flagship #170 (real GIBS colormap inversion) since a reviewer can
  fairly call the probe approximate until absolute values are defensible.
  **(2) NASA Earthdata Forum — participation-only, no draft.** Precisely our audience (the
  MODIS/HLS/GIBS user community talking to NASA DAAC experts), but it is a **Q&A support
  forum**: moderators explicitly work to keep users from "going off-question" and no
  self-promotion allowance exists in the FAQ or Usage Terms. So an announcement thread would
  be off-question by default — logged as participation-only so no future run drafts one.
  **(3) Reddit (r/gis, r/remotesensing) — parked, blocked on zkWizard.** Rule verification has
  now failed twice (Jul-15, Jul-27): Reddit is unreachable from this agent's fetch layer and
  search returns only generic SEO articles, never the actual sidebars. Rather than leave it
  ambiguous a third time, the entry now carries a four-question checklist zkWizard can answer
  in ~2 minutes (self-promo thread? flair? karma minimum? affiliation disclosure?), after
  which the draft can be written. No Reddit draft until real rules are read.
  Also noted a cross-pipeline insight: at 29 days old the project reads as very young to any
  maturity-gated venue, which argues for pressing the usefulness-now venues (three.js, HN,
  Pangeo, classrooms) and letting the citation track mature. Signals re-checked, still flat:
  1 star, 0 forks, 0 external watchers, no outside-authored issues or PRs — unchanged because
  nothing has been sent. Repo housekeeping for zkWizard still pending and now two items: the
  empty repo **description** and the stale **homepage** field (still the old github.io URL);
  both have ready `gh repo edit` commands in TARGETS Notes. No new outbox draft this run.
- 2026-07-27 — Unblocked this workspace and put a hard send gate on it. (1) PR #408 had gone
  `CONFLICTING` — the comms bootstrap landed on main separately (#363, `147677b`) while this
  branch carried the richer files, giving an add/add conflict on `LOG.md`, `TARGETS.md` and
  `outbox/README.md`. Merged `origin/main` and resolved all three to this branch's versions
  after verifying they are a strict superset (main's only unique content was `Status:
researched` lines and a to-research list this branch has since consumed into real, vetted
  entries; the bootstrap log entry is preserved verbatim). All 5 required checks were already
  green — the conflict was the only thing keeping 10 PRs' worth of comms work off main.
  (2) While re-verifying the live URL, found the custom domain is **not fully live**:
  `https://roamingeye.org/` fails TLS (GitHub Pages has verified the domain but issued no
  certificate — `https_certificate: null`, `https_enforced: false`), and
  `zkwizard.github.io/RoamingEye/` now 301s to **`http://`** roamingeye.org, an HTTPS→HTTP
  downgrade. There is currently no working HTTPS route to the app, so every draft here would
  land a researcher on a certificate warning. Added a ⛔ send gate at the top of
  `outbox/README.md` (measurements + the two commands that clear it) and a pipeline-level
  block note in TARGETS. Drafts themselves are unchanged — their URL is already correct.
- 2026-07-27 — **Closed the pipeline's last untouched duty: contributor outreach (Duty 3).**
  TARGETS itself named this "the clearest gap" — every one of the six drafts targets a
  _venue_; none had ever approached a _person_. Picked it over drafting a seventh venue post
  (supply isn't the constraint — nothing has been sent) and over onboarding polish (the
  good-first-issue queue #373/#374/#375 is still open, so refilling it would be wrong).
  Researched the four candidates the notes had parked, checking each against the GitHub API
  rather than assuming: **leafmap** (`opengeos`, 3.7k★, MIT, pushed 2026-07-27 — alive),
  **stackstac** (269★ but **not pushed since 2024-08-10**, ~2 years dormant), **TiTiler**
  (active, but server-side and company-maintained), **stac-spec** (a specification, not a
  contributor pool). Two declines recorded with the evidence that produced them, so no future
  run re-researches them: stackstac is dormant and approaching a quiet single-maintainer
  project asks for time they evidently don't have; TiTiler has no shared user journey with a
  deliberately backend-less static site, though it's a plausible future _dependency_.
  Drafted the leafmap approach (`outbox/leafmap-interop-invitation.md`). Read
  `docs/contributing.md` first: it routes feature requests to the **issue tracker** and asks
  for narrow scope on a volunteer-driven project. Chose **Discussions → "Ideas"** anyway and
  said why in the draft — the proposed work lives in _our_ repo, and an unsolicited external
  proposal shouldn't consume a volunteer's triage queue; a discussion converts to an issue on
  request. Explicitly ruled out **"Show and tell"**, which is for things built _with_ leafmap
  (RoamingEye isn't) and would read as drive-by promotion. The post asks rather than pitches:
  which leafmap entry points are stable enough to generate code against, so a "copy as Python"
  action at the probe export emits idiomatic code that won't age badly. That seam is real, not
  a pretext — the CSV header already carries `lat`, `lon`, `data_product`, `data_doi` and the
  date range (`src/lib/probe.ts`), which is nearly the argument list for a starter snippet. All
  the work stays on our side; the contributor invitation (flagship #170, real GIBS colormap
  inversion) rides at the end rather than leading. Added send notes warning that the offer must
  be genuine, that no individual maintainer should be @-mentioned or emailed, and that silence
  is an answer — no follow-up bump.
  **Signals (now including traffic, which prior runs hadn't pulled): 1 star, 0 forks, 0 external
  watchers, zero outside-authored issues — and 43 views / 10 unique visitors in 14 days.** Set
  against 11,941 clones from 503 uniques, which is our own CI, not people. Ten human visitors a
  fortnight is the honest size of the top of this funnel, and it will not move until something
  is sent. **The ⛔ HTTPS send gate is unchanged and re-measured today:** `https_certificate:
null`, `https_enforced: false`, `https://roamingeye.org/` still fails TLS, and
  `zkwizard.github.io/RoamingEye/` still `301`s to plain `http://`. Seven drafts now wait on one
  maintainer action. Also still pending for zkWizard: the empty repo **description** and the
  stale **homepage** field (`gh repo edit` commands in TARGETS Notes).
- 2026-07-27 — **Duplicated an existing PR; backed it out. Net result: one measured follow-up
  note, no doc change.** Picked contributor onboarding (Duty 4) because the outbox holds seven
  unsent drafts behind the ⛔ HTTPS gate (re-measured today: `https_certificate: null`,
  `https_enforced: false`) and refilling the good-first-issue queue would be wrong while
  #373/#374/#375 are all still open and unclaimed. Signals still flat: 1 star, 0 forks, 0
  external watchers, every issue and non-Dependabot PR maintainer-authored.
  Target was a real defect — `ARCHITECTURE.md` mapped `src/lib/` with a **9-row table** against
  **176** non-test modules. Walked the import graph from `src/main.ts` and measured: **42 wired,
  134 not**; of the 134, **108 imported by nothing but their own unit test** and **26 only by
  each other**; **none** used by `scripts/`, `contract/`, or e2e. Every directory outside
  `src/lib/` is 100% wired. Wrote a grouped map of all 42 wired modules and a "beyond the app
  surface" section, committed it here, and got all 5 required checks green.
  **Then found PR #570** — opened ~3 h earlier, same defect, same fix ("Wired vs. staged
  modules"), plus a stale-CI-note fix in `.github/CONTRIBUTING.md` this PR did not touch. I had
  not checked open PRs against `ARCHITECTURE.md` before starting. Two PRs editing the same
  section would conflict, and #570 is first and better-placed, so I **reverted `ARCHITECTURE.md`
  here** and left #408 as the single-purpose comms workspace it is meant to be. **Do not re-do
  this work; track #570.**
  **Standing check for future runs: `gh pr list --state open --json number,title,files` and
  filter for the file you intend to edit, _before_ writing anything.** At ~185 open PRs this
  repo will silently duplicate any docs work.
  One measured thing #570 does _not_ do, kept as a scoped follow-up: it preserves the original
  9-row table as "core modules", so **33 of the 42 wired modules remain undocumented** —
  including `probe.ts`, `colormap.ts`, `trend.ts`, `numerics.ts`, `citation.ts`,
  `placeObservationExport.ts`, `viewState.ts`, `legend.ts` and `tiles.ts`. Once #570 lands, a
  future run can add the grouped map of all 42 (geometry & projection; time/catalog/session;
  probe/colormaps/statistics; domain datasets; provenance & export; platform) on top of it,
  taking each responsibility from the module's own doc comment. Also worth folding in: the
  108-vs-26 breakdown of the unwired set, which #570 does not carry.
- 2026-07-27 (later run) — **Caught and corrected a foot-gun in our own housekeeping advice;
  no new draft.** Checked open PRs by file first (the standing check): `comms/TARGETS.md` and
  `comms/outbox/README.md` are touched only by the stranded stack this PR consolidates and by
  the conflicting #410, so editing them here is safe. Skipped Duty 1 (14 venues researched, 0
  sent — more would be a spray list), Duty 4 (#373/#374/#375 still open and unclaimed) and
  Duty 6 (signals pulled hours ago, still 1 star / 0 forks / 0 external watchers).
  **The correction:** TARGETS told zkWizard to set the repo `homepage` to
  `https://roamingeye.org/` and to "apply together with the description above". Measured both
  values today — current `https://zkwizard.github.io/RoamingEye/` gives `301` →
  `http://roamingeye.org/` → `200` (reaches the app, downgraded), while
  `https://roamingeye.org/` returns curl status `000` and exits non-zero: **the connection
  never completes**, so that command would swap a working About-sidebar link for an unopenable
  one. Rewrote the note as an explicit hold with a 5-step sequence putting the homepage flip
  _after_ the cert/Enforce-HTTPS/`curl` checks, and split the **description** fix out as safe
  to apply today — it is plain text, independent of the gate, and the only awareness win
  available while seven drafts sit blocked.
  **Also audited, clean, so nobody redoes it:** every in-repo link in the outbox resolves on
  `main` — `ARCHITECTURE.md`, `METHODS.md`, `docs/research-recipes.md`,
  `.github/CONTRIBUTING.md`, `.github/ISSUE_TEMPLATE/feedback.yml`, and the
  `good first issue` label (3 issues). The gate itself is re-measured and unchanged:
  `https_certificate: null`, `https_enforced: false`.
  _Windows note for future runs:_ `git cat-file -e <ref>:<path/with/slashes>` and grep output
  get mangled by MSYS path conversion (`origin/main:.github/x` → `origin\main;.github\x`),
  which produced two false "MISSING on main" readings before `git ls-tree` settled it. Verify
  with `git ls-tree -r --name-only` or `cat -A`, not `cat-file -e`.
- 2026-07-27 (third run) — **Diagnosed the HTTPS gate to root cause and recorded two
  previously-unlogged consequences; no new draft, no link churn.** The gate had already been
  measured twice, so re-measuring it again would have been churn; instead answered the
  question both earlier entries left open — _is something misconfigured, or is the cert just
  slow?_ It is just slow. Checked every record GitHub Pages needs: apex `A` = all four
  `185.199.108–111.153`, apex `AAAA` = `2606:50c0:8000–8003::153`, `www` `CNAME` →
  `zkwizard.github.io`, **no `CAA`** blocking issuance, `protected_domain_state: verified`.
  Configuration is correct and issuance is simply pending, so the gate note now says
  explicitly: **do not touch DNS/`CNAME`/custom domain to force it** — that restarts
  verification and lengthens the wait.
  **Two new consequences found, neither previously recorded:** (1) the v1.1.0 "You are here"
  geolocation pin is **dead on the live site** — verified in a real browser on
  `http://roamingeye.org/`, `window.isSecureContext` is `false` and `getCurrentPosition`
  fails with code `1`, _"Only secure origins are allowed"_; it degrades politely (toggle
  reverts + toast) so it reads as a denied permission, not a broken site — worth knowing
  before demoing to anyone. (2) `.github/workflows/health-check.yml` monitors the `https://`
  URL and so **went red on 2026-07-27 after seven consecutive daily successes** — a
  credibility signal on the public Actions tab; it self-heals when the cert lands, and should
  not be edited to mask it.
  **Considered and rejected:** rewriting the dead `https://roamingeye.org/` link in
  `README.md`, `docs/research-recipes.md`, `index.html` (`og:url`/`og:image`) and the health
  check to `http://`. Since the cert is provisioning normally that churn would need reverting
  within a day and risks stranding a plain-HTTP link in the README. Recorded as a dated
  revisit-if-still-null-after-48h (2026-07-29) instead. Ran the standing by-file check first:
  no open PR touches any of those four paths.
  Skipped Duty 1 (14 venues researched, 0 sent), Duty 4 (#373/#374/#375 still open and
  unclaimed) and Duty 3 — all still blocked behind the same gate.
