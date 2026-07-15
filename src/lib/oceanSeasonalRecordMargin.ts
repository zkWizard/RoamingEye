import { formatYm, MONTH_NAMES, type YearMonth } from "./timeline";
import {
  compareSstToSeasonalBaseline,
  type OceanSeasonalBaselineComparison,
  type OceanSeasonalBaselineOptions,
  type OceanSeasonalBaselineStatus,
  type UsableSstFootprint,
} from "./oceanSeasonalBaseline";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";

/**
 * Same-calendar-month record standing (and margin) for a supplied monthly
 * sea-surface-temperature value.
 *
 * The standardized anomaly (`contextualizeOceanSeasonalAnomaly`) reports how
 * far a month sits from the baseline *mean* in spread units, and the empirical
 * percentile (`describeSstSeasonalPercentile`) reports the target's *rank*
 * within the record. Both stop at the edge of the observed sample: a percentile
 * saturates at "warmest/coolest in record" and, by construction, can never fall
 * outside the sampled range, so neither says *by how much* a new same-month
 * high or low actually beats the prior extreme. That margin — e.g. "0.4 °C
 * above the warmest prior August in this record" — is the plainest thing a
 * reader asks when a value tops the chart, and it is exactly what this helper
 * adds: a categorical standing against the prior same-footprint, same-calendar-
 * month record, the signed °C margin to the breached extreme, and the earliest
 * prior month that held it.
 *
 * It is a PURELY ARITHMETIC comparison of one observed value against the
 * observed minimum and maximum of a short same-calendar-month, same-footprint
 * record (open water vs. land-mixed coastal is never mixed). A "record" here is
 * the extreme of the supplied observations only — NOT an all-time, bias-
 * corrected, or climatological record — and the margin is a difference of two
 * monthly means in the source unit, not a probability, exceedance likelihood,
 * significance test, trend, or return period. It never infers marine-biological
 * abundance, habitat, ecosystem condition, marine-heatwave status, hazard,
 * causation, or any future ocean temperature. Provenance is retained.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, footprint separation, and the minimum-sample floor are delegated
 * to `compareSstToSeasonalBaseline`; this helper adds only the standing and
 * margin on top of that audited baseline.
 *
 * Pure, render-free logic (see oceanSeasonalRecordMargin.test.ts).
 */

export const SST_SEASONAL_RECORD_LIMITATIONS = [
  "Values are supplied MODIS/Aqua sea-surface-temperature observations in the source unit (°C), not a bias-corrected or climatological record.",
  'A "record" is the extreme of a short supplied set of prior same-calendar-month, same-footprint observations — not an all-time high or low, and not a climate normal.',
  "Standing is restricted to the same calendar month and the same surface footprint (open water vs. land-mixed coastal is never mixed) because SST carries a strong seasonal cycle and differs by footprint.",
  "The record margin is a plain difference of two monthly means (target minus the prior extreme) in the source unit; it is not a probability, exceedance likelihood, significance test, trend, or return period.",
  "A short record understates the true range of same-month values, so an apparent new record may simply reflect years the record does not contain; it never infers marine-biological abundance, habitat, ecosystem condition, marine-heatwave status, hazard, cause, or any future value.",
] as const;

/** Record standing mirrors the underlying same-calendar-month SST baseline. */
export type SstSeasonalRecordStatus = OceanSeasonalBaselineStatus;

/**
 * The target's categorical position against the prior same-month record.
 * - `warmest-in-record`      — strictly above the prior same-month maximum
 * - `ties-warmest-in-record` — equals the prior maximum (record has spread)
 * - `coolest-in-record`      — strictly below the prior same-month minimum
 * - `ties-coolest-in-record` — equals the prior minimum (record has spread)
 * - `ties-flat-record`       — the prior record has no spread and the target
 *                              equals it (both extremes at once)
 * - `within-record-range`    — strictly between the prior minimum and maximum
 */
export type SstSeasonalRecordStanding =
  | "warmest-in-record"
  | "ties-warmest-in-record"
  | "coolest-in-record"
  | "ties-coolest-in-record"
  | "ties-flat-record"
  | "within-record-range";

export interface SstSeasonalRecordMargin {
  kind: "sea-surface-temperature-same-month-record-standing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "record-standing-within-supplied-same-footprint-same-calendar-month-record-only";
  metric: OceanSeasonalBaselineComparison["metric"];
  status: SstSeasonalRecordStatus;
  /** Full audited same-calendar-month SST baseline, retained for provenance. */
  baseline: OceanSeasonalBaselineComparison;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Footprint the baseline was restricted to (never mixed across footprints). */
  footprint: UsableSstFootprint | null;
  /** Native unit of every value and margin below (°C), echoed from the metric. */
  unit: string;
  /** Prior same-calendar-month observations the target was compared against. */
  sampleCount: number;
  /** Observed target SST value (°C), echoed for audit. */
  targetValue: number | null;
  /** Warmest prior same-month value in the record, or null pre-baseline. */
  priorWarmestValue: number | null;
  /** Earliest prior month that held the warm record (ties resolve to earliest). */
  priorWarmestMonth: YearMonth | null;
  /** Coolest prior same-month value in the record, or null pre-baseline. */
  priorCoolestValue: number | null;
  /** Earliest prior month that held the cool record (ties resolve to earliest). */
  priorCoolestMonth: YearMonth | null;
  standing: SstSeasonalRecordStanding | null;
  /**
   * `priorWarmestValue - targetValue` in °C: how far the target sits *below*
   * the prior warm record. Positive within the range, zero when it ties the
   * warm record, negative when it sets a new warm record. Null pre-baseline.
   */
  marginBelowWarmest: number | null;
  /**
   * `targetValue - priorCoolestValue` in °C: how far the target sits *above*
   * the prior cool record. Positive within the range, zero when it ties the
   * cool record, negative when it sets a new cool record. Null pre-baseline.
   */
  marginAboveCoolest: number | null;
  /**
   * Non-negative °C by which the target beats the breached extreme, defined
   * only for a strict new record (`warmest-in-record` → target − priorWarmest;
   * `coolest-in-record` → priorCoolest − target). Null for ties and for values
   * within the range, where nothing was breached.
   */
  recordExceedanceMargin: number | null;
  /** Short machine-readable reason when no standing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Place one supplied monthly SST observation against the prior same-calendar-
 * month, same-footprint record and report its standing and margin.
 *
 * A standing is reported only when the delegated baseline comparison is itself
 * `available` — so a land, missing, low-coverage, or under-sampled record never
 * yields a fabricated record claim. A `null` standing therefore means "no
 * standing can be stated", never "unremarkable".
 */
export function summarizeSstSeasonalRecordMargin(
  targetObservation: SeaSurfaceTemperatureObservation,
  baselineCandidates: readonly SeaSurfaceTemperatureObservation[],
  options: OceanSeasonalBaselineOptions = {}
): SstSeasonalRecordMargin {
  const baseline = compareSstToSeasonalBaseline(
    targetObservation,
    baselineCandidates,
    options
  );

  const base = {
    kind: "sea-surface-temperature-same-month-record-standing",
    isForecast: false,
    isTrend: false,
    claimScope:
      "record-standing-within-supplied-same-footprint-same-calendar-month-record-only",
    metric: baseline.metric,
    status: baseline.status,
    baseline,
    dataMonth: baseline.target.dataMonth,
    calendarMonth: baseline.bounds.calendarMonth,
    footprint: baseline.bounds.footprint,
    unit: baseline.anomalyUnit,
    sampleCount: baseline.samples.length,
    limitations: SST_SEASONAL_RECORD_LIMITATIONS,
  } as const;

  const unavailable = {
    ...base,
    targetValue: null,
    priorWarmestValue: null,
    priorWarmestMonth: null,
    priorCoolestValue: null,
    priorCoolestMonth: null,
    standing: null,
    marginBelowWarmest: null,
    marginAboveCoolest: null,
    recordExceedanceMargin: null,
  };

  // A record standing is only meaningful once the audited baseline is available:
  // the target is a published, usable, on-footprint observation and the record
  // clears the sample and coverage floors. Every other status passes through
  // with a null standing.
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
  const priorCoolest = baseline.baseline.min;
  const marginBelowWarmest = priorWarmest - target;
  const marginAboveCoolest = target - priorCoolest;

  let standing: SstSeasonalRecordStanding;
  let recordExceedanceMargin: number | null = null;
  if (target > priorWarmest) {
    standing = "warmest-in-record";
    recordExceedanceMargin = target - priorWarmest;
  } else if (target < priorCoolest) {
    standing = "coolest-in-record";
    recordExceedanceMargin = priorCoolest - target;
  } else if (priorWarmest === priorCoolest) {
    // The prior record has no spread; equalling it ties both extremes at once.
    standing = "ties-flat-record";
  } else if (target === priorWarmest) {
    standing = "ties-warmest-in-record";
  } else if (target === priorCoolest) {
    standing = "ties-coolest-in-record";
  } else {
    standing = "within-record-range";
  }

  return {
    ...base,
    targetValue: target,
    priorWarmestValue: priorWarmest,
    priorWarmestMonth: earliestMonthWithValue(baseline, priorWarmest),
    priorCoolestValue: priorCoolest,
    priorCoolestMonth: earliestMonthWithValue(baseline, priorCoolest),
    standing,
    marginBelowWarmest,
    marginAboveCoolest,
    recordExceedanceMargin,
    reason: null,
  };
}

/**
 * The earliest retained baseline month whose value equals `value`. Samples are
 * already sorted oldest-to-newest, so the first exact match is the earliest
 * holder — matching the tie convention used elsewhere in the ocean series
 * helpers. Returns null if no sample matches (never expected for min/max drawn
 * from the same samples, but kept honest rather than asserting).
 */
function earliestMonthWithValue(
  baseline: OceanSeasonalBaselineComparison,
  value: number
): YearMonth | null {
  for (const sample of baseline.samples) {
    if (sample.value === value) return sample.month;
  }
  return null;
}

const FOOTPRINT_PHRASES: Record<UsableSstFootprint, string> = {
  water: "open-water",
  "land-mixed-coastal": "coastal (land-mixed)",
};

/**
 * A compact, honest one-line readout of the SST same-month record standing,
 * matching the place panel's cited-readout style. It states the standing, the
 * °C margin to the breached or nearest record extreme, the prior month that
 * held it, the footprint the baseline was built on, and the number of same-
 * calendar-month years. Non-`available` results are reported plainly rather
 * than dressed up as a record, and it never infers marine biology, ecosystem
 * condition, marine-heatwave status, hazard, causation, or any forecast.
 */
export function formatSstSeasonalRecordMargin(
  result: SstSeasonalRecordMargin
): string {
  const source = result.metric.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is a record within a short observed record, not an all-time or climatological record, significance test, marine-biology, ecosystem, hazard, or forecast claim.`;

  const month =
    isYearMonth(result.dataMonth) && result.calendarMonth !== null
      ? formatYm(result.dataMonth)
      : "an invalid month";
  const lead = `Sea-surface-temperature same-month record standing for ${month}:`;

  if (
    result.status !== "available" ||
    result.standing === null ||
    result.footprint === null
  ) {
    return `${lead} no record standing is reported (${result.reason ?? "unavailable"}). ${provenance}`;
  }

  const footprint = FOOTPRINT_PHRASES[result.footprint];
  const calendarMonthName =
    result.calendarMonth !== null
      ? MONTH_NAMES[result.calendarMonth - 1]
      : "the same calendar month";
  const unit = result.unit;
  const years =
    result.sampleCount === 1
      ? "1 same-calendar-month year"
      : `${result.sampleCount} same-calendar-month years`;

  const position = describeStanding(
    result,
    result.standing,
    footprint,
    calendarMonthName,
    unit
  );

  return `${lead} ${position}, across ${years} of prior ${calendarMonthName} ${footprint} SST. ${provenance}`;
}

function describeStanding(
  result: SstSeasonalRecordMargin,
  standing: SstSeasonalRecordStanding,
  footprint: string,
  calendarMonthName: string,
  unit: string
): string {
  const exceedance =
    result.recordExceedanceMargin !== null
      ? roundTo(result.recordExceedanceMargin, 2)
      : null;

  switch (standing) {
    case "warmest-in-record":
      return `warmest ${footprint} ${calendarMonthName} in the record — ${exceedance}${unit} above the prior warmest (${holderPhrase(result.priorWarmestMonth, result.priorWarmestValue, unit)})`;
    case "coolest-in-record":
      return `coolest ${footprint} ${calendarMonthName} in the record — ${exceedance}${unit} below the prior coolest (${holderPhrase(result.priorCoolestMonth, result.priorCoolestValue, unit)})`;
    case "ties-warmest-in-record":
      return `tied for warmest ${footprint} ${calendarMonthName} in the record (${holderPhrase(result.priorWarmestMonth, result.priorWarmestValue, unit)})`;
    case "ties-coolest-in-record":
      return `tied for coolest ${footprint} ${calendarMonthName} in the record (${holderPhrase(result.priorCoolestMonth, result.priorCoolestValue, unit)})`;
    case "ties-flat-record":
      return `equal to every prior ${footprint} ${calendarMonthName} in the record (a flat ${roundTo(result.targetValue as number, 2)}${unit})`;
    case "within-record-range": {
      const below = roundTo(result.marginBelowWarmest as number, 2);
      const above = roundTo(result.marginAboveCoolest as number, 2);
      return `within the observed same-month range — ${below}${unit} below the warmest (${holderPhrase(result.priorWarmestMonth, result.priorWarmestValue, unit)}) and ${above}${unit} above the coolest (${holderPhrase(result.priorCoolestMonth, result.priorCoolestValue, unit)})`;
    }
  }
}

function holderPhrase(
  month: YearMonth | null,
  value: number | null,
  unit: string
): string {
  const when = month !== null && isYearMonth(month) ? formatYm(month) : "n/a";
  const what = value !== null ? `${roundTo(value, 2)}${unit}` : "n/a";
  return `${when}, ${what}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
