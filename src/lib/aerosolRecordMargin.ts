import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  compareAerosolToSeasonalBaseline,
  type AerosolSeasonalBaselineComparison,
  type AerosolSeasonalBaselineOptions,
  type AerosolSeasonalBaselineStatus,
} from "./aerosolSeasonalBaseline";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Same-calendar-month record standing (and margin) for a supplied monthly column
 * aerosol optical depth (AOD) observation.
 *
 * The same-month baseline (`compareAerosolToSeasonalBaseline`) reports the
 * target's anomaly and standardized anomaly against a short same-place record,
 * and the seasonal percentile reports its *rank* within that record. Neither
 * answers the plainest question a reader asks when a month tops or bottoms the
 * haze chart: *by how much did it beat the prior extreme?* A percentile, by
 * construction, saturates at "haziest/clearest in record" and can never fall
 * outside the sampled range, so it cannot state that margin — e.g. "0.06 above
 * the haziest prior March in this record". That margin is exactly what this
 * helper adds: a categorical standing against the prior same-place,
 * same-calendar-month record, the signed AOD margin to the breached extreme,
 * and the earliest prior month that held it.
 *
 * It is a PURELY ARITHMETIC comparison of one observed value against the
 * observed minimum and maximum of a short same-calendar-month record. A
 * "record" here is the extreme of the supplied observations only — NOT an
 * all-time or climatological record — and the margin is a difference of two
 * dimensionless column-AOD values, not a probability, exceedance likelihood,
 * significance test, trend, or return period. Ranking stays within the same
 * calendar month and the same place because column loading carries a strong
 * seasonal cycle (dust, biomass-burning, and haze seasons) and varies sharply
 * with location, so a cross-month or cross-place standing would be misleading.
 * It never diagnoses an air-quality event, derives a surface concentration,
 * attributes cause, or infers any future value.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareAerosolToSeasonalBaseline` (the same audited machinery behind the
 * aerosol seasonal anomaly); this helper adds only the standing and margin on
 * top of that baseline.
 *
 * Pure, render-free logic (see aerosolRecordMargin.test.ts).
 */

export const AEROSOL_RECORD_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so a value is a modelled monthly mean, not a direct pixel measurement.",
  'A "record" is the extreme of a short supplied set of prior same-calendar-month observations for the same place — not an all-time high or low, and not a climate normal.',
  "Standing is restricted to the same calendar month and the same place because column aerosol loading carries a strong seasonal cycle and varies sharply with location; a cross-month or cross-place standing would be misleading.",
  "The record margin is a plain difference of two dimensionless column-AOD values (target minus the prior extreme); it is not a probability, exceedance likelihood, significance test, trend, or return period.",
  "A short record understates the true range of same-month values, so an apparent new record may simply reflect years the record does not contain; it never diagnoses an air-quality event, attributes cause, or infers any future value.",
] as const;

/** Record standing mirrors the underlying same-calendar-month baseline. */
export type AerosolRecordStatus = AerosolSeasonalBaselineStatus;

/**
 * The target's categorical position against the prior same-month AOD record.
 * "Haziest" is the highest column loading, "clearest" the lowest.
 * - `haziest-in-record`       — strictly above the prior same-month maximum
 * - `ties-haziest-in-record`  — equals the prior maximum (record has spread)
 * - `clearest-in-record`      — strictly below the prior same-month minimum
 * - `ties-clearest-in-record` — equals the prior minimum (record has spread)
 * - `ties-flat-record`        — the prior record has no spread and the target
 *                               equals it (both extremes at once)
 * - `within-record-range`     — strictly between the prior minimum and maximum
 */
export type AerosolRecordStanding =
  | "haziest-in-record"
  | "ties-haziest-in-record"
  | "clearest-in-record"
  | "ties-clearest-in-record"
  | "ties-flat-record"
  | "within-record-range";

export interface AerosolRecordMargin {
  kind: "aerosol-same-month-record-standing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "record-standing-within-supplied-same-place-same-calendar-month-record-only";
  source: DatasetRef;
  /** Wavelength of the rendered aerosol product (nm), echoed for provenance. */
  wavelengthNm: number;
  status: AerosolRecordStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: AerosolSeasonalBaselineComparison;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Dimensionless (AOD); every value and margin below shares this unit. */
  unit: string;
  /** Prior same-calendar-month observations the target was compared against. */
  sampleCount: number;
  /** Observed target column AOD (dimensionless), echoed for audit. */
  targetValue: number | null;
  /** Haziest (highest) prior same-month value, or null pre-baseline. */
  priorHaziestValue: number | null;
  /** Earliest prior month that held the haze record (ties resolve to earliest). */
  priorHaziestMonth: YearMonth | null;
  /** Clearest (lowest) prior same-month value, or null pre-baseline. */
  priorClearestValue: number | null;
  /** Earliest prior month that held the clear record (ties resolve to earliest). */
  priorClearestMonth: YearMonth | null;
  standing: AerosolRecordStanding | null;
  /**
   * `priorHaziestValue - targetValue`: how far the target sits *below* the prior
   * haze record. Positive within the range, zero when it ties the haze record,
   * negative when it sets a new haze record. Null pre-baseline.
   */
  marginBelowHaziest: number | null;
  /**
   * `targetValue - priorClearestValue`: how far the target sits *above* the
   * prior clear record. Positive within the range, zero when it ties the clear
   * record, negative when it sets a new clear record. Null pre-baseline.
   */
  marginAboveClearest: number | null;
  /**
   * Non-negative AOD by which the target beats the breached extreme, defined
   * only for a strict new record (`haziest-in-record` → target − priorHaziest;
   * `clearest-in-record` → priorClearest − target). Null for ties and for values
   * within the range, where nothing was breached.
   */
  recordExceedanceMargin: number | null;
  /** Short machine-readable reason when no standing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Place one supplied monthly column-AOD observation against the prior
 * same-calendar-month record at the same place and report its standing and
 * margin.
 *
 * A standing is reported only when the delegated baseline comparison is itself
 * `available` — so a not-yet-published, low-coverage, or under-sampled record
 * never yields a fabricated record claim. A `null` standing therefore means "no
 * standing can be stated", never "unremarkable".
 */
export function describeAerosolRecordMargin(
  targetObservation: AerosolObservation,
  priorSameMonthObservations: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolSeasonalBaselineOptions = {}
): AerosolRecordMargin {
  const baseline = compareAerosolToSeasonalBaseline(
    targetObservation,
    priorSameMonthObservations,
    availableThrough,
    options
  );

  const base = {
    kind: "aerosol-same-month-record-standing",
    isForecast: false,
    isTrend: false,
    claimScope:
      "record-standing-within-supplied-same-place-same-calendar-month-record-only",
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    status: baseline.status,
    baseline,
    dataMonth: baseline.target.dataMonth,
    calendarMonth: baseline.bounds.calendarMonth,
    unit: AEROSOL_UNIT,
    sampleCount: baseline.samples.length,
    limitations: AEROSOL_RECORD_LIMITATIONS,
  } as const;

  const unavailable = {
    ...base,
    targetValue: null,
    priorHaziestValue: null,
    priorHaziestMonth: null,
    priorClearestValue: null,
    priorClearestMonth: null,
    standing: null,
    marginBelowHaziest: null,
    marginAboveClearest: null,
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
  const priorHaziest = baseline.baseline.max;
  const priorClearest = baseline.baseline.min;
  const marginBelowHaziest = priorHaziest - target;
  const marginAboveClearest = target - priorClearest;

  let standing: AerosolRecordStanding;
  let recordExceedanceMargin: number | null = null;
  if (target > priorHaziest) {
    standing = "haziest-in-record";
    recordExceedanceMargin = target - priorHaziest;
  } else if (target < priorClearest) {
    standing = "clearest-in-record";
    recordExceedanceMargin = priorClearest - target;
  } else if (priorHaziest === priorClearest) {
    // The prior record has no spread; equalling it ties both extremes at once.
    standing = "ties-flat-record";
  } else if (target === priorHaziest) {
    standing = "ties-haziest-in-record";
  } else if (target === priorClearest) {
    standing = "ties-clearest-in-record";
  } else {
    standing = "within-record-range";
  }

  return {
    ...base,
    targetValue: target,
    priorHaziestValue: priorHaziest,
    priorHaziestMonth: earliestMonthWithValue(baseline, priorHaziest),
    priorClearestValue: priorClearest,
    priorClearestMonth: earliestMonthWithValue(baseline, priorClearest),
    standing,
    marginBelowHaziest,
    marginAboveClearest,
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
  baseline: AerosolSeasonalBaselineComparison,
  value: number
): YearMonth | null {
  for (const sample of baseline.samples) {
    if (sample.value === value) return sample.month;
  }
  return null;
}
