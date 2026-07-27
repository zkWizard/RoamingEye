import { CLIMATE_METRICS, type ClimateMetric } from "./climate";
import type { AirTemperatureObservation } from "./airTemperaturePercentile";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
  type SeasonalBaselineOptions,
  type SeasonalBaselineStatus,
} from "./seasonalBaseline";
import type { YearMonth } from "./timeline";

/**
 * Same-calendar-month record standing (and margin) for a supplied monthly 2 m
 * air-temperature value.
 *
 * The empirical percentile (`describeAirTemperaturePercentile`) reports the
 * target's *rank* within its same-place, same-calendar-month record, and the
 * seasonal cycle (`describeAirTemperatureSeasonalCycle`) describes the shape of
 * the mean annual march. Neither answers the plainest question a reader asks
 * when a month tops or bottoms the chart: *by how much did it beat the prior
 * extreme?* A percentile, by construction, saturates at "warmest/coldest in
 * record" and can never fall outside the sampled range, so it cannot state that
 * margin — e.g. "0.4 K above the warmest prior July in this record". That margin
 * is exactly what this helper adds: a categorical standing against the prior
 * same-place, same-calendar-month record, the signed kelvin margin to the
 * breached extreme, and the earliest prior month that held it.
 *
 * It is a PURELY ARITHMETIC comparison of one observed value against the
 * observed minimum and maximum of a short same-calendar-month record. A
 * "record" here is the extreme of the supplied observations only — NOT an
 * all-time, bias-corrected, or climatological record — and the margin is a
 * difference of two monthly 2 m air-temperature values in native kelvin, not a
 * probability, exceedance likelihood, significance test, trend, or return
 * period. Ranking stays within the same calendar month and the same place
 * because near-surface air temperature carries a strong seasonal cycle and
 * varies with latitude, elevation, and continentality, so a cross-month or
 * cross-place standing would be misleading. It never classifies a heat or cold
 * wave, diagnoses hazard, attributes cause, or infers any future value.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline` (the same audited machinery behind
 * `describeAirTemperaturePercentile`); this helper adds only the standing and
 * margin on top of that baseline.
 *
 * Pure, render-free logic (see airTemperatureRecordMargin.test.ts).
 */

/** Cited MERRA-2 air-temperature metric backing every record-standing description. */
export const AIR_TEMPERATURE_RECORD_METRIC: ClimateMetric =
  CLIMATE_METRICS["air-temperature-2m"];

export const AIR_TEMPERATURE_RECORD_LIMITATIONS = [
  "Values are supplied 2 m air-temperature observations in the source unit (K), not a bias-corrected station record.",
  'A "record" is the extreme of a short supplied set of prior same-calendar-month observations for the same place — not an all-time high or low, and not a climate normal.',
  "Standing is restricted to the same calendar month and the same place because near-surface air temperature carries a strong seasonal cycle and varies with latitude, elevation, and continentality; a cross-month or cross-place standing would be misleading.",
  "The record margin is a plain difference of two monthly air-temperature values (target minus the prior extreme) in native kelvin; it is not a probability, exceedance likelihood, significance test, trend, or return period.",
  "A short record understates the true range of same-month values, so an apparent new record may simply reflect years the record does not contain; it never classifies a heat or cold wave, diagnoses hazard, attributes cause, or infers any future value.",
] as const;

/** Record standing mirrors the underlying same-calendar-month baseline. */
export type AirTemperatureRecordStatus = SeasonalBaselineStatus;

/**
 * The target's categorical position against the prior same-month record.
 * - `warmest-in-record`      — strictly above the prior same-month maximum
 * - `ties-warmest-in-record` — equals the prior maximum (record has spread)
 * - `coldest-in-record`      — strictly below the prior same-month minimum
 * - `ties-coldest-in-record` — equals the prior minimum (record has spread)
 * - `ties-flat-record`       — the prior record has no spread and the target
 *                              equals it (both extremes at once)
 * - `within-record-range`    — strictly between the prior minimum and maximum
 */
export type AirTemperatureRecordStanding =
  | "warmest-in-record"
  | "ties-warmest-in-record"
  | "coldest-in-record"
  | "ties-coldest-in-record"
  | "ties-flat-record"
  | "within-record-range";

export interface AirTemperatureRecordMargin {
  kind: "air-temperature-same-month-record-standing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "record-standing-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: AirTemperatureRecordStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Native unit of every value and margin below (K), echoed from metric. */
  unit: string;
  /** Prior same-calendar-month observations the target was compared against. */
  sampleCount: number;
  /** Observed target air-temperature value (K), echoed for audit. */
  targetValue: number | null;
  /** Warmest prior same-month value in the record, or null pre-baseline. */
  priorWarmestValue: number | null;
  /** Earliest prior month that held the warm record (ties resolve to earliest). */
  priorWarmestMonth: YearMonth | null;
  /** Coldest prior same-month value in the record, or null pre-baseline. */
  priorColdestValue: number | null;
  /** Earliest prior month that held the cold record (ties resolve to earliest). */
  priorColdestMonth: YearMonth | null;
  standing: AirTemperatureRecordStanding | null;
  /**
   * `priorWarmestValue - targetValue` in K: how far the target sits *below* the
   * prior warm record. Positive within the range, zero when it ties the warm
   * record, negative when it sets a new warm record. Null pre-baseline.
   */
  marginBelowWarmest: number | null;
  /**
   * `targetValue - priorColdestValue` in K: how far the target sits *above* the
   * prior cold record. Positive within the range, zero when it ties the cold
   * record, negative when it sets a new cold record. Null pre-baseline.
   */
  marginAboveColdest: number | null;
  /**
   * Non-negative kelvin by which the target beats the breached extreme, defined
   * only for a strict new record (`warmest-in-record` → target − priorWarmest;
   * `coldest-in-record` → priorColdest − target). Null for ties and for values
   * within the range, where nothing was breached.
   */
  recordExceedanceMargin: number | null;
  /** Short machine-readable reason when no standing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Place one supplied monthly 2 m air-temperature observation against the prior
 * same-calendar-month record at the same place and report its standing and
 * margin.
 *
 * The candidate list and the target are forced onto the air-temperature metric
 * so a non–air-temperature layer cannot be ranked through this helper. A
 * standing is reported only when the delegated baseline comparison is itself
 * `available` — so a not-yet-published, low-coverage, or under-sampled record
 * never yields a fabricated record claim. A `null` standing therefore means "no
 * standing can be stated", never "unremarkable".
 */
export function describeAirTemperatureRecordMargin(
  targetObservation: AirTemperatureObservation,
  priorSameMonthObservations: readonly AirTemperatureObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): AirTemperatureRecordMargin {
  const baseline = compareMonthlyClimateToSeasonalBaseline(
    { ...targetObservation, metricId: "air-temperature-2m" },
    priorSameMonthObservations.map((observation) => ({
      ...observation,
      metricId: "air-temperature-2m" as const,
    })),
    availableThrough,
    options
  );

  const base = {
    kind: "air-temperature-same-month-record-standing",
    isForecast: false,
    isTrend: false,
    claimScope:
      "record-standing-within-supplied-same-place-same-calendar-month-record-only",
    metric: AIR_TEMPERATURE_RECORD_METRIC,
    status: baseline.status,
    baseline,
    dataMonth: baseline.target.dataMonth,
    calendarMonth: baseline.bounds.calendarMonth,
    unit: baseline.anomalyUnit,
    sampleCount: baseline.samples.length,
    limitations: AIR_TEMPERATURE_RECORD_LIMITATIONS,
  } as const;

  const unavailable = {
    ...base,
    targetValue: null,
    priorWarmestValue: null,
    priorWarmestMonth: null,
    priorColdestValue: null,
    priorColdestMonth: null,
    standing: null,
    marginBelowWarmest: null,
    marginAboveColdest: null,
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
  const priorWarmest = baseline.baseline.max;
  const priorColdest = baseline.baseline.min;
  const marginBelowWarmest = priorWarmest - target;
  const marginAboveColdest = target - priorColdest;

  let standing: AirTemperatureRecordStanding;
  let recordExceedanceMargin: number | null = null;
  if (target > priorWarmest) {
    standing = "warmest-in-record";
    recordExceedanceMargin = target - priorWarmest;
  } else if (target < priorColdest) {
    standing = "coldest-in-record";
    recordExceedanceMargin = priorColdest - target;
  } else if (priorWarmest === priorColdest) {
    // The prior record has no spread; equalling it ties both extremes at once.
    standing = "ties-flat-record";
  } else if (target === priorWarmest) {
    standing = "ties-warmest-in-record";
  } else if (target === priorColdest) {
    standing = "ties-coldest-in-record";
  } else {
    standing = "within-record-range";
  }

  return {
    ...base,
    targetValue: target,
    priorWarmestValue: priorWarmest,
    priorWarmestMonth: earliestMonthWithValue(baseline, priorWarmest),
    priorColdestValue: priorColdest,
    priorColdestMonth: earliestMonthWithValue(baseline, priorColdest),
    standing,
    marginBelowWarmest,
    marginAboveColdest,
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
