# RoamingEye value scorecard — 2026-08-15

What users actually get, measured fresh each week. Merged-PR counts and lines
of code are **not** success metrics here; see the activity footnote.

First run — no prior scorecard existed, so "last week" columns are `—`.

## 1. Data currency, per layer

GIBS `DescribeDomains` probed 2026-08-15. "Pin" is the compiled `latest` in
`src/lib/timeline.ts`; layers with no explicit `latest` (\*) inherit
`DATA_LATEST` = 2026-05.

| layer     | GIBS newest   | pin       | pin trails GIBS | GIBS trails today |
| --------- | ------------- | --------- | --------------- | ----------------- |
| ndvi      | 2026-06       | 2026-05\* | 1               | 2                 |
| evi       | (ndvi fam.)   | 2026-05\* | 1               | 2                 |
| lst       | 2026-07       | 2026-05\* | **2** ⚠️        | 1                 |
| snow      | 2026-07       | 2026-05\* | **2** ⚠️        | 1                 |
| airtemp   | 2026-05       | 2026-03   | **2** ⚠️        | 3                 |
| aerosol   | 2026-05       | 2026-03   | **2** ⚠️        | 3                 |
| precip    | 2026-03       | 2026-01   | **2** ⚠️        | 5                 |
| soil      | (precip fam.) | 2026-01   | **2** ⚠️        | 5                 |
| sst       | 2026-04       | 2026-03   | 1               | 4                 |
| landcover | 2024-01       | 2024-01   | 0               | 31 (annual)       |

**6 pins flagged** (>1 month behind GIBS): lst, snow, airtemp, aerosol,
precip, soil. The freshness owner (environmental scientist) has fallen behind
on all six.

Severity is not uniform, and the split matters more than the flag count:

- **Cold-boot-only.** The eight layers in `FRESHNESS_FAMILIES` are re-pinned
  at boot by the DescribeDomains probe, so a stale compiled pin costs users
  only the first paint. Real, but self-healing.
- **Permanently user-visible.** `sst` and `landcover` are deliberately outside
  the families, so the compiled pin is the _only_ thing users ever get. **sst
  is a live one-month deficit** — GIBS publishes 2026-04, the app offers
  2026-03, and nothing at runtime closes that gap. It falls just under the
  flag threshold, and it is the week's most user-visible currency defect.

`precip`/`soil` carry the worst upstream lag (GIBS itself 5 months behind
today) — that is NASA's GLDAS pipeline, not ours.

## 2. Reachability

Sourcemap walk over `vite build --sourcemap` (`.js.map` `.sources`).
`scripts/walk-wired.mjs` **does not exist in the repo** — the walk was
reimplemented inline for this run. Worth committing as a script so the number
is reproducible.

| metric            | this week | last week |
| ----------------- | --------- | --------- |
| `src/lib` modules | 285       | —         |
| wired             | 139       | —         |
| unreachable       | 146       | —         |
| wired share       | 48.8%     | —         |

**More than half of `src/lib` is unreachable from the entry graph.** 146
modules ship no value to any user.

## 3. Product surface health

Caveat-accretion watch — these should be flat or falling; the Editor agent
owns reductions.

| file                                   | lines | last week |
| -------------------------------------- | ----- | --------- |
| `src/ui/ProbePanel.ts`                 | 908   | —         |
| `src/ui/PlaceInsights.ts`              | 765   | —         |
| `src/place/placeInsightsController.ts` | 849   | —         |
| `src/main.ts`                          | 1770  | —         |
| ProbePanel + PlaceInsights combined    | 1673  | —         |

**Backlog: `docs/BACKLOG.md` does not exist**, so Owner's picks and
Agent-verified candidates could not be counted — the headings appear nowhere
in the repo. Nearest surface is `ROADMAP.md` with 9 unchecked items. Either
create the backlog file or repoint this metric.

Build (`npm run build`): **ok** — entry `index` **46.4 kB gzip** (budget 60),
total JS **279.4 kB gzip**. Largest chunks: `three` 133.3 kB,
`placeInsightsController` 38.2 kB, `plateBoundaryHover` 23.9 kB. No budget
FAIL.

## History

| date       | wired/unreachable | Probe+Place lines | entry kB | GIBS-trailing pins |
| ---------- | ----------------- | ----------------- | -------- | ------------------ |
| 2026-08-15 | 139 / 146         | 1673              | 46.4     | 6                  |

---

_Activity — context only, not a success metric: 254 PRs merged 2026-08-08 →
2026-08-15._
