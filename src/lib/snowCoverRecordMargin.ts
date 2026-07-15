import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  SNOW_COVER_SOURCE_RESOLUTION,
  type SnowCoverObservation,
  type SnowCoverSummary,
} from "./snowCover";
import {
  describeSnowCoverPercentile,
  type SnowCoverPercentileOptions,
  type SnowCoverPercentileSample,
  type SnowCoverPercentileStatus,
} from "./snowCoverPercentile";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Same-calendar-month record standing (and margin) for a supplied monthly
 * snow-cover value (cryosphere).
 *
 * The empirical percentile (`describeSnowCoverPercentile`) reports the target's
 * *rank* within its same-place, same-calendar-month record, and the snow-season
 * helpers describe the *shape* and *timing* of a run of months. None answers the
 * plainest question a reader asks when a month tops or bottoms the chart: *by how
 * much did it beat the prior extreme?* A percentile, by construction, saturates
 * at "most/least snow in record" and can never fall outside the sampled range,
 * so it cannot state that margin — e.g. "6 percentage points above the snowiest
 * prior March in this record". That margin is exactly what this helper adds: a
 * categorical standing against the prior same-place, same-calendar-month record,
 * the signed percentage-point margin to the breached extreme, and the earliest
 * prior month that held it.
 *
 * It is a PURELY ARITHMETIC comparison of one observed value against the observed
 * minimum and maximum of a short same-calendar-month record. A "record" here is
 * the extreme of the supplied observations only — NOT an all-time or
 * climatological record — and the margin is a difference of two monthly-average
 * fractional-area percentages (percentage points), not a probability, exceedance
 * likelihood, significance test, trend, or return period. Standing stays within
 * the same calendar month and the same place because monthly-average
 * snow-covered area carries a strong seasonal cycle, so a cross-month or
 * cross-place standing would be misleading.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `describeSnowCoverPercentile` (the same audited same-calendar-month machinery
 * behind the snow percentile); this helper adds only the standing and margin on
 * top of that baseline. Like every snow helper it works on MOD10CM's
 * monthly-average fractional snow-covered-area percentage (0-100) — never snow
 * depth, snow-water-equivalent, melt or accumulation rate, runoff, water volume,
 * cause, or any future value.
 *
 * Pure, render-free logic (see snowCoverRecordMargin.test.ts). Provenance is
 * inherited from ./snowCover so a publication cites MOD10CM, not the picture.
 */

export const SNOW_COVER_RECORD_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  'A "record" is the extreme of a short supplied set of prior same-calendar-month observations for the same place — not an all-time high or low, and not a climate normal.',
  "Standing is restricted to the same calendar month and the same place because monthly-average snow-covered area carries a strong seasonal cycle; a cross-month or cross-place standing would be misleading.",
  "The record margin is a plain difference of two monthly-average fractional-area percentages (target minus the prior extreme) in percentage points; it is not a probability, exceedance likelihood, significance test, trend, or return period.",
  "A short record understates the true range of same-month values, so an apparent new record may simply reflect years the record does not contain; it never infers snow depth, snow-water-equivalent, melt, accumulation, runoff, water volume, cause, or any future value.",
] as const;

/** Record standing mirrors the underlying same-calendar-month percentile. */
export type SnowCoverRecordStatus = SnowCoverPercentileStatus;

/**
 * The target's categorical position against the prior same-month record.
 * - `most-in-record`       — strictly above the prior same-month maximum
 * - `ties-most-in-record`  — equals the prior maximum (record has spread)
 * - `least-in-record`      — strictly below the prior same-month minimum
 * - `ties-least-in-record` — equals the prior minimum (record has spread)
 * - `ties-flat-record`     — the prior record has no spread and the target
 *                            equals it (both extremes at once)
 * - `within-record-range`  — strictly between the prior minimum and maximum
 */
export type SnowCoverRecordStanding =
  | "most-in-record"
  | "ties-most-in-record"
  | "least-in-record"
  | "ties-least-in-record"
  | "ties-flat-record"
  | "within-record-range";

export interface SnowCoverRecordMargin {
  kind: "snow-cover-same-month-record-standing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "record-standing-within-supplied-same-place-same-calendar-month-record-only";
  dataset: DatasetRef;
  sourceResolution: string;
  status: SnowCoverRecordStatus;
  /** Single-month summary of the compared target, retained for provenance. */
  target: SnowCoverSummary;
  /** Calendar month (1-12) the record was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Native unit of every value and margin below (percentage points). */
  unit: string;
  /** Prior same-calendar-month observations the target was compared against. */
  sampleCount: number;
  /** Retained baseline samples, sorted oldest to newest for auditability. */
  samples: SnowCoverPercentileSample[];
  /** Observed target snow-covered-area percentage, echoed for audit. */
  targetValue: number | null;
  /** Snowiest prior same-month value in the record, or null pre-baseline. */
  priorMostValue: number | null;
  /** Earliest prior month that held the snowy record (ties resolve to earliest). */
  priorMostMonth: YearMonth | null;
  /** Least-snowy prior same-month value in the record, or null pre-baseline. */
  priorLeastValue: number | null;
  /** Earliest prior month that held the low-snow record (ties resolve to earliest). */
  priorLeastMonth: YearMonth | null;
  standing: SnowCoverRecordStanding | null;
  /**
   * `priorMostValue - targetValue` in percentage points: how far the target
   * sits *below* the prior snowy record. Positive within the range, zero when it
   * ties the snowy record, negative when it sets a new snowy record. Null
   * pre-baseline.
   */
  marginBelowMost: number | null;
  /**
   * `targetValue - priorLeastValue` in percentage points: how far the target
   * sits *above* the prior low-snow record. Positive within the range, zero when
   * it ties the low-snow record, negative when it sets a new low-snow record.
   * Null pre-baseline.
   */
  marginAboveLeast: number | null;
  /**
   * Non-negative percentage points by which the target beats the breached
   * extreme, defined only for a strict new record (`most-in-record` → target −
   * priorMost; `least-in-record` → priorLeast − target). Null for ties and for
   * values within the range, where nothing was breached.
   */
  recordExceedanceMargin: number | null;
  /** Short machine-readable reason when no standing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Place one supplied monthly snow-cover observation against the prior same-
 * calendar-month record at the same place and report its standing and margin.
 *
 * The gathering, deduplication, coverage filtering, target-year exclusion, and
 * sample floor are delegated to `describeSnowCoverPercentile`, so a standing is
 * reported only when that audited baseline is itself `available` — a
 * not-yet-published, low-coverage, or under-sampled record never yields a
 * fabricated record claim. A `null` standing therefore means "no standing can be
 * stated", never "unremarkable".
 */
export function describeSnowCoverRecordMargin(
  targetObservation: SnowCoverObservation,
  priorSameMonthObservations: readonly SnowCoverObservation[],
  availableThrough: YearMonth,
  options: SnowCoverPercentileOptions = {}
): SnowCoverRecordMargin {
  const percentile = describeSnowCoverPercentile(
    targetObservation,
    priorSameMonthObservations,
    availableThrough,
    options
  );

  const base = {
    kind: "snow-cover-same-month-record-standing",
    isForecast: false,
    isTrend: false,
    claimScope:
      "record-standing-within-supplied-same-place-same-calendar-month-record-only",
    dataset: SNOW_COVER_DATASET,
    sourceResolution: SNOW_COVER_SOURCE_RESOLUTION,
    status: percentile.status,
    target: percentile.target,
    calendarMonth: percentile.calendarMonth,
    unit: "% snow-covered area",
    sampleCount: percentile.sampleCount,
    samples: percentile.samples,
    limitations: SNOW_COVER_RECORD_LIMITATIONS,
  } as const;

  const unavailable = {
    ...base,
    targetValue: null,
    priorMostValue: null,
    priorMostMonth: null,
    priorLeastValue: null,
    priorLeastMonth: null,
    standing: null,
    marginBelowMost: null,
    marginAboveLeast: null,
    recordExceedanceMargin: null,
  };

  // A record standing is only meaningful once the audited percentile baseline is
  // available: the target is a published, usable observation and the record
  // clears the sample and coverage floors. Every other status passes through
  // with a null standing.
  if (percentile.status !== "available" || percentile.samples.length === 0) {
    return {
      ...unavailable,
      reason: percentile.reason ?? "record-standing-unavailable",
    };
  }
  const target = percentile.target.snowCoveredPercent;
  if (target === null) {
    return {
      ...unavailable,
      reason: "missing-target-value",
    };
  }

  const values = percentile.samples.map((sample) => sample.snowCoveredPercent);
  const priorMost = Math.max(...values);
  const priorLeast = Math.min(...values);
  const marginBelowMost = priorMost - target;
  const marginAboveLeast = target - priorLeast;

  let standing: SnowCoverRecordStanding;
  let recordExceedanceMargin: number | null = null;
  if (target > priorMost) {
    standing = "most-in-record";
    recordExceedanceMargin = target - priorMost;
  } else if (target < priorLeast) {
    standing = "least-in-record";
    recordExceedanceMargin = priorLeast - target;
  } else if (priorMost === priorLeast) {
    // The prior record has no spread; equalling it ties both extremes at once.
    standing = "ties-flat-record";
  } else if (target === priorMost) {
    standing = "ties-most-in-record";
  } else if (target === priorLeast) {
    standing = "ties-least-in-record";
  } else {
    standing = "within-record-range";
  }

  return {
    ...base,
    targetValue: target,
    priorMostValue: priorMost,
    priorMostMonth: earliestMonthWithValue(percentile.samples, priorMost),
    priorLeastValue: priorLeast,
    priorLeastMonth: earliestMonthWithValue(percentile.samples, priorLeast),
    standing,
    marginBelowMost,
    marginAboveLeast,
    recordExceedanceMargin,
    reason: null,
  };
}

/**
 * The earliest retained baseline month whose value equals `value`. Samples are
 * already sorted oldest-to-newest, so the first exact match is the earliest
 * holder — matching the tie convention used elsewhere in the seasonal helpers.
 * Returns null if no sample matches (never expected for min/max drawn from the
 * same samples, but kept honest rather than asserting).
 */
function earliestMonthWithValue(
  samples: readonly SnowCoverPercentileSample[],
  value: number
): YearMonth | null {
  for (const sample of samples) {
    if (sample.snowCoveredPercent === value) return sample.dataMonth;
  }
  return null;
}
