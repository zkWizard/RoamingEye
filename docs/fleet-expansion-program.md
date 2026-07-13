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
- Do not deploy, merge, approve a catalog record, or open a public PR without a
  human review step.
- Record changed files, validation, limits, and the next queue item in the
  expansion queue after every cycle.

## Draft PR contract

Every completed code slice must become its own draft pull request. The
coordinator creates a `codex/<lane>-<task>` branch from the current expansion
foundation, stages only the task's declared files, commits after validation,
pushes it, and opens a draft PR. It records the branch, commit, PR URL, and
validation in the queue before returning to the foundation branch.

The coordinator never auto-merges. A person reviews scientific framing, code,
tests, and the PR's relationship to other expansion slices before merging.

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

## Coordinator standard

The coordinator runs every 30 minutes. It selects an unblocked item from each
lane's queue, reuses the relevant agent thread when available, and advances at
least one production code contribution before it may write a status update. A
cycle that only reruns the catalog is incomplete.
