# RoamingEye Governance

This document describes how RoamingEye is run: the roles people hold, how trust
is earned, how changes get approved, and how decisions are made. It's modelled
on practices from established open-source projects (Godot, Blender, Bevy,
Kubernetes, Rust, Node.js) — adapted to a young project, and intended to grow as
the community does.

> **Current stage:** RoamingEye is early and small. Today the project lead is
> also the only maintainer. The roles below describe where we're heading; as
> contributors arrive, we'll populate them for real. Nothing here is set in
> stone — propose changes via a PR to this file.

---

## Principles

- **Everything is reviewed.** All code reaches `main` through a pull request that
  someone other than the author has approved (once there's more than one of us).
- **Trust is earned, not requested.** Privileges follow a track record of good
  contributions and good judgement — there is no application form for merge
  rights.
- **Rigor scales to risk.** A typo and a new physics subsystem do not get the
  same process. See _Review & merge requirements_.
- **Decisions are made in the open**, on issues and pull requests.

---

## Roles

### Contributor

Anyone who opens an issue or pull request, or reviews others' work. No special
permissions required. Community reviews are valuable and count toward a PR's
readiness.

### Triager

A trusted contributor who can label, triage, and help shepherd issues and PRs
(but does not have merge rights). Offered to people who consistently help keep
the tracker healthy.

### Reviewer / Area Code Owner

A contributor with recognised expertise in an area (e.g. rendering, geospatial
data, build/CI). Listed in [`.github/CODEOWNERS`](./.github/CODEOWNERS) for that
area; their approval is required for changes touching it. Reviewers vouch for
correctness and design fit but do not necessarily hold merge rights.

### Maintainer

Holds merge rights to the repository. Responsible for final review, ensuring
changes align with the project's direction, mentoring contributors, and
upholding the Code of Conduct. Maintainers are added by consensus of the
existing maintainer(s) and the project lead, based on a sustained history of
high-quality contributions and reviews.

### Project Lead

Sets overall technical direction and has the final say when consensus can't be
reached. Currently **[@zkWizard](https://github.com/zkWizard)**. The lead's role
is to break ties and steward the vision — not to bypass review.

### The trust ladder

```
Contributor → Triager → Reviewer / Area Owner → Maintainer
```

Movement up the ladder is by invitation from those already holding the role,
based on demonstrated merit: quality of contributions, soundness of reviews, and
constructive, respectful collaboration.

---

## Review & merge requirements

Review depth scales with the size and risk of a change:

| Change type                                                                                                                   | What's required                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| **Trivial** — typo, docs, one-line fix                                                                                        | 1 maintainer approval + green CI                                                          |
| **Standard** — bug fix, contained feature                                                                                     | Approval from a maintainer or the relevant area code owner + tests + green CI             |
| **Substantial / architectural** — new subsystem, coordinate-system or data-pipeline changes, broad or hard-to-reverse changes | A **design proposal** agreed _before_ implementation, plus area-owner sign-off + green CI |

All merges require:

- A pull request (no direct pushes to `main`).
- All required status checks passing (lint, type-check, unit, build, e2e smoke).
- All review conversations resolved.
- DCO sign-off on every commit.

As the maintainer team grows, the standard bar rises to **two approvals**, and a
maintainer's own PRs will require another maintainer's review.

---

## Proposals (for substantial changes)

Large or contentious changes should start as a **design proposal** — open an
issue using the proposal template describing the problem, the proposed approach,
alternatives considered, and the impact. This is our lightweight equivalent of
an RFC. The goal is to reach agreement on the design _before_ significant
implementation effort, so contributors don't build something that then has to be
reworked or rejected.

As the project matures we may move proposals into a dedicated `proposals/`
directory or repository.

---

## Decision-making

We work by **lazy consensus**: a proposal or PR with support and no sustained,
reasoned objection moves forward. When there's disagreement, we discuss in the
open and seek a resolution that addresses the concerns. If consensus genuinely
can't be reached, the project lead decides. A reasoned objection from a
maintainer or area owner on a change in their area should be resolved, not
steamrolled.

---

## Changing this document

Governance evolves with the project. Propose changes by opening a pull request
against this file; substantial governance changes are themselves treated as
_substantial_ changes (discussion first, maintainer consensus to merge).
