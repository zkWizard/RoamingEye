# Earth Science Expansion Fleet

## Purpose

The fleet's main job is to make RoamingEye materially better in code. Every
cycle must produce a bounded source, test, data-contract, or user-workflow
improvement. Research notes, catalog refreshes, and status updates support the
work, but never count as a completed cycle on their own.

The catalog evidence pipeline remains review-gated. This program is the product
expansion track that turns Earth-science expertise into usable, testable site
capabilities.

## Operating rules

- Work one independently testable code slice at a time.
- Pair behavior changes with focused tests; use browser checks for user-facing
  workflows.
- Prefer existing public NASA, USGS, Smithsonian, Natural Earth, and OpenStreetMap
  sources already cited by the project before proposing a new source.
- Never present a heuristic as a scientific measurement, forecast, risk score,
  diagnosis, or causal conclusion.
- Do not deploy or approve a catalog record automatically. Fleet-owned feature
  PRs are reviewed and merged by the Project Manager Agent after validation.
- Record changed files, validation, limits, and the next suggested slice in
  the ready PR itself. The Project Manager records the consolidated cycle
  outcome in the expansion queue after integration.

## Ready PR and merge-management contract

Every completed code slice must become its own ready-for-review pull request.
It must contain at least one real source or test commit; documentation-only,
status-only, research-only, and catalog-only changes do not satisfy this
contract. Each specialist creates a `codex/<lane>-<task>` branch from `main`,
stages only the task's declared files, commits after validation, pushes it, and
opens a ready-for-review PR targeting `main`. The PR body records its branch,
commit, provenance, validation, limitations, ownership, and next slice.

All six domain lanes start together every 30 minutes in isolated worktrees. A
specialist must not edit `fleet/expansion-queue.json` or fleet logs, because
shared bookkeeping would serialize otherwise independent implementation work.
One substantive, validated PR per specialist is the normal minimum for a
successful cycle; a second or third PR is appropriate only when it is equally
complete, independently useful, and not artificial quota-filling.

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

## Domain lanes

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

Each specialist runs every 30 minutes. It selects an unblocked item from its
own lane, inspects active PRs to avoid duplicated work, and advances at least
one production code contribution before it may report a status update. The
Project Manager runs near the end of the same 30-minute window to review,
repair narrowly resolvable conflicts, merge qualified PRs, and checkpoint the
outcome. A cycle that only reruns the catalog or reports status is incomplete.
