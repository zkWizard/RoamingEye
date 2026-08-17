# RoamingEye value scorecard — 2026-08-17

What users actually get, measured fresh each run. Merged-PR counts and lines
of code are **not** success metrics here; see the activity footnote.

Parenthesised figures are the previous scorecard (2026-08-15). **Interval is
2 days, not a week** — the run fired off-cadence, so deltas are two days of
fleet output, not seven.

## 1. Data currency, per layer

GIBS `DescribeDomains` probed 2026-08-17. "Pin" is the compiled `latest` in
`src/lib/timeline.ts`. Every layer now carries an explicit `latest`; none
inherit `DATA_LATEST` (2026-07, was 2026-05).

| layer     | GIBS newest | pin     | pin trails GIBS | GIBS trails today |
| --------- | ----------- | ------- | --------------- | ----------------- |
| ndvi      | 2026-07     | 2026-06 | 1 (1)           | 1                 |
| evi       | 2026-07     | 2026-06 | 1 (1)           | 1                 |
| lst       | 2026-07     | 2026-07 | 0 (2)           | 1                 |
| snow      | 2026-07     | 2026-07 | 0 (2)           | 1                 |
| airtemp   | 2026-05     | 2026-05 | 0 (2)           | 3                 |
| aerosol   | 2026-05     | 2026-05 | 0 (2)           | 3                 |
| precip    | 2026-03     | 2026-03 | 0 (2)           | 5                 |
| soil      | 2026-03     | 2026-03 | 0 (2)           | 5                 |
| sst       | 2026-04     | 2026-04 | 0 (1)           | 4                 |
| landcover | 2024-01     | 2024-01 | 0 (0)           | 31 (annual)       |

**0 pins flagged, down from 6.** The freshness owner cleared the entire
backlog in two days. ndvi/evi trail by exactly 1 month, under the threshold.

Two structural fixes landed, not just pin bumps:

- **`sst` joined `FRESHNESS_FAMILIES`.** Last week's most user-visible
  currency defect — sst sat permanently outside the boot probe, so its
  compiled pin was the only month users ever saw and it ran a full
  publication behind. It is now boot-verified like the rest. **Closed.**
- **`landcover` stays outside the families deliberately** and is now
  documented as such: an annual categorical product whose pin moves once a
  year, tracked by hand in `docs/BACKLOG.md`. Its pin matches GIBS exactly.

`precip`/`soil` still carry the worst upstream lag (GIBS itself 5 months
behind today). That is NASA's GLDAS pipeline, not ours — nothing to fix here.

## 2. Reachability

`node scripts/walk-wired.mjs` — the script **now exists in the repo** (last
week's run reimplemented the walk inline). The number is reproducible.

| metric            | this run | 2026-08-15 |
| ----------------- | -------- | ---------- |
| `src/lib` modules | 289      | 285        |
| wired             | 143      | 139        |
| unreachable       | **146**  | 146        |
| wired share       | 49.5%    | 48.8%      |

**Unreachable is flat at 146 across the interval.** Four modules were added
and four were wired — the pile did not shrink by one. Half of `src/lib` still
ships no value to any user, and no run has yet moved that number down.

## 3. Product surface health

Caveat-accretion watch — these should be flat or falling; the Editor agent
owns reductions.

| file                                   | lines    | 2026-08-15 | delta    |
| -------------------------------------- | -------- | ---------- | -------- |
| `src/ui/ProbePanel.ts`                 | 900      | 908        | −8       |
| `src/ui/PlaceInsights.ts`              | 765      | 765        | 0        |
| `src/place/placeInsightsController.ts` | 865      | 849        | +16      |
| `src/main.ts`                          | **2129** | 1770       | **+359** |
| ProbePanel + PlaceInsights combined    | 1665     | 1673       | −8       |

The watched pair is finally flat-to-falling — but **accretion moved house.**
`src/main.ts` grew 359 lines in two days (+20%) and is now the largest
hand-written file in the repo at 2129 lines. Twelve merged PRs touched it in
the interval, mostly keyboard-operability and readout wording. The watch list
is measuring the files the Editor agent already reduced, not where growth is
actually happening. Two unwatched files now exceed every watched one except
main.ts itself: `src/lib/placeObservationExport.ts` (1827) and
`src/lib/meteorology.ts` (1318). Recommend widening the watch list to the
four largest source files, re-picked each run, rather than a fixed set.

Backlog (`docs/BACKLOG.md`, which now exists):

- **Owner's picks: 0 real items** — the section holds only its placeholder
  line. Rung 0 remains a no-op for every specialist, unchanged from last run.
- **Agent-verified candidates: 5 unchecked**, 11 items in Done.

Build (`npm run build`): **ok** — entry `index` **50.2 kB gzip** (46.4,
budget 60), total JS **286.7 kB** (279.4). No budget FAIL, but the entry
chunk took 8% of its remaining headroom in two days.

## History

| date       | wired/unreachable | Probe+Place lines | entry kB | GIBS-trailing pins |
| ---------- | ----------------- | ----------------- | -------- | ------------------ |
| 2026-08-15 | 139 / 146         | 1673              | 46.4     | 6                  |
| 2026-08-17 | 143 / 146         | 1665              | 50.2     | 0                  |

---

_Activity — context only, not a success metric: 70 PRs merged 2026-08-15 →
2026-08-17._
