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

## Before you send any draft

Drafts age. RoamingEye ships continuously, so re-check these three things against the
repo right before posting — each draft carries a `Claims re-verified:` line saying when
this was last done:

1. **The live URL.** Canonical is **`https://roamingeye.org/`** (custom domain since
   2026-07-27). The old `zkwizard.github.io/RoamingEye/` link only redirects — it is wrong
   in a Show HN submission and permanently wrong in an awesome-list entry.
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
