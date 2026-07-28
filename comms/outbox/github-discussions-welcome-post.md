To: public
Venue: RoamingEye's own GitHub Discussions (https://github.com/zkWizard/RoamingEye/discussions)
Channel: **Announcements** category — pin it after posting
Status: DRAFT
Date: 2026-07-28
Claims re-verified: 2026-07-28 — `~31 m` terrain tiles and the 37-provider catalogue checked against `README.md:45,48`; repo age from `git log --reverse` (first commit 2026-06-28); Discussions state read from the GraphQL API (6 stock categories, **0** discussions).

---

## Why this draft exists — read before posting

**This is the only venue in the pipeline that we own, and it is empty.** Discussions is
enabled on the repo, has GitHub's six stock categories, and contains **zero** posts. It is
also where [`.github/ISSUE_TEMPLATE/config.yml`](../../.github/ISSUE_TEMPLATE/config.yml)
sends every "Question or discussion" — and because that config sets
`blank_issues_enabled: false`, a visitor who just wants to _ask something_ has no other
route. They cannot open a freeform issue.

**Post this before Slot 1, not after.** Every draft in `SEND-PLAN.md` promises that the
author is present and answering; three.js Showcase, Pangeo, and Show HN all generate
questions by design. The overflow arrives here. An empty Discussions tab with no posts
reads as an abandoned room, and the first thing a curious visitor does is leave. One
maintainer post makes it a place where asking is clearly expected.

**It is still behind the same HTTPS gate** (`outbox/README.md`) — the post links to the
live site, and the whole point is that people click through. It is, however, the _cheapest_
draft to send: it is on our own repo, editable after posting, and carries none of the
one-shot risk of Show HN or the permanence of an awesome-list row.

**Two small housekeeping steps, both zkWizard's call, both optional:**

1. **Prune the categories.** Six stock categories for a project with zero discussions is
   more rooms than people. _Polls_ in particular has nothing to poll a community of zero
   about, and an empty category is a dead end. Q&A, Ideas, Show and tell, and Announcements
   carry their weight; consider deleting or hiding the rest until there is traffic.
2. **Pin this post** once it is up, so it stays the first thing a newcomer sees.

---

**Category:** Announcements
**Title:** Welcome — what RoamingEye is, and where to ask things

Hello, and thanks for looking.

**RoamingEye** is a free, open-source (MIT) 3D Earth you run in a browser tab, for
exploring decades of open satellite imagery — NASA MODIS and Harmonized
Landsat-Sentinel. Scrub the temporal slider and watch a place change across its full
published record; click a point to chart that layer's time series and download it as a
provenance-stamped CSV. No account, no install, no fee.

- **Try it:** https://roamingeye.org/
- **What it does, in detail:** [README](https://github.com/zkWizard/RoamingEye#readme)
- **How the numbers are produced, and where they stop being trustworthy:**
  [METHODS.md](https://github.com/zkWizard/RoamingEye/blob/main/METHODS.md)

### Where to put things

- **[Q&A](https://github.com/zkWizard/RoamingEye/discussions/categories/q-a)** — "how do I
  do X?", "which layer should I use for Y?", "can I cite this?", "is this value reliable
  enough for my purpose?" No question is too basic, and you do not need to have contributed
  anything to ask one.
- **[Ideas](https://github.com/zkWizard/RoamingEye/discussions/categories/ideas)** — a
  dataset you wish were in here, a workflow that almost works, a feature you'd use. Ideas
  are cheaper than issues and I read all of them; if one firms up, it becomes an issue.
- **[Show and tell](https://github.com/zkWizard/RoamingEye/discussions/categories/show-and-tell)**
  — a figure you made, a lesson you ran, a place that looks extraordinary in one of the
  layers. Genuinely the posts I most want to see.
- **[Issues](https://github.com/zkWizard/RoamingEye/issues)** — for a specific bug or a
  concrete piece of work. If you're not sure it's a bug, ask in Q&A first; that is what it's
  for.

### Three things worth knowing up front

**The point probe is approximate, on purpose.** It does not read source granules — it
inverts the rendered colormap back to a physical value. That is good enough for
reconnaissance, teaching, and "is there a signal here?", and not good enough to publish a
number from. The app says so where it matters, and METHODS.md documents the per-layer
accuracy we measured, including the layers where it currently performs badly. If you catch
it being wrong somewhere we haven't flagged, that is a genuinely valuable bug report.

**The project is young.** First commit was 2026-06-28. Expect rough edges, and expect them
to get fixed — but please don't assume anything here has been validated for your use case
until you've checked METHODS.md.

**Yes, there are a lot of open pull requests.** Most are opened automatically by a fleet of
scheduled agents that work on the data catalogue and the science library. None of them are
in your way, and human contributions are reviewed by a person, not triaged by the fleet.
The README explains the arrangement under
["Why are there so many open pull requests?"](https://github.com/zkWizard/RoamingEye#-why-are-there-so-many-open-pull-requests).

### If you want to help

There's a [`good first issue`](https://github.com/zkWizard/RoamingEye/labels/good%20first%20issue)
label, a [contributor guide](https://github.com/zkWizard/RoamingEye/blob/main/.github/CONTRIBUTING.md)
with a one-line DCO sign-off and no CLA, and an
[architecture tour](https://github.com/zkWizard/RoamingEye/blob/main/ARCHITECTURE.md) if you'd
rather read than patch. Earth scientists, remote-sensing people, graphics engineers,
educators, and data wranglers all have somewhere useful to stand here — and telling me what
is confusing or missing is a real contribution, not a lesser one.

Be kind to each other; the [Code of Conduct](https://github.com/zkWizard/RoamingEye/blob/main/.github/CODE_OF_CONDUCT.md)
is the Contributor Covenant.

— zkWizard
