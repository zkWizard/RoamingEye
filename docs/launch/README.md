# `docs/launch/` — release-era launch assets

This directory predates the [`comms/`](../../comms/) workspace and holds launch assets
written around v0.2.0–v1.0.0. Four of its files are **outreach drafts that are still
live and still sendable** — they were simply not tracked anywhere, so for twelve days
the comms pipeline treated venues as "no draft written" while a finished draft sat here.
This README exists so that cannot happen again.

## Where things live now

| Purpose                        | Canonical home                                                      |
| ------------------------------ | ------------------------------------------------------------------- |
| Launch strategy, channel order | [`LAUNCH_CHECKLIST.md`](../../LAUNCH_CHECKLIST.md) (repo root)      |
| Venue pipeline & posting rules | [`comms/TARGETS.md`](../../comms/TARGETS.md)                        |
| Ready-to-send drafts           | [`comms/outbox/`](../../comms/outbox/) **and the four files below** |
| Run history                    | [`comms/LOG.md`](../../comms/LOG.md)                                |

New drafts go in `comms/outbox/`. Nothing new should be added here.

## What is in here

**Live outreach drafts** (claims re-verified 2026-07-27; all are send-gated on HTTPS —
see the gate in [`comms/outbox/README.md`](../../comms/outbox/README.md)):

- [`post-reddit-r-gis.md`](post-reddit-r-gis.md) — r/gis and r/remotesensing. **DRAFT —
  double-blocked:** HTTPS, _and_ neither sub's self-promotion rules have been read yet.
- [`post-eo-slack.md`](post-eo-slack.md) — short version for EO community Slacks and
  Discords. **DRAFT.** For Pangeo specifically, use
  [`comms/outbox/pangeo-showcase-roamingeye.md`](../../comms/outbox/pangeo-showcase-roamingeye.md)
  instead — it is tailored to that category's rules.
- [`post-geology-lists.md`](post-geology-lists.md) — email to geology/Earth-systems
  teaching contacts. **DRAFT.** Pairs with
  [`comms/outbox/classroom-lab-one-pager.md`](../../comms/outbox/classroom-lab-one-pager.md)
  as the follow-up.
- [`maintainer-comment-template.md`](maintainer-comment-template.md) — the reusable
  3-sentence "what is this?" reply, with per-channel closing lines. Not a post; a
  response asset for use once a thread is live.

**Historical records** (provenance only — do not work from them):

- [`LAUNCH_CHECKLIST.md`](LAUNCH_CHECKLIST.md) — the v0.2.0 cut. Superseded, except for
  the still-outstanding Zenodo DOI steps.
- [`release-notes-v0.2.0.md`](release-notes-v0.2.0.md),
  [`release-notes-v1.0.0.md`](release-notes-v1.0.0.md) — shipped release notes.

## Claims drift — what was repaired on 2026-07-27

These drafts were written before v1.0.0 and had gone stale in ways that **understated**
the project. Audited against `main` and fixed:

| Claim as written                                        | Reality on `main`                                                                                                                 |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| "the flagship roadmap item is quadtree tiled streaming" | **Shipped**, and on by default — native resolution, ~31 m terrain, parent-tile fallback                                           |
| "contributors — the tiled-streaming RFC is the fun one" | Same; the live flagship is now [#170](https://github.com/zkWizard/RoamingEye/issues/170), inverting against GIBS's real colormaps |
| "~100 unit tests on the pure logic"                     | **Over 2,000** unit tests across ~200 test modules                                                                                |
| "26 years" as the record length                         | **26–46 years** depending on layer; reanalysis reaches 1980                                                                       |
| good-first-issues → `/issues`                           | The label URL the README uses, so the link actually lands on the groomed queue                                                    |
| _(absent)_                                              | Seasonal Mann-Kendall + Sen's slope trend test, and the measured per-layer inversion accuracy published in `METHODS.md`           |

Verified as still accurate and left alone: the 9-layer list, ~1,200 GVP Holocene
volcanoes, Bird (2003) plate boundaries, USGS M4.5+ on a rolling 30-day feed, 30 m HLS
study patches, drawn study regions, MIT, no backend, and the colormap-inversion caveat.

**Before sending any of these, re-check the claims against `README.md`** — RoamingEye
ships continuously and this table will itself go stale.
