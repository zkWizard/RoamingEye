To: opengeos/leafmap maintainers (public post — do not email anyone directly)
Venue: leafmap (https://github.com/opengeos/leafmap) — 3.7k★, MIT, actively developed
Channel: GitHub **Discussions → "Ideas"** (https://github.com/opengeos/leafmap/discussions) — see "Which channel" below before posting
Status: DRAFT
Date: 2026-07-27
Claims re-verified: 2026-07-27 — leafmap activity/licence/categories checked via GitHub API; RoamingEye CSV header fields checked against `src/lib/probe.ts`; live URL is https://roamingeye.org/ (⛔ see the send gate in `outbox/README.md` — HTTPS is not working yet)

---

## Which channel — read this before posting

leafmap's `docs/contributing.md` routes bug reports and feature requests to the
**issue tracker**, and asks that proposals "explain in detail how it would work" and
"keep the scope as narrow as possible," noting it is a volunteer-driven project.

Even so, **post this in Discussions → "Ideas" first, not as an issue.** The reason:
most of the work described below happens in _our_ repo, not theirs. Putting a
largely-external proposal in a volunteer maintainer's bug tracker costs them triage
time for something they did not ask for. "Ideas" exists precisely to float a feature
idea, and it is the lower-imposition door. If a maintainer responds and wants it
tracked, converting a discussion into a narrow-scope issue takes one click — and at
that point it is invited rather than unsolicited.

Do **not** post in "Show and tell": that category is for things built _with_ leafmap,
and RoamingEye is not. Posting there would read as drive-by promotion.

Tone check before you send: this asks a volunteer for ~10 minutes of API guidance.
The offer has to be real — only send it if you're actually prepared to build the
RoamingEye side regardless of the answer.

---

**Title:** Idea: what's the most stable leafmap snippet form to generate from an external tool?

Hi leafmap maintainers,

Short version: I maintain a browser tool that ends up pointing people _toward_ Python
notebooks, and I'd like to generate leafmap-flavoured starter code at that handoff. I'd
rather target the API shape you'd actually endorse than guess and ship something that
ages badly — hence asking here first. Everything below is work on my side; I'm not
asking for leafmap changes.

**Context.** [RoamingEye](https://github.com/zkWizard/RoamingEye) (MIT, TypeScript +
three.js) is a zero-install 3D globe for scrubbing through decades of open NASA MODIS
and Harmonized Landsat-Sentinel imagery. Deliberately, it is _not_ an analysis tool —
its stated job is the reconnaissance step before the real work: look at a site across
its record, decide whether there's a signal worth the compute, then go pull the actual
granules in a notebook. It's the same audience as leafmap's (researchers, educators,
students) and the same licence, and it stops exactly where leafmap starts.

**The gap.** When someone clicks a point, they get a time series and a CSV whose
header already carries everything a Python session needs to continue the work — `lat`,
`lon`, the resolved `data_product` (short name + version), a `data_doi`, the date
range, and an explicit uncertainty note. Today that's where it ends: they have the
coordinates and the product identity, and they hand-rebuild the query in Python. That
last step is small but it is exactly where a student loses the thread.

**What I'd like to build (on my side).** A "copy as Python" action next to the export
that emits a few lines of leafmap-idiomatic code pre-filled with the point, the date
window, and the dataset they were just looking at — so the notebook opens on the same
place and period they were staring at.

**The actual question** — two things I don't want to guess at:

1. **Which entry points would you consider stable enough to bake into generated code?**
   I'd rather emit a slightly more verbose snippet against a settled API than a terse
   one against something you might reshape. If there's a form you'd point a newcomer to
   in a tutorial today, that's the one I want to target.
2. **Is there anything actively wrong with that framing?** If a "start from a lat/lon +
   date range + product" snippet cuts against how you think people should come into
   leafmap, I'd genuinely rather hear it now than ship a bad on-ramp with your name on it.

That's the whole ask — no leafmap PR needed, and I'll keep the generated snippet in our
repo and our tests so it isn't your maintenance burden. If it turns out well and you
_ever_ want it to go the other way (a helper that opens a coordinate in the globe), I'm
happy to do that work too, but that's your call and not what I'm asking for.

And the open invitation, in case it's of interest to anyone reading: RoamingEye is early
and the issues that need the most help are the ones nearest this seam — the point probe
currently recovers values by inverting the rendered GIBS colormaps, which is approximate
and labelled as such everywhere. Making it defensible against the real product values is
the flagship open problem. Anyone from this community who wants to weigh in there would
be very welcome.

Thanks for leafmap — the "minimal coding, in the notebook you're already in" approach is
a big part of why the handoff I'm describing seems worth building at all.

— zkWizard

---

## Notes for zkWizard before sending

- **⛔ Send-blocked** until `https://roamingeye.org/` serves over working HTTPS — see the
  gate at the top of `outbox/README.md`. This message links to the repo rather than the
  app, which softens it, but a maintainer will click through to the live site.
- **Be ready to do the work.** The credibility of this post rests entirely on the offer
  being real. If you don't intend to build the snippet generator, don't send it.
- **Don't name or @-mention individual maintainers.** Address the project. A cold ping to
  a named volunteer reads worse than the same words posted to the project's own board.
- **One post, then let it sit.** No follow-up bump if it's quiet — a volunteer project
  going quiet on an unsolicited idea is an answer.
- **If it lands:** the reply is where the relationship is, not the post. Answer fast, keep
  the scope exactly as narrow as promised, and link the resulting RoamingEye PR back into
  the thread so the loop visibly closes.
- **Verify at post time:** re-check that leafmap is still actively maintained (it was
  pushed to on 2026-07-27) and re-read `docs/contributing.md` in case the channel guidance
  has changed.
