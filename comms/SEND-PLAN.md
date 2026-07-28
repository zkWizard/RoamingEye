# Send Plan — the order to send the outbox in

Eight drafts in `outbox/` are written, claim-checked, and waiting. Until now nothing
recorded **what to send first, when, or what each one costs to run** — `TARGETS.md`
holds per-venue research and `outbox/` holds the content, but the sequencing lived
nowhere. This file is that missing piece.

It changes no draft and sends nothing. zkWizard sends everything, personally, in the
order below or any other — this is a recommendation with its reasoning attached, so
the reasoning can be argued with rather than re-derived.

---

## 0. The gate — nothing ships until this clears

The ⛔ HTTPS send gate at the top of [`outbox/README.md`](outbox/README.md) is the
precondition for every slot below. It holds the measurements and the two commands
that clear it; they are not repeated here.

Three things break while the gate is closed and **self-heal when the certificate
lands**. Confirm each has actually healed before sending — they are the difference
between a launch and a bad first impression:

| Check                 | How to verify                                                                             | Why it matters                                                                      |
| --------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| HTTPS reaches the app | `curl -sS -o /dev/null -w '%{http_code}\n' https://roamingeye.org/` → `200`, no TLS error | Every draft links here. A certificate warning ends the visit.                       |
| Geolocation pin alive | On the live site, dev console: `window.isSecureContext` → `true`, then try the pin        | The "You are here" pin is a v1.1.0 headline feature and is **dead over plain HTTP** |
| Health check green    | The `health-check` workflow on the public Actions tab                                     | It went red on 2026-07-27 and red badges are read as an unmaintained project        |

---

## 1. Baseline — measured 2026-07-27, before anything was sent

Recorded so that "did this work?" has an answer later. A launch with no before-figure
cannot be evaluated.

- **1** star, **0** forks, **0** external watchers
- **43** views / **10** unique visitors (GitHub's rolling 14-day window)
- Only referrer: `github.com` — **2** unique visitors. No external traffic source exists yet.
- **0** outside-authored issues or pull requests

The clone count (11,941 from 503 uniques) is our own CI, not people. Ignore it.

---

## 2. Why this order

Five principles, each drawn from rules already read and recorded in `TARGETS.md`:

1. **Reversible before permanent.** A forum post can be edited or deleted. An
   awesome-list row is merged, scraped, and mirrored — it is effectively forever. Permanent
   things go last, once the URL is beyond doubt.
2. **Rehearse before the one-shot.** Show HN is realistically a once-per-project shot; a
   post that lands flat cannot be re-run. Whatever goes first generates the real questions,
   and those questions sharpen the HN top comment.
3. **One live thread at a time.** Show HN and the three.js Showcase both expect the author
   present and answering. Two at once means both get answered badly.
4. **Let moderation latency work for you.** three.js Showcase posts are moderator-approved
   and appear on their own schedule, so posting early costs nothing — it queues.
5. **Traction helps gatekeepers.** A list curator weighing an entry looks for signs the
   project is real. Arriving with a Showcase thread and a few stars is a stronger case than
   arriving cold.

---

## 3. The sequence

### Slot 1 — three.js forum, Showcase → [`threejs-showcase-roamingeye.md`](outbox/threejs-showcase-roamingeye.md)

- **When:** the day the gate clears.
- **Why first:** the lowest-risk venue in the pipeline — the Showcase category exists to
  post three.js projects, so this is the one place a project post is the _intended_
  content rather than tolerated self-promotion. Moderator approval makes the timing soft.
  It reaches graphics engineers, a contributor persona no other draft targets, and Showcase
  posts are considered for the three.js homepage.
- **Presence cost:** low and spread out. Check the thread daily for a week.
- **Watch for:** the rendering questions. They are the sharpest free technical review this
  project will get, and they feed slot 4's top comment.

### Slot 2 — Pangeo Discourse, Showcase → [`pangeo-showcase-roamingeye.md`](outbox/pangeo-showcase-roamingeye.md)

- **When:** 2–4 days after slot 1.
- **Why here:** a science audience with a long Discourse tail and a low presence cost, and
  the feedback is a genuine product input — the draft asks how to make the probe CSV
  Xarray-loadable. Running it before HN means the answer might land in the HN thread.
- **Presence cost:** low. Discourse threads breathe over days, not hours.
- **Also consider:** the monthly Pangeo Showcase accepts short talk proposals. A live
  walkthrough beats a text post and is worth offering in the same message.

### Slot 2b — CLEAN collection submission → [`clean-collection-submission.md`](outbox/clean-collection-submission.md)

**A parallel track, not a queue position.** This one is a web form, not a thread, so it
costs no presence and competes with nothing — principle 3 ("one live thread at a time")
does not apply to it.

- **When:** any time from the day the gate clears. Earlier is better, because the review is
  the slowest thing in this plan.
- **Why it sits here:** CLEAN runs a four-stage peer review (triage → two general reviews by
  an educator and a scientist → a four-person panel → expert science review). That takes
  months, so starting the clock early costs nothing and delays nothing. It is also the only
  educator venue in `TARGETS.md` that accepts a _tool_ rather than requiring a
  classroom-tested lesson plan, and the only place the classroom one-pager can go today.
- **Presence cost:** none after submitting. Do not follow up.
- **Rules already settled:** the developer may submit their own resource — tick the box that
  asks for the reviewers' comments. Pitch it against **one focused concept** (seasonal
  phenology / snow cover), because CLEAN explicitly down-ranks general multi-topic sites.
- **Watch for:** the returned reviewer comments, whether or not it is accepted. One educator
  and one scientist reading the project closely is the best teaching-side critique available
  anywhere in this pipeline, and CLEAN releases reviews to developers on request.

### Slot 3 — leafmap Discussions → Ideas → [`leafmap-interop-invitation.md`](outbox/leafmap-interop-invitation.md)

- **When:** ~5–10 days after slot 1.
- **Why here:** this one addresses _people_, not a venue, and it asks a maintainer for
  their attention. Spacing it means we are not asking for attention everywhere at once, and
  by now there are real user questions to point at instead of a hypothetical.
- **Presence cost:** low, but respond quickly if a maintainer replies.
- **Rules already settled:** Ideas, not an issue, and never "Show and tell". No
  @-mentioning an individual maintainer. **Silence is an answer — do not bump.**

### Slot 4 — Show HN → [`hacker-news-show-hn.md`](outbox/hacker-news-show-hn.md)

- **When:** once the site has carried ordinary traffic for **at least a week** post-gate
  with no wobble. US-morning, weekday.
- **Why last among the posts:** it is the highest-ceiling and highest-variance shot, and
  the only one where infrastructure trouble is expensive — an HN front page is the worst
  possible moment to discover a tile-pipeline problem. It is also unrepeatable, so it
  should go out with the FAQ that slots 1–3 produced.
- **Presence cost: high, and it is a real calendar commitment.** Block 2–4 hours to sit in
  the thread and answer. Do not post and walk away.
- **Rules already settled:** submit the live URL (not a blog post), author's explanation in
  the first comment, **never solicit upvotes**, post once and do not repost.

### Slot 5 — the two awesome-list PRs → [`awesome-open-geoscience-pr.md`](outbox/awesome-open-geoscience-pr.md), [`awesome-earthobservation-code-pr.md`](outbox/awesome-earthobservation-code-pr.md)

- **When:** after slot 4, and only once the canonical URL has been stable for **≥2 weeks**.
- **Why genuinely last:** these rows are permanent and get scraped into mirrors and
  newsletters. A URL corrected later in our repo is not corrected in theirs. This is the
  same failure that the 2026-07-27 audit caught before it shipped — do not re-create it by
  submitting early.
- **Presence cost:** minimal after opening; just answer curator review comments.
- **Before opening:** re-read each list's current section headings and house style — the
  drafts carry the format verified on 2026-07-15, and lists get reorganised.

---

## 4. Deliberately not in the sequence

| Item                            | Why it is not scheduled                                                                                                                                                                                         |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `classroom-lab-one-pager.md`    | Still a source asset rather than a post — but it is no longer unrouted. Its first venue was vetted on 2026-07-27 and became **slot 2b** above; it remains the thing you hand an individual instructor directly. |
| SERC "Teach the Earth" / NAGT   | Takes classroom-**tested** teaching activities, never tools. Reachable only after someone has actually taught with RoamingEye — then help that instructor contribute their lab.                                 |
| Earth Exploration Toolbook      | Ideal shape, uncertain pulse (newest dated item on the site is 2011). Ask whether new chapters are still accepted before writing one; a chapter is hours of work.                                               |
| OSGeo Discourse                 | Participation-first; the ToS bans solicitations. Never a standalone announcement.                                                                                                                               |
| NASA Earthdata Forum            | Q&A support forum — participation-only. No draft exists and none should be written.                                                                                                                             |
| Reddit (r/gis, r/remotesensing) | Blocked on the four-question rules check in `TARGETS.md`. No draft until the real rules are read.                                                                                                               |
| Mastodon / fediverse            | Ready to draft, but needs zkWizard to hold an account and build a little presence first.                                                                                                                        |
| JOSS                            | Hard six-month age gate. Earliest eligible **2026-12-29**. Sending slots 1–5 is its runway.                                                                                                                     |

---

## 5. After each send

1. Flip `Status: DRAFT` → `SENT` (with the date) in the draft file itself.
2. Update that venue's **Status** in `TARGETS.md` to `sent-by-user`.
3. Add one line to `LOG.md`: what went where, when.
4. **Capture the questions asked.** They are simultaneously the FAQ for the next slot and
   the most honest roadmap input available.
5. Do not bump, repost, or cross-post the same item to a second venue in the same week.

---

## 6. Stop the sequence if

- The site breaks, tiles fail, or the certificate regresses — fix first, resume after.
- A venue's response is negative or the post is removed — read why, fix the approach, and
  do not push the remaining slots on the same framing.
- Something lands harder than expected. A live thread that needs answering outranks the
  next slot on the calendar; the schedule is a guide, not a queue to drain.

---

## 7. One honest caveat

This is one maintainer, sending in their own time. Five posting slots over roughly three
weeks is already a real commitment, and slot 4 alone wants a cleared afternoon. (Slot 2b is
the exception that proves it — a form, submitted once, with nobody to answer afterwards.)
**Four sent well beats eight sent badly** — every venue here rewards an author who shows up
in the thread, and none of them reward volume.
