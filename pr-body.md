Batch-integrates three open PRs that main had drifted away from. Each was `CONFLICTING/DIRTY` on its own; all three are resolved here against current main, and the combined branch is green.

## Included

- **#467 — Reject ambiguous duplicate NDVI months.** Every record in a duplicate calendar month is now rejected, rather than keeping the first and rejecting only the repeat, so input order cannot alter an annual peak or trough. Main's `suppliedCalendarMonths` / `omittedCalendarMonths` coverage fields (added after #467 was opened) now derive from #467's `monthRecords` map, which replaced the `seenMonths` set — git merged those textually but left `annualSummary` referencing a field that no longer existed. Main's own duplicate-month test expectations were recomputed under the stricter rule (`validMonthCount` 1→0, `invalidRecordCount` 3→4).
- **#510 — Preserve NDVI modality coverage.** Kept main's `observedMonthCount` / `dataPeriod` assertions alongside #510's `segmentBreakCount`, and added `observedMonthCount` to #510's exact-match (`toEqual`) coverage expectation, which predated that field.
- **#507 — Link SST coverage to its source month.** #507's `SstCoverageLink` and main's `SstFootprintAlignment` are independent features that landed in the same region of `marineObservation.ts`. Both type blocks and both helper functions are kept; three interleaved tests were de-interleaved.

## Verification

`npm run verify` passes on this branch — typecheck, lint, format:check, **2325 tests across 209 files**, catalog check, and build.

## Bundle budget

Measured at **61,414 gzip bytes, identical to main** — this batch costs **zero** bytes. All three PRs touch modules that are tree-shaken out of the app chunk. That matters because main currently sits 26 bytes under the 61,440-byte cap in `scripts/check-bundle-size.mjs`, so it is the only reason these can land at all (see #628 / #632, and the warning added in #637).

## Not included

- **#587 (Reject unpublished land-cover persistence years)** — superseded by main. Main already separates unpublished years into a dedicated `outsideLayerRangeYearCount` bucket; #587 folds them back into `invalidRecordCount` and drops that distinction, so merging it would regress main. Recommend closing.
