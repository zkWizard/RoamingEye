import { CLIMATE_METRICS, type ClimateMetric } from "./climate";
import type { PrecipitationObservation } from "./precipitationPercentile";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
  type SeasonalBaselineOptions,
  type SeasonalBaselineStatus,
} from "./seasonalBaseline";
import type { YearMonth } from "./timeline";

/**
 * Same-calendar-month record standing (and margin) for a supplied monthly
 * precipitation value.
 *
 * The empirical percentile (`describePrecipitationPercentile`) reports the
 * target's *rank* within its same-place, same-calendar-month record, and the
 * month-over-month change (`summarizePrecipitationAccumulationChange`) reports a
 * plain difference between two adjacent windows. Neither answers the plainest
 * question a reader asks when a month tops or bottoms the chart: *by how much did
 * it beat the prior extreme?* A percentile, by construction, saturates at
 * "wettest/driest in record" and can never fall outside the sampled range, so it
 * cannot state that margin — e.g. "0.4e-6 kg/m²/s above the wettest prior July in
 * this record". That margin is exactly what this helper adds: a categorical
 * standing against the prior same-place, same-calendar-month record, the signed
 * kg/m²/s margin to the breached extreme, and the earliest prior month that held
 * it. It is the precipitation companion to soilMoistureRecordMargin.ts and
 * oceanSeasonalRecordMargin.ts.
 *
 * It is a PURELY ARITHMETIC comparison of one observed value against the observed
 * minimum and maximum of a short same-calendar-month record. A "record" here is
 * the extreme of the supplied observations only — NOT an all-time, bias-
 * corrected, or climatological record — and the margin is a difference of two
 * monthly-mean precipitation rates in native kg/m²/s, not a probability,
 * exceedance likelihood, significance test, trend, return period, or SPI value.
 * Ranking stays within the same calendar month and the same place because
 * precipitation carries a strong seasonal cycle and a place-specific climatology,
 * so a cross-month or cross-place standing would be misleading. It never infers
 * drought or flood category, runoff, water-balance closure, cause, or any future
 * value.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline` (the same audited machinery behind
 * `describePrecipitationPercentile`); this helper adds only the standing and
 * margin on top of that baseline.
 *
 * Pure, render-free logic (see precipitationRecordMargin.test.ts).
 */

/** Cited GLDAS precipitation metric backing every record-standing description. */
export const PRECIPITATION_RECORD_METRIC: ClimateMetric =
  CLIMATE_METRICS["precipitation-rate"];

export const PRECIPITATION_RECORD_LIMITATIONS = [
  "Values are GLDAS monthly-mean precipitation rates in kg/m²/s, a land-model product, not a rain-gauge or radar measurement.",
  'A "record" is the extreme of a short supplied set of prior same-calendar-month observations for the same place — not an all-time high or low, and not a climate normal.',
  "Standing is restricted to the same calendar month and the same place because precipitation carries a strong seasonal cycle and a place-specific climatology; a cross-month or cross-place standing would be misleading.",
  "The record margin is a plain difference of two monthly-mean rates (target minus the prior extreme) in native kg/m²/s; it is not a probability, exceedance likelihood, significance test, trend, return period, or SPI value.",
  "The standing is of the monthly-mean rate. Because a calendar month has the same length across years apart from leap-year Februaries, this is all but identical to a standing in accumulated depth (rate × seconds in month).",
  "A short record understates the true range of same-month values, so an apparent new record may simply reflect years the record does not contain; it never infers drought or flood category, runoff, water-balance closure, cause, or any future value.",
] as const;

/** Record standing mirrors the underlying same-calendar-month baseline. */
export type PrecipitationRecordStatus = SeasonalBaselineStatus;

/**
 * The target's categorical position against the prior same-month record.
 * - `wettest-in-record`      — strictly above the prior same-month maximum
 * - `ties-wettest-in-record` — equals the prior maximum (record has spread)
 * - `driest-in-record`       — strictly below the prior same-month minimum
 * - `ties-driest-in-record`  — equals the prior minimum (record has spread)
 * - `ties-flat-record`       — the prior record has no spread and the target
 *                              equals it (both extremes at once)
 * - `within-record-range`    — strictly between the prior minimum and maximum
 */
export type PrecipitationRecordStanding =
  | "wettest-in-record"
  | "ties-wettest-in-record"
  | "driest-in-record"
  | "ties-driest-in-record"
  | "ties-flat-record"
  | "within-record-range";

export interface PrecipitationRecordMargin {
  kind: "precipitation-same-month-record-standing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "record-standing-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: PrecipitationRecordStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Native unit of every value and margin below (kg/m²/s), echoed from metric. */
  unit: string;
  /** Prior same-calendar-month observations the target was compared against. */
  sampleCount: number;
  /** Observed target precipitation rate (kg/m²/s), echoed for audit. */
  targetValue: number | null;
  /** Wettest prior same-month value in the record, or null pre-baseline. */
  priorWettestValue: number | null;
  /** Earliest prior month that held the wet record (ties resolve to earliest). */
  priorWettestMonth: YearMonth | null;
  /** Driest prior same-month value in the record, or null pre-baseline. */
  priorDriestValue: number | null;
  /** Earliest prior month that held the dry record (ties resolve to earliest). */
  priorDriestMonth: YearMonth | null;
  standing: PrecipitationRecordStanding | null;
  /**
   * `priorWettestValue - targetValue` in kg/m²/s: how far the target sits *below*
   * the prior wet record. Positive within the range, zero when it ties the wet
   * record, negative when it sets a new wet record. Null pre-baseline.
   */
  marginBelowWettest: number | null;
  /**
   * `targetValue - priorDriestValue` in kg/m²/s: how far the target sits *above*
   * the prior dry record. Positive within the range, zero when it ties the dry
   * record, negative when it sets a new dry record. Null pre-baseline.
   */
  marginAboveDriest: number | null;
  /**
   * Non-negative kg/m²/s by which the target beats the breached extreme, defined
   * only for a strict new record (`wettest-in-record` → target − priorWettest;
   * `driest-in-record` → priorDriest − target). Null for ties and for values
   * within the range, where nothing was breached.
   */
  recordExceedanceMargin: number | null;
  /** Short machine-readable reason when no standing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Place one supplied monthly precipitation observation against the prior same-
 * calendar-month record at the same place and report its standing and margin.
 *
 * The candidate list and the target are forced onto the precipitation-rate
 * metric so a non-precipitation layer cannot be ranked through this helper. A
 * standing is reported only when the delegated baseline comparison is itself
 * `available` — so a not-yet-published, low-coverage, or under-sampled record
 * never yields a fabricated record claim. A `null` standing therefore means "no
 * standing can be stated", never "unremarkable".
 */
export function describePrecipitationRecordMargin(
  targetObservation: PrecipitationObservation,
  priorSameMonthObservations: readonly PrecipitationObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): PrecipitationRecordMargin {
  const baseline = compareMonthlyClimateToSeasonalBaseline(
    { ...targetObservation, metricId: "precipitation-rate" },
    priorSameMonthObservations.map((observation) => ({
      ...observation,
      metricId: "precipitation-rate" as const,
    })),
    availableThrough,
    options
  );

  const base = {
    kind: "precipitation-same-month-record-standing",
    isForecast: false,
    isTrend: false,
    claimScope:
      "record-standing-within-supplied-same-place-same-calendar-month-record-only",
    metric: PRECIPITATION_RECORD_METRIC,
    status: baseline.status,
    baseline,
    dataMonth: baseline.target.dataMonth,
    calendarMonth: baseline.bounds.calendarMonth,
    unit: baseline.anomalyUnit,
    sampleCount: baseline.samples.length,
    limitations: PRECIPITATION_RECORD_LIMITATIONS,
  } as const;

  const unavailable = {
    ...base,
    targetValue: null,
    priorWettestValue: null,
    priorWettestMonth: null,
    priorDriestValue: null,
    priorDriestMonth: null,
    standing: null,
    marginBelowWettest: null,
    marginAboveDriest: null,
    recordExceedanceMargin: null,
  };

  // A record standing is only meaningful once the audited baseline is available:
  // the target is a published, usable observation and the record clears the
  // sample and coverage floors. Every other status passes through with a null
  // standing.
  if (
    baseline.status !== "available" ||
    baseline.target.observedValue === null ||
    baseline.baseline.min === null ||
    baseline.baseline.max === null
  ) {
    return {
      ...unavailable,
      reason: baseline.reason ?? "record-standing-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const priorWettest = baseline.baseline.max;
  const priorDriest = baseline.baseline.min;
  const marginBelowWettest = priorWettest - target;
  const marginAboveDriest = target - priorDriest;

  let standing: PrecipitationRecordStanding;
  let recordExceedanceMargin: number | null = null;
  if (target > priorWettest) {
    standing = "wettest-in-record";
    recordExceedanceMargin = target - priorWettest;
  } else if (target < priorDriest) {
    standing = "driest-in-record";
    recordExceedanceMargin = priorDriest - target;
  } else if (priorWettest === priorDriest) {
    // The prior record has no spread; equalling it ties both extremes at once.
    standing = "ties-flat-record";
  } else if (target === priorWettest) {
    standing = "ties-wettest-in-record";
  } else if (target === priorDriest) {
    standing = "ties-driest-in-record";
  } else {
    standing = "within-record-range";
  }

  return {
    ...base,
    targetValue: target,
    priorWettestValue: priorWettest,
    priorWettestMonth: earliestMonthWithValue(baseline, priorWettest),
    priorDriestValue: priorDriest,
    priorDriestMonth: earliestMonthWithValue(baseline, priorDriest),
    standing,
    marginBelowWettest,
    marginAboveDriest,
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
  baseline: SeasonalBaselineComparison,
  value: number
): YearMonth | null {
  for (const sample of baseline.samples) {
    if (sample.value === value) return sample.month;
  }
  return null;
}
