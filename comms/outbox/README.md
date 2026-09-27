# Outbox

Ready-to-send communication drafts, one file per draft:
`<venue-or-person>-<topic>.md`.

Each file starts with a header block, then the exact text to send:

```
To:      <recipient or "public">
Venue:   <community / platform>
Channel: <category / thread / PR / email>
Status:  DRAFT | APPROVED | SENT
Date:    <YYYY-MM-DD>
---
<the exact, ready-to-send text, tailored to the venue's tone and rules>
```

**Nothing here is ever sent automatically.** These are drafts for zkWizard to review
and personally post. When you send one, flip its `Status` to `SENT`.

## Send gate — HTTPS: cleared, one switch left (re-verified 2026-09-27)

**HTTPS works.** `https://roamingeye.org/` returns `200` over a valid Let's Encrypt
certificate (apex and `www`, auto-renewing; issued 2026-08-14 after the Pages
remove/re-add), and the Pages API reports the certificate `approved`. The July notes that
stood here described a certificate that had not been issued yet; they are in this file's
git history and `../LOG.md` if the story is ever needed.

**One switch left, and it is the owner's:** **Enforce HTTPS** (_Settings → Pages_) is still
off, so `http://roamingeye.org/` serves the app over plain HTTP rather than redirecting.
Agents cannot set it (the Pages API that does is off-limits to them). The drafts already
link `https://`, so a click from any of them lands on HTTPS today; flip the switch before
the Show HN so that a hand-typed `http://` upgrades too.

Re-check before sending anything:

```bash
gh api repos/zkWizard/RoamingEye/pages --jq '{https_enforced, cert: .https_certificate.state}'
curl -sS -o /dev/null -w '%{http_code}
' https://roamingeye.org/
```

Expect `cert: "approved"` and `200`; `https_enforced` becomes `true` once the switch is
flipped.

**Nothing in this directory has been sent yet** (every draft's `Status` is `DRAFT`), so
RoamingEye has had no public launch. `../SEND-PLAN.md` orders the sends; the low-stakes
venues (the awesome-list PRs, the three.js and Pangeo showcases) can go first, and the
Show HN is worth holding for a moment that has something to show: a time-lapse clip.

## Before you send any draft

Drafts age. RoamingEye ships continuously, so re-check these three things against the
repo right before posting — each draft carries a `Claims re-verified:` line saying when
this was last done:

1. **The live URL.** Canonical is **`https://roamingeye.org/`** (custom domain since
   2026-07-27). The old `zkwizard.github.io/RoamingEye/` link only redirects — it is wrong
   in a Show HN submission and permanently wrong in an awesome-list entry. **Confirm it
   loads over HTTPS first — see the send gate above.**
2. **The feature and layer claims** — re-skim `README.md`; the layer count, resolution, and
   record lengths quoted in the drafts must match what the app does today.
3. **The venue's own rules** — re-read them at post time; forum policies change.

## Drafts

- `pangeo-showcase-roamingeye.md` — Pangeo Discourse (_Pangeo Showcase_ category). **DRAFT.**
- `hacker-news-show-hn.md` — Hacker News (_Show HN_), title + first comment. **DRAFT.**
- `threejs-showcase-roamingeye.md` — three.js forum (_Showcase_ category), rendering-first post. **DRAFT.**
- `awesome-open-geoscience-pr.md` — Awesome Open Geoscience (SWUNG), ready-to-submit PR entry + body. **DRAFT.**
- `awesome-earthobservation-code-pr.md` — Awesome Earth Observation Code, ready-to-submit PR entry + body. **DRAFT.**
- `classroom-lab-one-pager.md` — reusable classroom/lab one-pager (handout, course page, or educator email). **DRAFT.**
- `leafmap-interop-invitation.md` — leafmap (`opengeos`) GitHub _Discussions → Ideas_, contributor/interop outreach. **DRAFT.**
- `clean-collection-submission.md` — CLEAN (`cleanet.org`) _Suggest a Teaching Resource_ form, filled field-by-field; sanctioned developer self-submission to a peer-reviewed educator collection. **DRAFT.**
- `github-discussions-welcome-post.md` — **our own** GitHub Discussions (_Announcements_), welcome + orientation post. **DRAFT — post this first, before Slot 1.** It is the only venue here that we own, and it is currently empty; the question traffic every other draft generates lands in it.

## Also sendable — four drafts that live outside this directory

`docs/launch/` predates this workspace and holds four outreach drafts that were never
indexed anywhere. They are real, current, and subject to the same send gate above; their
claims were audited and repaired on 2026-07-27. Full index and the drift table:
[`docs/launch/README.md`](../../docs/launch/README.md).

- `../../docs/launch/post-reddit-r-gis.md` — r/gis + r/remotesensing. **DRAFT — also blocked on reading each sub's self-promotion rules** (see `../TARGETS.md`).
- `../../docs/launch/post-eo-slack.md` — short post for EO Slacks/Discords. **DRAFT.** (For Pangeo, use `pangeo-showcase-roamingeye.md` here instead.)
- `../../docs/launch/post-geology-lists.md` — email to geology/Earth-systems teaching contacts. **DRAFT.** (Pairs with `classroom-lab-one-pager.md` as the follow-up.)
- `../../docs/launch/maintainer-comment-template.md` — reusable 3-sentence "what is this?" reply for live threads. **Response asset, not a post.**
