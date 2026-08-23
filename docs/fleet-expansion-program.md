# Earth Science Expansion Fleet

## Purpose

The fleet's main job is to make RoamingEye **materially more useful to a person
using it** — not merely to add more tested code. Every cycle must move a
user-visible surface: a new or improved interaction, a wired-in capability, a
new data layer, or a flagship-roadmap step. Pure library logic, research notes,
catalog refreshes, and status updates support that work, but never count as a
completed cycle on their own.

This rule exists because the fleet drifted. It became very good at producing
small, well-tested `src/lib` modules and one-sentence caveat clauses — real,
green code that a user never sees. The result was high commit velocity with
stalled product evolution. The definition of done below, the anti-patterns, and
the [wired-module budget](#the-wired-module-budget) exist to correct that.

The catalog evidence pipeline remains review-gated. This program is the product
expansion track that turns Earth-science expertise into usable, testable site
capabilities.

## Definition of done — read this first

A cycle is complete only if the merged work does **at least one** of these, and
can say so concretely in its PR:

1. **Ships a user-visible change** — something a person sees or can do in the
   browser is new or better. Pair it with an e2e or manual browser check.
2. **Wires a staged module** — connects an existing unreachable `src/lib`
   module to a real call site so its output reaches the UI. This lowers the
   [wired-module budget](#the-wired-module-budget); lower the ceiling in the
   same PR.
3. **Advances a flagship roadmap item** — a reviewable step toward a 🚩 goal in
   [ROADMAP.md](../ROADMAP.md) (e.g. real-colormap probe accuracy, a new layer,
   Sentinel-2 at 10 m), even if it is one step of several.

Robustness, numerics, accessibility, and provenance work is still welcome and
sometimes essential — but it now flows through the **Platform & Quality** lane
with a cap (below), so it supports the product instead of becoming the product.

### Anti-patterns — these do not complete a cycle

- **A new staged module.** Adding a unit-tested `src/lib` module with no call
  site is not progress; it is inventory. If the logic is worth writing, wire it
  in the same cycle. CI enforces this — see the wired-module budget.
- **A caveat-only clause.** Appending another qualifying sentence to the probe
  panel or place-insights readout (a new `*Censoring`, `*Clause`, `*Gate`, or
  `*Absence` helper wired to one more line of hedging text) is not a
  user-visible improvement. Consolidate caveats into the methodology
  disclosure; do not grow the wall of text.
- **Micro-polish churn presented as a cycle.** A focus-ring tweak, a phone
  caption nudge, or a copy reword can be a fine incidental fix, but a whole
  cycle whose only output is one of these does not qualify.
- **Status/research/catalog-only output.** As before, these support work but
  never count on their own.

## Operating rules

- Deliver against the definition of done above — a user-visible change, a wired
  module, or a flagship step — not just "a bounded, tested slice."
- Work one independently testable slice at a time; pair behavior changes with
  focused tests, and use browser checks for user-facing workflows.
- Prefer wiring or improving what already exists over authoring new staged
  logic. Before writing a new module, check whether a staged one already covers
  it: `node scripts/walk-wired.mjs --list staged`.
- Prefer existing public NASA, USGS, Smithsonian, Natural Earth, and OpenStreetMap
  sources already cited by the project before proposing a new source.
- Never present a heuristic as a scientific measurement, forecast, risk score,
  diagnosis, or causal conclusion.
- Do not deploy or approve a catalog record automatically. Fleet-owned feature
  PRs are reviewed and merged by the Project Manager Agent after validation.
- Record changed files, validation, limits, **which definition-of-done clause
  the cycle satisfies**, and the next suggested slice in the ready PR itself.
  The Project Manager records the consolidated cycle outcome and the
  [pipeline metrics](#pipeline-metrics) in the expansion queue after integration.

## The wired-module budget

`scripts/check-wired-budget.mjs` (CI job **Wired-module budget**, also part of
`npm run verify`) fails when the number of **staged** (unreachable) `src/lib`
modules grows past the ceiling committed in `fleet/wired-budget.json`. Staged
code is tree-shaken out of the bundle, so it costs no bytes and reaches no user;
the budget makes that shelf a fixed size that can only shrink.

- Adding a staged module pushes the count over the ceiling and turns the build
  red — the mechanical enforcement of the "a new staged module is not progress"
  rule.
- Wiring a staged module lowers the count; **lower `maxStagedModules` to match
  in the same PR** to ratchet the win in.
- As with the gzip [bundle budget](../.github/CONTRIBUTING.md#the-bundle-budget--read-this-before-adding-code-to-the-app),
  the ceiling can be raised, but only deliberately and with justification in the
  PR that does it.

## Ready PR and merge-management contract

Every completed code slice must become its own ready-for-review pull request.
It must contain at least one real source or test commit; documentation-only,
status-only, research-only, and catalog-only changes do not satisfy this
contract. Each specialist creates a `codex/<lane>-<task>` branch from `main`,
stages only the task's declared files, commits after validation, pushes it, and
opens a ready-for-review PR targeting `main`. The PR body records its branch,
commit, provenance, validation, limitations, ownership, and next slice.

Lanes start together in isolated worktrees. A specialist must not edit
`fleet/expansion-queue.json` or fleet logs, because shared bookkeeping would
serialize otherwise independent implementation work.

**Quality over quota.** There is no minimum PR count. A cycle that produces
_nothing_ that meets the [definition of done](#definition-of-done--read-this-first)
is an incomplete cycle, not something to pad with a staged module or a caveat
clause to hit a number. One PR that ships a real user-visible change or wires a
staged module is worth more than three that add invisible logic. Flagship work
is explicitly allowed to span several cycles without a PR every window — see the
Flagship lane below.

At the end of every cycle, the Project Manager Agent reviews every open
fleet-owned specialist `codex/` PR targeting `main`. It verifies the
implementation and scientific framing, checks the declared tests and required
CI results, and rebases a conflicted PR onto current `main` when the conflict
can be resolved within that PR's declared ownership. After successful
validation, it merges the PR. It leaves a failing or unsafe-to-resolve PR open
with a clear next action; it never merges unrelated, non-fleet,
catalog-approval, or deployment PRs. The Project Manager is the sole owner of
the shared expansion queue and writes one factual checkpoint only after the
cycle's merge decisions.

## Outcome lanes — who owns new work

The lanes below are the **primary owners of forward progress**. Each is defined
by the user-facing outcome it delivers, not by a scientific specialty, and each
maps to a clause of the [definition of done](#definition-of-done--read-this-first).
This is the small set of owners new work is assigned to; the domain specialists
(next section) feed them expertise and candidate tasks rather than opening
independent PRs of their own.

| Lane                   | Owns                                                                                                                                                                          | Primary done-clause         | Success metric                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- | ------------------------------------------------------- |
| **Integrator**         | Turning staged `src/lib` logic into something on screen: find a staged module, give it a call site and a way to show its result.                                              | Wires a staged module       | Staged-module count falls; `wired-budget` ratchets down |
| **Experience**         | Net-new user-facing features and genuine UI-quality work — new panels, interactions, layouts — not focus-ring/caption micro-tweaks.                                           | Ships a user-visible change | User-visible changes shipped per cycle                  |
| **Flagship**           | The 🚩 [ROADMAP.md](../ROADMAP.md) goals, across multiple cycles: real-colormap probe accuracy (#170), Sentinel-2 at 10 m, new layer families.                                | Advances a flagship item    | Flagship steps landed; roadmap boxes moved              |
| **Layers**             | Growing the layer catalogue end to end — data wiring **and** the UI to pick, render, legend, and probe it (fire/thermal, surface water).                                      | Ships a user-visible change | New layers usable in the app                            |
| **Platform & Quality** | Robustness, numerics, accessibility, provenance, perf, and the budgets — consolidated into one lane with a per-cycle cap so it supports the product instead of dominating it. | Any (supporting)            | Stays within its cap; no regressions                    |

The Integrator and Experience lanes are the default home for most cycles.
Flagship runs longer-horizon work. Platform & Quality is capped: at most one
Platform & Quality PR may merge per cycle, so margin work can no longer crowd
out the outcome lanes.

## Domain lanes (advisory input)

The six Earth-science specialists remain the project's domain expertise, but
their role is now to **supply the outcome lanes** — proposing tasks, reviewing
scientific framing, and defining acceptance criteria and limits — rather than
each opening an independent PR every window. When a specialist does implement
directly, the result must still satisfy the definition of done (typically by
wiring its own analysis into the UI via the Integrator pattern).

### Geologist

Owns tectonic, seismic, volcanic, terrain, and geologic-time experiences. Work
should improve event filtering, spatial context, provenance, or comparison
without inventing hazard claims.

### Biologist

Owns vegetation, land cover, phenology, and ecosystem interpretation. Work
should derive transparent seasonal observations from the existing imagery and
clearly state coverage and limitations.

### Meteorologist

Owns precipitation, air temperature, soil-moisture, and seasonal climate
context. Work should keep source units, publication lag, anomalies, and missing
coverage explicit.

### Marine Biologist

Owns sea-surface temperature and coastal or ocean observation workflows. Work
should distinguish marine data coverage from land products and keep coastal
mixing visible to the user.

### Environmental Scientist

Owns cross-signal environmental briefings, provenance, access, and responsible
decision support. Work should compose indicators without reducing them to an
unsupported single environmental score.

### Geospatial and Remote-Sensing Engineer

Owns Polygon and MultiPolygon sampling, antimeridian behavior, imagery
coverage, reproducibility, and spatial-performance safeguards shared by every
domain lane.

## Fleet cadence

The outcome lanes run each cycle. A lane selects an unblocked item, inspects
active PRs to avoid duplicated work, and advances one slice that meets the
[definition of done](#definition-of-done--read-this-first). Flagship work may
carry across cycles without a PR each window; the other lanes should either land
a qualifying change or report the cycle as incomplete — **padding a cycle with a
staged module or a caveat clause to look productive is itself a failure mode.**
The Project Manager runs near the end of the window to review, repair narrowly
resolvable conflicts, merge qualified PRs (at most one Platform & Quality PR per
cycle), record the [pipeline metrics](#pipeline-metrics), and checkpoint the
outcome. A cycle that only reruns the catalog, reports status, or ships
invisible logic is incomplete.

## Pipeline metrics

The Project Manager records these per cycle in `fleet/expansion-queue.json`
(under `pipeline.metrics`) so the fleet is judged by **outcomes, not PR volume**.
PR count is deliberately not a headline metric — it is the number that drifted.

- **userVisibleChanges** — cycles/PRs that shipped something a person sees or
  can do in the browser.
- **modulesWired** — staged `src/lib` modules given a call site this cycle
  (should track the fall in `fleet/wired-budget.json`).
- **stagedModuleCount** — current unreachable-module count from
  `node scripts/walk-wired.mjs`; the trend should be flat or down, never up.
- **flagshipStepsLanded** — reviewable steps toward a 🚩 roadmap goal.
- **roadmapBoxesMoved** — items checked off in [ROADMAP.md](../ROADMAP.md).

If a week's `stagedModuleCount` rose while `userVisibleChanges` stayed flat, the
pipeline has regressed to the old pattern regardless of how many PRs merged.
