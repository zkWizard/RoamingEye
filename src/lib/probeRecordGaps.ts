import {
  LAYERS,
  compareYm,
  formatYm,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * Months inside a probed series' own span that the cited source never
 * distributed — the correction the probe's coverage fraction needs.
 *
 * The probe charts `monthRangeForLayer(layer)` and its status line opens with
 * `N of M months`. That `M` is not the calendar span: `monthRangeForLayer`
 * deliberately drops each layer's declared distribution gaps (`unpublished` in
 * timeline.ts) so the scrubber cannot land on a tile that 404s and no consumer
 * records a gap as a month that was observed and came back empty. The drop is
 * right; leaving it undisclosed is not. Four of the app's layers pin such gaps:
 *
 *  - `sst` — five months (MODIS/Aqua daytime monthly SST), two consecutive.
 *  - `snow` — six months (MOD10CM), four of them inside a snow season.
 *  - `ndvi` and `evi` — April 2025, the same MOD13A3 granule gap on both.
 *
 * So a sea surface temperature probe reports `283 of 283 months` — read as a
 * complete record — while five calendar months in the charted span carry no
 * composite at all, are missing from the x-axis, and are missing from the CSV
 * the reader exports. The distinction this module preserves is the one
 * `climateRecordGaps.ts` makes for the place panel: "the source has no
 * observation here" is a claim about the ocean or the land surface; "the source
 * never distributed this month" is a claim about distribution, and only the
 * second one is supported.
 *
 * Scientific honesty, kept here because the status line surfaces it:
 *  - A gap is a distribution fact. Nothing here claims why a month is absent,
 *    and nothing claims what the surface or atmosphere did during it.
 *  - The pins are catalog data measured from GIBS WMTS GetCapabilities on a
 *    stated date, not inferred from failed tile fetches — a 404 alone cannot
 *    separate a month that was never published from one briefly unreachable.
 *  - Only pinned gaps are reported. `timeline.ts` notes that the 2 m
 *    air-temperature product also splits into several upstream ranges that this
 *    catalog has not yet recorded, so an empty result is not a contiguity
 *    guarantee and is never phrased as one.
 *
 * This module reads no value and changes none. It computes no anomaly, attaches
 * no baseline, and infers no condition, trend, cause, or forecast.
 */

/** Honest scope limits for the record-gap descriptor. */
export const PROBE_RECORD_GAPS_LIMITATIONS = [
  "A gap is a distribution fact measured from the source's advertised time dimension; it says nothing about what the surface or atmosphere did during that month.",
  "Only the gaps this app's catalog pins are reported, so an empty result means no gap is recorded for the layer — not that the source record is proven contiguous.",
  "The undistributed months are absent from the charted series, so every statistic reported beside them — the month count, min, mean, max, trend, and any same-calendar-month baseline — is computed over the distributed subset alone.",
  "The pins are catalog data verified on a stated date and can rot both ways: a month NASA later backfills would still be reported as a gap, and a newly dropped month would not be reported at all.",
] as const;

export interface ProbeRecordGaps {
  kind: "probe-record-gaps";
  /** A statement about distribution, never an observation of the surface. */
  isObservation: false;
  isForecast: false;
  /** False when no layer is identified, or the layer pins no gaps at all. */
  applicable: boolean;
  /**
   * Pinned distribution gaps falling inside the charted span, oldest → newest.
   * Empty whenever the charted months clear every pinned gap.
   */
  months: readonly YearMonth[];
  /** The cited product the gap belongs to; never dropped from the summary. */
  dataset: DatasetRef | null;
  limitations: readonly string[];
}

/**
 * Find the pinned distribution gaps inside a probed series' span.
 *
 * `months` are the charted months exactly as the panel holds them — already
 * gap-free, which is why the gaps have to be recovered from the catalog rather
 * than found in the series. The span is taken from the earliest and latest
 * entries rather than the first and last, so a caller that supplies months out
 * of order still gets the right answer instead of a silently empty one.
 */
export function probeRecordGaps(
  layerId: LayerId | undefined,
  months: readonly YearMonth[]
): ProbeRecordGaps {
  const base = {
    kind: "probe-record-gaps",
    isObservation: false,
    isForecast: false,
    limitations: PROBE_RECORD_GAPS_LIMITATIONS,
  } as const;
  const layer = layerId ? LAYERS[layerId] : undefined;
  const declared = layer?.unpublished ?? [];
  if (!layer || declared.length === 0) {
    return { ...base, applicable: false, months: [], dataset: null };
  }
  if (months.length === 0) {
    return {
      ...base,
      applicable: true,
      months: [],
      dataset: layer.dataset ?? null,
    };
  }

  let earliest = months[0];
  let latest = months[0];
  for (const month of months) {
    if (compareYm(month, earliest) < 0) earliest = month;
    if (compareYm(month, latest) > 0) latest = month;
  }

  const inSpan = declared
    .filter(
      (gap) => compareYm(gap, earliest) >= 0 && compareYm(gap, latest) <= 0
    )
    .slice()
    .sort(compareYm);

  return {
    ...base,
    applicable: true,
    months: inSpan,
    dataset: layer.dataset ?? null,
  };
}

/** How many gap months a clause names before falling back to a tally. */
const LISTED_GAP_LIMIT = 3;

/**
 * The status-line clause qualifying the probe's `N of M months` fraction, or
 * null when the charted span clears every pinned gap — a layer with no recorded
 * gap, and any window inside a contiguous stretch, then reads exactly as before.
 */
export function probeRecordGapsClause(gaps: ProbeRecordGaps): string | null {
  if (!gaps.applicable || gaps.months.length === 0) return null;
  const count = gaps.months.length;
  const listed = gaps.months.slice(0, LISTED_GAP_LIMIT).map(formatYm);
  const remaining = count - listed.length;
  const named =
    remaining > 0
      ? `${listed.join(", ")}, +${remaining} more`
      : listed.join(", ");
  return (
    `span also holds ${count} ${count === 1 ? "month" : "months"} ` +
    `the source never distributed (${named}), absent from the count, ` +
    `the chart and the CSV`
  );
}
