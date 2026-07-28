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
- 2026-07-27 (fourth run) — **Wrote the missing send plan (`comms/SEND-PLAN.md`).** Seven
  drafts are written and claim-checked, and nothing anywhere recorded **what to send first,
  when, or what each one costs to run** — `TARGETS.md` holds per-venue research and `outbox/`
  holds content, but the sequencing lived nowhere. When the gate clears, zkWizard would have
  faced seven ready drafts and no plan; the failure mode is firing them all in one day, which
  wastes the only Show HN shot this project gets and leaves every thread unanswered.
  The plan orders the five sendable items — **three.js Showcase → Pangeo → leafmap → Show HN
  → the two awesome-list PRs** — from five principles taken from rules already read and
  recorded here, not invented: reversible before permanent (an awesome-list row is scraped
  and mirrored; a forum post can be edited); rehearse before the one-shot (slots 1–3 generate
  the FAQ that sharpens the HN top comment); one live thread at a time (HN and three.js both
  expect the author present — two at once means both answered badly); moderator latency is
  free (three.js Showcase queues, so posting early costs nothing); and traction helps
  gatekeepers. Each slot carries its **presence cost** — slot 4 is flagged as a real
  2–4 hour calendar commitment, not a submit-and-leave.
  Also folded in three project-specific **"verify it healed"** checks that no generic launch
  checklist would contain, because they are consequences of the gate this workspace measured:
  the geolocation pin is dead over plain HTTP (`isSecureContext: false`), `health-check.yml`
  is red on the public Actions tab, and HTTPS must actually return `200`. All three self-heal
  when the cert lands — the plan says confirm they did, before sending traffic.
  Recorded a **pre-launch baseline** so "did this work?" has an answer later: 1 star, 0 forks,
  0 external watchers, 0 outside-authored issues/PRs, **43 views / 10 unique visitors** in the
  rolling 14-day window, and — the sharpest number — the **only referrer is `github.com`, 2
  uniques**, i.e. no external traffic source exists at all. (11,941 clones from 503 uniques is
  our own CI; the plan says to ignore it.) Explicitly listed the six items that are _not_ in
  the sequence with the reason each is excluded, so no future run mistakes an unscheduled item
  for an overlooked one.
  **Verified, so nobody redoes it:** all three `good first issue` entries still hold exactly
  against current `main` — #373 (`TimeSlider.ts:53` still hardcodes `aria-label` "Month" while
  `stepUnit` sits at line 36), #374 (`SearchBox.ts` still has only the `Escape` handler at
  lines 35–36), #375 (`.github/CONTRIBUTING.md:30` still says "Node.js 20+" vs `package.json`
  `^20.19.0 || >=22.12.0`). All three are unclaimed with zero comments, so the queue is healthy
  and refilling it would be wrong. Ran the standing by-file check first: only this PR and #410
  touch `comms/`. Gate re-measured and unchanged (`https_certificate: null`,
  `https_enforced: false`) — though the TLS failure has changed shape, now
  `SEC_E_WRONG_PRINCIPAL` rather than a dead connection: the host completes the handshake and
  presents the default `*.github.io` certificate, which is the same "no cert for our domain"
  conclusion, not progress. Signals otherwise flat and unchanged.
- 2026-07-27 (fifth run) — **Routed the classroom one-pager: vetted three educator venues and
  drafted the one submission that takes a tool.** `SEND-PLAN.md` had just named this as the
  pipeline's one explicitly-unfinished item — the one-pager sits in §4 as "not scheduled…
  needs a specific educator venue vetted first" — so an asset written on 2026-07-15 had spent
  twelve days with nowhere to go, against a roadmap goal ("teaching adoption, ≥3 courses") and
  a core stated audience. Duty 1 was skipped by the last two runs on the correct reasoning that
  14 researched venues with 0 sent means supply is not the constraint; that objection does not
  apply here, because this adds no new draft looking for a venue — it gives an existing
  stranded asset a route.
  **Three verdicts, each read from the venue's own published rules:**
  **(1) CLEAN (cleanet.org) — the route; drafted.** The peer-reviewed climate/energy education
  collection at CU Boulder, mirrored by NOAA Climate.gov's teaching portal. Its submission form
  accepts resources that "are educational activities **or are interactive tools,
  visualizations, maps, or datasets that can be used to create classroom, lab, or field
  activities**" — the only educator venue found that takes a _tool_ rather than a finished
  lesson plan. Decisively, **developer self-submission is sanctioned**: the form carries a
  checkbox to receive the reviewers' comments if you built the thing, so this is an invited
  submission, not self-promotion. Drafted `outbox/clean-collection-submission.md` field-by-field
  against the real form. **Pitched deliberately narrow** — CLEAN warns that "general websites
  addressing many aspects of climate or energy science are not as useful as specific ones
  geared toward a focused topic", and a nine-layer globe sold as "explore the Earth" is exactly
  that shape, so the description leads with seasonal vegetation phenology + snow cover and lets
  the rest be context. Also recorded their scored criteria, including the one we fail:
  "presence of a teacher's guide" — we have none, so the draft says so plainly and links
  `docs/research-recipes.md` instead of hoping a reviewer misses it. Added as **slot 2b** in
  `SEND-PLAN.md`, marked a parallel track with no presence cost (a form is not a live thread,
  so principle 3 does not bind it) and worth starting early because the four-stage review runs
  for months.
  **(2) SERC "Teach the Earth" / NAGT — parked, and _not_ on rules.** The largest US
  geoscience-education portal, and it does not list tools at all: it takes classroom-**tested**
  activities described with course context, goals, materials and assessment, plus "notes and
  tips for instructors… common areas of confusion". So the compliant path is not "list
  RoamingEye" — it is an instructor who has actually run a RoamingEye lab contributing that
  lab. Writing one on spec would be dishonest against a form that asks how students met the
  goals. Recorded as second-order: reachable _after_ adoption, which is what CLEAN and the
  one-pager are for. Also logged the licence detail nobody would expect — TTE contributions go
  out **CC BY-NC-SA 4.0** (the write-up only; RoamingEye stays MIT), a deliberate choice, not a
  footnote.
  **(3) Earth Exploration Toolbook — parked pending a one-line question.** Conceptually the best
  fit in the whole pipeline (chapters are "step-by-step instructions to walk users through an
  example of using data and tools", i.e. `docs/research-recipes.md` in their format, and the
  template explicitly permits outside authors) — but the site's initial publication date is
  2006, the newest dated item on it is a 2011 award, and there is no open call for authors. A
  chapter is hours of work, so the entry says: **ask whether they still accept community
  chapters before writing one**, and do not invest on spec.
  Ran the standing by-file check first: the only open PRs touching `comms/` are #571 (this
  branch's base) and #573, the merge train carrying it — no duplication. Branched off #571
  rather than `main` so the LOG/TARGETS/SEND-PLAN appends do not collide with it in the train,
  and worked in a detached `git worktree` because the shared clone had the active merge train
  checked out. Gate re-measured, unchanged: `https_certificate: null`, `https_enforced: false`.
  Signals unchanged: 1 star, 0 forks, 0 external watchers. Repo `description` is **still
  `null`** — eleven days after it was first flagged, still the one awareness win available
  while every draft is send-blocked, and still left for zkWizard because editing public repo
  metadata unattended is a maintainer call.
- 2026-07-28 — **Measured the traction baseline for the first time and found two metric traps
  that would have put false claims into drafts.** Duty 6, chosen because every other duty is
  either done or blocked: the outbox holds eight drafts and all are send-blocked; educator
  venues were just routed (#580); onboarding docs are owned by open #570; and venue supply is
  not the constraint. Signals had been "checked" on three prior runs, but only ever as
  `stars/forks/watchers` — **nobody had looked at the traffic API**, and it turns out to be the
  one place the project's real state is visible. New file `comms/SIGNALS.md` records it.
  **The honest picture: pre-traction, zero external audience.** 43 views / 10 uniques over the
  14-day window, with **zero views on seven of the last eight days**; referrers are
  `github.com` only; 0 forks; **0 issues or PRs authored by anyone but the maintainer.** That
  is the expected result — nothing has been sent — and it is now a _recorded zero point_ so the
  post-outreach lift is measurable instead of guessed.
  **Trap 1 — clone counts are not adoption, do not cite them.** The API reports **11,941 clones
  from 503 unique cloners** against **10 unique viewers** and 1 star. Humans view before they
  clone, so a 50× clone-to-view ratio is not an audience; the shape confirms it — 98% of the
  clones fall in a four-day burst (07-13→07-16, peaking at 4,357/day) that then collapses to
  ~15/day. Deliberately did **not** guess a cause (candidates: mirror/scraper automation, or
  our own fleet — 1,213 workflow runs in the same window); the decision does not depend on it.
  This matters because that number is exactly the kind of thing that ends up in a Show HN
  comment or a JOSS submission, where JOSS specifically weighs real external usage — quoting it
  would be unsupportable.
  **Trap 2 — "1 star" is not one interested user, and it closes Duty 3.** Identified the
  stargazer for the first time: `statuette`, bio `cryptostatuette.eth`, 1 public repo, 1
  follower, no earth-science/GIS signal — a drive-by. So true external interest is **0, not
  1**, and the pipeline's last open contributor source is now **closed rather than pending**:
  there is nobody on the stargazer list to invite, and no invitation should be drafted for that
  account. TARGETS updated accordingly, plus a standing rule that no traction number goes into
  a draft without checking SIGNALS.md — **currently none of them are quotable.**
  Also killed a recurring time sink: **Reddit programmatic verification failed a third time**,
  so the entry now lists the exact routes already exhausted (`about/rules.json` on `www` and
  `old`, via fetch layer = domain-blocked, via `curl` = `403`/`302`) and says plainly: do not
  retry, it needs a human with a browser. Gate re-measured once and unchanged
  (`https_certificate: null`, `https_enforced: false`; `https://roamingeye.org/` still fails
  TLS, `github.io` still `301`s to plain `http://`) — no link churn, the 2026-07-29 revisit
  stands. Ran the standing by-file check first: open PRs touching `comms/` are #571 and #580
  (this branch's base, which already carries #571) and #573 the merge train — branched off
  #580 so the LOG/TARGETS appends chain instead of colliding, and worked in a detached
  `git worktree` to stay clear of the shared clone. Repo `description` is **still `null`** —
  twelve days flagged, still the only awareness win available while everything is send-blocked.
- 2026-07-27 — Found a second, untracked comms surface and folded it in. `docs/launch/`
  predates this workspace and holds **four sendable outreach drafts** — r/gis, EO
  Slack/Discord, geology teaching contacts, and the maintainer comment template — that
  are mentioned nowhere in LOG.md, TARGETS.md, or the outbox. The cost was concrete: the
  Reddit entry in TARGETS.md has said "**no draft will be written for Reddit until the
  real rules are read**" for twelve days while a complete r/gis post sat finished in the
  repo. Audited all five send-facing files against `main` before touching them. Verified
  accurate and left alone: the 9-layer list, ~1,200 GVP Holocene volcanoes, Bird (2003)
  boundaries, USGS M4.5+ **rolling 30 days** (`earthquakeContext.ts:26–27`), 30 m HLS
  patches, drawn study regions (#26 closed COMPLETED — I nearly deleted this claim as
  unshipped, then checked), MIT, no backend, and the colormap-inversion caveat.
  **Four stale claims repaired, every one of them _understating_ the project:** (1) both
  the Reddit and EO-Slack drafts pitch quadtree tiled streaming as an unbuilt "flagship
  roadmap item / the RFC is the fun one" — it **shipped and is on by default**
  (README:45), so the drafts were recruiting for finished work and omitting the app's
  headline feature; (2) "~100 unit tests" is now **2,144 cases across 204 test modules**
  (written as "over 2,000" so it does not re-rot); (3) "26 years" of record → **26–46
  years**; (4) the maintainer template's good-first-issue link pointed at `/issues`
  rather than the label URL, i.e. at 175 open items instead of the 3 groomed ones.
  Also swapped the dead contributor ask for the **current** flagship, #170 (invert
  against GIBS's real colormaps) — which happens to be exactly the approximate-values
  caveat the Reddit draft already raises, so the ask now lands where the honest
  limitation is. Added the outbox header block + `Claims re-verified:` line to each,
  wired in the HTTPS send gate, and cross-linked the pairs that were duplicating each
  other (EO-Slack vs. the tailored Pangeo draft; geology email vs. the classroom
  one-pager). Marked `docs/launch/LAUNCH_CHECKLIST.md` **historical** (it still says to
  merge #41/#42 and tag v0.2.0) while preserving its one live residual, the unminted
  Zenodo DOI. New `docs/launch/README.md` indexes the directory and carries the drift
  table; TARGETS.md and `outbox/README.md` now point at it so no future run re-drafts
  what already exists. No new venue research and no new draft this run — the pipeline
  had a correctness problem, not a volume problem. Ran the standing by-file check first:
  no open PR touches `docs/launch/`. Send gate unchanged and deliberately not
  re-measured (three measurements already; revisit 2026-07-29). Branched off `main`
  first and had to re-chain onto #593 mid-run — the three-way append collision on
  `LOG.md` / `TARGETS.md` / `outbox/README.md` landed exactly as the chaining rule
  predicts. Re-chain with `git rebase --onto <tip> origin/main <branch>`; a bare
  `git rebase <tip>` replays all of `main` onto the tip instead.
- 2026-07-28 — **Audited the product claims against the code, not the README — and found the
  flagship feature undersold by up to 41 years.** Picked a claims audit over a new draft
  because every duty is covered by an open PR right now (#571 send plan, #572 README
  open-PR orientation, #580 educator venues, #593 traction baseline, #606 `docs/launch/`,
  #619 v1.1.0 release notes) and the outbox holds eight unsent drafts behind the ⛔ HTTPS
  gate — supply is not the constraint, accuracy is. Every prior `Claims re-verified:` pass
  checked drafts **against README.md**, so a stale README claim propagated instead of being
  caught. This run checked the source instead.
  **The defect.** `README.md` said the temporal scrubber "sweeps month-by-month through the
  **last 5 years** of monthly satellite composites". It does not, and has not for a long time:
  `src/main.ts:316` sets the timeline from `monthRangeForLayer(LAYERS[currentLayer])`, whose
  own doc comment says "the layer's **full scientific record** (MERRA-2 layers reach back to
  1980), not a fixed window" (`src/lib/timeline.ts:424`). Measured per-layer starts against
  `DATA_LATEST = 2026-05`: NDVI/EVI/LST/snow 2000-03 (~26 y), precipitation/soil moisture
  2000-01 (~26 y), SST 2002-07 (~24 y), and **2 m air temperature + aerosols 1980-01 (~46 y)**
  — both MERRA-2 (`M2TMNXSLV`, `M2TMNXAER`). The only surviving "5 years" was the README
  sentence and `timeline.test.ts` fixtures using a 60-month range. A reader deciding whether
  this tool can show them a climate signal was being told 5 years when the answer is 26–46.
  **Where it had spread.** Into two ready-to-send drafts, as a _limitation_ — the worst
  possible form. `classroom-lab-one-pager.md` listed under "Honest limits": "the scrubber
  sweeps the last few years… while the point time series reaches back across the full
  multi-decadal archive" — a distinction that no longer exists; both use the full record.
  `pangeo-showcase-roamingeye.md` made the same split in its workflow paragraph. Replaced the
  false limit with a true and better one (records **start in different years**, so comparing
  two layers fairly means using the window they share — METHODS §8, temporal
  commensurability). The remaining outbox drafts and `docs/launch/` say "decades" or
  "26–46 years" and were already correct.
  **Second drift, same cause:** the Providers-page count. README and the Pangeo draft said
  "~33 agencies"; `PROVIDERS` in `src/lib/providers.ts` now holds **37**. Corrected both to
  the exact figure.
  **Re-verified and found accurate, so nobody re-checks:** ~1,200 Holocene volcanoes
  (`public/data/volcanoes.json` = **1,196** records), USGS seismicity **M4.5+**
  (`USGS_M45_MONTH_SOURCE`), terrain native resolution ~31 m (WMTS tile set **31.25m**),
  "9 scientific layers" (9 seasonal layers of 11 `LayerId`s — land cover and terrain are the
  other two, correctly excluded from the scientific count), probe record "26–46 years".
  **Standing rule added to the two drafts' headers: verify claims against the code that
  implements them, not against README.** README is a claim, not a source.
  Ran the standing by-file check first: `README.md` is touched only by #572 (a different
  section — newcomer open-PR orientation) and by merge-train batch #573. Chained off #606,
  the tip of the comms chain (#571 → #580 → #593 → #606, each containing the previous), so
  this appends cleanly rather than colliding on `LOG.md` a fourth time.
  **Signals** (unchanged, as expected while nothing has been sent): 1 star, 0 forks, 0
  external watchers, 0 outside-authored issues or PRs. **New public artifact today:** the
  health check escalated from a red workflow to an open issue — **#623 "Health check
  failing"**, filed 07:47Z by `github-actions`, body `Live site: no response from
https://roamingeye.org/`. It sits at the top of the public issue tracker, which is where an
  awesome-list curator or a Show HN reader looks second. It self-heals when the certificate
  lands and must not be edited to mask it. Gate re-measured once (it is the thing that makes
  #623 real): `https_certificate: null`, `https_enforced: false`, `protected_domain_state:
verified` — still provisioning, still do not touch DNS. Revisit date stands at 2026-07-29.
- 2026-07-27 (fourth run) — **Found and filled a gap no prior run had looked for: the shipped
  v1.1.0 release is publicly invisible.** The tag `v1.1.0` exists (`610ef2a`, 2026-07-10) and
  went live the same day, but `gh release list` shows **only `v1.0.0` and `v1.0.1`** — so the
  Releases page has advertised "Latest: v1.0.1 (2026-07-09)" for 17 days, and
  `docs/launch/` carries release-notes files for `v0.2.0` and `v1.0.0` with **nothing for
  v1.1.0**. Anyone evaluating the project sees a repo whose newest published release predates
  its best work. Drafted `docs/launch/release-notes-v1.1.0.md` (Duty 5) — pure release body,
  same shape as its two siblings so `--notes-file` takes it directly.
  **Why this duty:** Duties 1–3 are all downstream of the ⛔ HTTPS gate (14 venues researched,
  7 drafts unsent — supply is not the constraint); Duty 4 would be wrong while #373/#374/#375
  are open and unclaimed; Duty 6's signals were pulled hours ago and #593 now owns `SIGNALS.md`.
  This is the one awareness surface that is **not** an external venue — it lives on our own
  repo, so it needs no send permission from anyone, and GitHub's release feed distributes it
  without us posting anywhere.
  **Content is narrative, not a changelog paste**, and leads with the two things that
  distinguish this project for a research audience: the seasonal Mann-Kendall + Sen's slope
  trend test, and the fact that we **published our own bad accuracy numbers** (the full
  `docs/validation.md` RMSE table — aerosol 0.13, SST 5.1 °C, soil 8.2 kg/m², air temp 19.0 K,
  precip 20.4 mm/day, LST no-data — with the honest "relative use, not absolute" reading and
  #170 named as the fix). Then units/uncertainty/legends, the DOI + BibTeX/RIS + METHODS.md
  citation chain, the geolocation pin, and a contributor call-out. Every figure re-verified
  today against `CHANGELOG.md`, `docs/validation.md`, `METHODS.md` and the tag range
  (`git log v1.0.1..v1.1.0` = 18 commits); the "314 → ~375 unit tests" and "22 → 44 contract
  assertions" spans are the two rounds combined, taken from the changelog's own round footers.
  **⛔ This release is gated too — and for a sharper reason than the outbox drafts.** It links
  the canonical `https://roamingeye.org/`, which still fails TLS today (re-measured: curl now
  reaches the host but gets `SEC_E_WRONG_PRINCIPAL` — GitHub's default `*.github.io` cert, so
  the hostname mismatches; `https_enforced: false`, Pages' own `html_url` is `http://`). On top
  of that, **the release's own "You are here" feature cannot work while the site is
  plain-HTTP** — geolocation requires a secure context — so publishing now would announce a
  headline feature that is dead for every reader who tries it. Publish after Enforce-HTTPS.
  **Exact command once the gate clears** (`+8` strips the DRAFT comment and the H1, which
  becomes the release title — verified against the formatted file, re-check if it is edited):
  `gh release create v1.1.0 --title "v1.1.0 — measure the trend, and how much to trust it" --notes-file <(tail -n +8 docs/launch/release-notes-v1.1.0.md)`
  **Deliberate minimal footprint:** this PR touches one new file plus this log. It does **not**
  edit `TARGETS.md` (not a venue) or `outbox/README.md` — the standing by-file check found
  **five** open comms PRs (#571, #573, #580, #593, #606) already queued on those two paths, and
  a sixth editor would just add conflicts. #606 is adding a `docs/launch/README.md` index and
  will pick this file up. Verified first that no open PR of the 176 covers release notes.
  **Also measured, not acted on:** there is **no Zenodo integration in the repo** (no
  `.zenodo.json`, no mention anywhere), so a GitHub release does not currently mint a DOI —
  worth knowing before anyone counts on the release for the citation track.
- 2026-07-28 — Target research: closed the **journalism gap**. README line 26 offers the tool
  to "any researcher, educator, journalist, or curious person", but the word "journalist"
  appears in no draft in `outbox/` or `docs/launch/`, and TARGETS.md had no journalism venue
  at all — the one advertised audience with zero pipeline. Added a **Journalism &
  data-reporting** section with two deliberately different shapes: **NICAR-L** (IRE/NICAR
  data-journalism listserv, open subscription, 20+ years, the most active journalism list)
  and **Data Is Plural** (Singer-Vine's weekly dataset newsletter, 400+ editions since 2015).
  Also added **US-RSE** (900+ research software engineers, growing ~25–30/month) under
  Forums — the only venue that cares about RoamingEye _as research software_ and the
  best-matched contributor pool found so far.
  **Rules actually read, including where they do not exist.** IRE publishes NICAR-L's subject
  matter and says its Code of Conduct applies, but publishes **no** self-promotion or
  tool-announcement rule, and the linked code-of-conduct URL 404s externally — so the
  compliant path is recorded as **unknown until subscribed** (norms almost certainly ship in
  the welcome message), with participation-first as the safe default and the NICAR conference
  lightning talks noted as the sanctioned showcase route. US-RSE's sanctioned promotion route
  is the `#newsletters` Slack channel, _after_ joining and introducing yourself — not as the
  opening move. Flagged two things I could **not** verify rather than guessing: whether
  US-RSE membership is US-only or paid (the join form settles it), and Data Is Plural's
  current suggestion-form URL (use the link in a live issue; `jsvine@gmail.com` is the
  published fallback).
  **Angle discipline, since a newsroom needs something a lab does not** — a deadline-proof
  link, an attributable number, and a licence that permits republishing a screenshot. All
  three are true here, so both entries lead with the provenance-stamped CSV (the artifact
  that survives a fact-check) and never with the globe. For Data Is Plural the honest risk is
  written down: it features _data sources_, and MODIS is already known, so submitting the
  globe invites a fair "already covered" — the submittable claim is the narrower true one,
  that it yields per-point multi-decadal CSV with provenance and uncertainty stamped in, with
  no Earthdata account, install, or fee.
  **All three land as `researched`, none drafted.** Two are blocked on something that is not
  the HTTPS gate: joining US-RSE and subscribing to NICAR-L both require accounts only
  zkWizard can create. Data Is Plural is a genuine one-shot and should be drafted _after_ the
  first venues surface the real questions, not before.
  **Checked first, per the standing by-file rule — and it earned its keep.**
  `comms/TARGETS.md` is untouched by any open PR, but `comms/LOG.md` **is**: open PR **#619**
  (v1.1.0 release notes) appends to it too. Both changes are appends to the same end of the
  same file, i.e. a guaranteed conflict. So this run **chained off #619's head** (`8f5a95a`,
  which already contains `main` at `227c24e`) instead of branching off `main` — the fifth
  LOG.md collision, avoided the same way as the fourth. Also confirmed open PR **#570** edits
  `.github/CONTRIBUTING.md` but **not** the Node version line, so good-first-issue #375 is
  not quietly being fixed underneath us.
  **Verified before deciding they needed no work:** the three open good-first-issues (#373,
  #374, #375) are all still real and unclaimed against current source — the hardcoded
  `aria-label` is still at `TimeSlider.ts:53`, `SearchBox.ts` still handles only `Escape`,
  and `.github/CONTRIBUTING.md` still says "Node.js 20+" against an `engines` field of
  `^20.19.0 || >=22.12.0`. No open PR claims any of them.
  **Signals** not re-measured this run (the claims-audit run measured them hours earlier;
  nothing has been sent, so nothing can have moved). HTTPS gate not re-measured — revisit
  date stands at **2026-07-29**.
- 2026-07-28 (later run) — **Onboarding: documented the one red check a newcomer cannot fix,
  and that our own guide walks them straight into.** Both `.github/CONTRIBUTING.md` and
  `ARCHITECTURE.md` tell a first-time contributor that connecting a staged `src/lib/` module
  is the best-scoped task available here. Measured this run: that is precisely the change
  that currently fails the **required** Build check. `scripts/check-bundle-size.mjs` caps the
  app chunk at 60 kB gzip, and CI on `main` at `156822f` prints
  `ok index-CDzPGmQE.js: 60.0 kB gzip (budget 60 kB)` — under a tenth of a kB of headroom, so
  effectively any wired code tips it over. Neither doc mentioned the budget at all.
  **Two traps written down because they are genuinely confusing, not because they are
  interesting.** (1) At this margin the printed size is the same for a pass and a fail — an
  over-budget chunk still rounds to `60.0 kB`; only the leading `ok`/`FAIL` word differs, so
  the guidance is to read the word, not the number. (2) Staged modules are tree-shaken and
  cost **zero** bytes, which is exactly why `src/lib/` has grown so far without the budget
  noticing — the bytes all arrive at the moment someone adds the call site. That second point
  is the missing half of the wired-vs-staged story #570 landed yesterday, so it went into that
  section too, as a pointer rather than a second copy.
  **Deliberately did not fix it.** The right move for a contributor who hits the cap is to say
  so in the PR and stop; raising the number is a maintainer decision, and the script's own
  docstring already says a bump must be justified by the PR that makes it. Comms does not get
  to spend the budget.
  **Also opened one `good first issue`** against the same script: its header comment still
  claims "app ~34 kB" when the real figure is 60.0, and it prints no headroom — a small,
  self-contained fix in a 45-line file that a newcomer reads at their worst moment.
  **Checked first, per the standing by-file rule:** all 109 open PRs are fleet `codex/*`
  science branches; **zero** touch `CONTRIBUTING.md`, `ARCHITECTURE.md`, or `comms/`, so
  LOG.md is conflict-free this run for the first time in six runs.
  **Signals re-measured, unmoved as expected:** 1 star, 0 forks, 0 external watchers, 43
  views / 10 uniques — identical to the 2026-07-27 baseline, which is the correct reading
  when nothing has been sent. **HTTPS gate re-measured and still closed:** `https_certificate`
  is still `null`, `https://roamingeye.org/` still fails TLS, and `zkwizard.github.io` still
  301s to plain `http://`. Revisit date stands at **2026-07-29**; nothing in `outbox/` may go
  out before it clears.
- 2026-07-28 (later run) — **Finished the orientation map #570 started: every module the
  running app actually reaches is now documented.** Picked Duty 4 because #570 merged this
  morning (10:32Z) and the previous run had left this as an explicitly scoped follow-up —
  #570 landed the wired-vs-staged framing but preserved the original **9-row** core table,
  so **33 of the then-42 wired modules stayed undocumented**, including `probe.ts`,
  `colormap.ts`, `trend.ts`, `numerics.ts` and `citation.ts` — the ones a contributor is most
  likely to need.
  **Re-measured rather than trusting the inherited numbers, and they had already gone stale.**
  Walking the import graph from `src/main.ts` at `9622783`: `src/lib/` now holds **199
  modules** (206 test files), of which **44 are wired and 155 staged** — against the **159 /
  42 / 117** the doc still claimed from `eabc5ea` **one day earlier**. Roughly 40 modules
  arrived in a day and two of them reached the app. Every other source directory is still
  100% wired (`ui/` 20, `overlays/` 10, `scene/` 6, `textures/` 1, `probe/` 1); the one
  apparent gap outside `src/lib/` is `vite-env.d.ts`, an ambient declaration, not a module.
  **Wrote the other 35 up in six responsibility groups** (time/catalog/session;
  probe/colormaps/statistics; domain datasets & place context; provenance & export; geometry
  support; platform & delivery), taking each description **from the module's own doc comment**
  so the code stays the authority. Five modules carry no leading docblock — `agentFleet.ts`,
  `softwareCatalog.ts`, `landCoverPalette.ts`, `placeInsights.ts`, `placeObservationExport.ts`
  — so those were described from their actual call sites instead of guessed.
  **Also folded in the staged-set breakdown** #570 does not carry: of the 155 staged, **124
  are imported by nothing but their own unit test** and **31 only by each other**, and nothing
  in `scripts/`, `contract/`, or e2e reaches any of them. The two halves imply different work
  — a lone function needs a call site, a cluster needs an entry point — which is worth knowing
  before choosing one.
  **Checked the doc against the measurement programmatically** rather than by eye: the tables
  list exactly the 44 measured wired modules, no omissions and no strays.
  **Standing by-file check run first:** the only open PR touching `ARCHITECTURE.md`,
  `CONTRIBUTING.md` or `comms/` is the merge-train batch #573, not a competing docs edit —
  so no repeat of the #570 collision.
  **HTTPS gate re-measured, still closed:** `https_certificate: null`, `https_enforced: false`,
  Pages' own `html_url` still `http://roamingeye.org/`. Revisit date stands at **2026-07-29**;
  the outbox stays send-blocked. Signals not re-pulled — measured hours ago this same day and
  nothing has been sent, so nothing can have moved.
- 2026-07-28 (later run) — **Wrote the teacher's guide the pipeline has been missing, and
  found a public doc walking researchers into a known-broken feature.** Picked Duty 4 because
  it is the only duty not send-blocked, and because prior research had already named this
  exact gap twice without filling it: the CLEAN entry records that "presence of a teacher's
  guide" is a **scored line item** and that we had none (the one-pager's one-line lesson ideas
  and `docs/research-recipes.md` were "the closest thing"), and the SERC/NAGT entry is parked
  until an instructor has actually run a lab — which requires a lab to run.
  **First, the audit that was cheap and could have gone the other way.** Verified all four
  open `good first issue`s against current `main` before writing anything, since ~300 PRs have
  merged since they were filed on 07-15. All four still real, all file references still exact:
  #373 (`TimeSlider.ts:53` still hardcodes `aria-label = "Month"`, and a `stepUnit` param sits
  right there at line 36), #374 (`SearchBox.ts` still has `role="listbox"`/`role="option"` and
  no arrow-key handling), #375 (`.github/CONTRIBUTING.md` still says "Node.js 20+" against
  `package.json`'s `^20.19.0 || >=22.12.0`), #638. **Nothing stale, nothing to close** — a
  no-op finding, but a stale starter issue is worse than none, so it is worth re-running.
  **The new artifact:** `docs/teaching/ndvi-phenology-lab.md` — "When does the Earth turn
  green?", a 60–75 minute lab on seasonal vegetation phenology with five measurable learning
  objectives, prerequisites, instructor prep, five lab parts, a copy-paste student worksheet,
  a four-criterion assessment rubric, answer notes, seven pre-empted student misconceptions,
  and 45-minute / two-session / lecture-demo variants. It is **in-repo and public**, so unlike
  everything in `outbox/` it is **not send-blocked** — it works the moment anyone arrives.
  **Every UI and data claim was verified against source, not README** (the standing rule from
  the 07-28 claims audit): layer label `Vegetation (NDVI)` and record start `2000-03` →
  `DATA_LATEST 2026-05` (`timeline.ts:132`, `:97`); probe panel's **Sampling** (Point /
  Area ~1°) and **View** (Values / Anomaly) segments and the `Download CSV` / `Copy CSV`
  buttons (`ProbePanel.ts:85–145`); the CSV's exact provenance header block and
  `year_month,value,anomaly` columns (`probe.ts:576`); NDVI's `±0.002` uncertainty, derived
  not guessed — `quantizationStep = span / (PROBE_LUT_SIZE − 1) = 1/255`, halved and printed
  to one significant digit; keyboard steps ←/→ month, PageUp/PageDown year, Home/End
  (`TimeSlider.ts:155–178`), which match the app's own hint text at `index.html:62`.
  **The defect found on the way, and it is a live one.** `METHODS.md §3` measures LST's
  end-to-end inversion at **0 of 250 values recovered — no-data for effectively everything**
  (issue #170). `docs/research-recipes.md` recipe 2 nevertheless told researchers to "probe
  twice… download both CSVs, and difference them month-by-month," which returns two empty
  files. Its stated rationale was **also** stale: it claimed LST values are reported as
  "fraction of color scale", but `PROBE_SCALES.lst` is `calibrated: true` in Kelvin — the
  `calibrated: false` fraction-of-scale fallback now applies only to `landcover` and
  `terrain`. Rewrote the recipe around what does work (the imagery is fine — scrub it, Save
  PNG, then pull `MOD11C3 v061` for numbers), with the bug stated up front and #170 linked,
  plus a pointer to Air temperature (2 m) as the probe-based alternative and METHODS §3's
  instruction to work in anomalies there. **Did not touch the code** — #170 is the fix.
  **This also settled the lab's design rather than merely constraining it.** NDVI has **no**
  row in the §3 accuracy table (that table covers the six layers with GIBS colormap documents;
  NDVI's 0–1 range comes from the index's own definition), so absolute NDVI is unvalidated
  here. The lab is therefore built entirely on **timing, shape, and relative comparison** —
  which is what the method is good at, and is also the better pedagogy. The guide says this
  in plain words rather than implying NDVI is benchmarked.
  **Two honesty guards written into the artifact itself:** it states up front that we have
  **not** classroom-tested it and asks the instructor to run it once first, and the CLEAN
  entry now carries the matching warning not to imply otherwise to reviewers (an educator and
  a scientist read those submissions). Expected site behaviours are labelled qualitative
  phenology, not values we measured.
  **Wiring:** linked from `README.md` (Built for research), from `research-recipes.md`
  ("workflows, not lesson plans"), and from the one-pager draft, whose lesson idea 1 now
  points at the full write-up. `TARGETS.md`: CLEAN's teacher's-guide gap marked closed with
  submission guidance (submit against the focused lab, not the globe), SERC/NAGT's blocker
  noted as cheaper but **not** cleared, one-pager entry updated.
  **Standing by-file check run first:** of 101 open PRs, the only one touching `README.md`,
  `docs/`, or `comms/` is the stale merge-train batch #573 — not a competing edit. Worked in a
  detached `git worktree` rather than the shared clone, so no specialist's checkout and none
  of zkWizard's uncommitted changes were disturbed.
  **HTTPS gate re-measured once:** `https_certificate: null`, `https_enforced: false`, Pages
  `html_url` still `http://roamingeye.org/`. Still provisioning, still do not touch DNS.
  Revisit date stands at **2026-07-29**; `outbox/` stays send-blocked. Signals not re-pulled —
  measured earlier today and nothing has been sent.
- 2026-07-28 (later run) — **Duty 4.** Named the contribution surface that the full bundle
  budget leaves open, in `CONTRIBUTING.md`. #654 (open) documents the cap and audits the
  starter issues; the gap it leaves is that nobody says what a newcomer _can_ pick up. The
  check reads only `dist/assets/*.js`, so docs, `scripts/`, `e2e/`, and CSS cost zero bytes —
  CSS verified as a separately emitted asset in CI's own build output
  (`index-k9zqfPlJ.css`, 34.39 kB), not inlined into the JS.
  **The negative result is the load-bearing half:** "add unit tests to the untested files" is
  the obvious next idea and it is wrong. An import scan over `origin/main` shows `src/lib/`
  and `src/probe/` fully covered; what lacks tests is exactly `src/ui/`, `src/overlays/`,
  `src/scene/`, `src/textures/`, `main.ts` — DOM/rendering, uncovered _by design_ because
  `vite.config.ts` sets `environment: "node"`. Recorded so a future run doesn't file starter
  issues that can't be done. **No issues opened:** the queue (#373 +12 B and fits, #375, #638)
  is non-empty and verified by #654 hours ago; filing more would be churn.
  **Not the GIBS pattern — checked before assuming.** CI went red repo-wide from ~14:04Z,
  docs-only comms PRs included, while GIBS WMS answered 200 in 0.9 s. A real regression, and
  it merged as **#658** (`fix/boot-curtain-timeout-hang`) mid-run; `main` is green again at
  `2cb0b6d`. Matters to comms because the README CI badge is public and `SEND-PLAN.md` gates
  sending on health.
  **HTTPS gate re-measured:** `https_certificate: null`, `https_enforced: false`, Pages
  `html_url` still `http://roamingeye.org/`. Revisit **2026-07-29**; `outbox/` stays
  send-blocked. Signals: 26 views / 8 uniques / 14 d, 1 star (`statuette`, the known
  drive-by), 0 forks, 0 watchers, **0 outside-authored issues or PRs** — nobody to welcome,
  so no reply drafted. Repo `description` still `null` (a maintainer call; left as flagged).
