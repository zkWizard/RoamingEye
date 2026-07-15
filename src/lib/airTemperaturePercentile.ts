import {
  CLIMATE_METRICS,
  type ClimateMetric,
  type MonthlyClimateObservation,
} from "./climate";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
  type SeasonalBaselineOptions,
  type SeasonalBaselineStatus,
} from "./seasonalBaseline";
import type { YearMonth } from "./timeline";

/**
 * Empirical percentile-of-record for a supplied monthly 2 m air-temperature value.
 *
 * The air-temperature layer renders MERRA-2 near-surface (2 m) air temperature in
 * kelvin. The plainest question a reader asks of one reading — *is this month warm
 * or cool for here?* — cannot be answered from the raw kelvin value, because
 * near-surface air temperature carries a strong seasonal cycle and varies with
 * latitude, elevation, and continentality, so a number is only meaningful against
 * other numbers for the *same place and same calendar month*. This helper ranks
 * the target within its own place-and-season history and reports where it falls as
 * a non-exceedance percentile plus the raw counts behind it.
 *
 * It is a NON-PARAMETRIC companion to the parametric anomaly carried by
 * seasonalBaseline.ts (see also `narrateStandardizedAnomaly`): a rank is robust to
 * a short or skewed record and makes no normality assumption, and — unlike a
 * standardized anomaly, which is undefined when the baseline spread is zero — a
 * rank is defined whenever the audited baseline is itself available. All sample
 * gathering, deduplication, coverage filtering, target-year exclusion, and the
 * minimum-sample floor are delegated to `compareMonthlyClimateToSeasonalBaseline`
 * (which never borrows adjacent months or fills missing years). This helper adds
 * only the distribution-free rank on top of that audited baseline.
 *
 * It is NOT a climatological normal, an operational temperature percentile, a
 * significance test, a heat- or cold-wave classification, or a probability of any
 * future condition, and an empirical percentile from a limited record can never
 * fall outside the sampled range. It never diagnoses hazard, attributes cause, or
 * forecasts any future value. Provenance is retained.
 *
 * Pure, render-free logic (see airTemperaturePercentile.test.ts).
 */

/** Cited MERRA-2 air-temperature metric backing every percentile description. */
export const AIR_TEMPERATURE_PERCENTILE_METRIC: ClimateMetric =
  CLIMATE_METRICS["air-temperature-2m"];

export const AIR_TEMPERATURE_PERCENTILE_LIMITATIONS = [
  "Values are supplied 2 m air-temperature observations in the source unit (K), not a bias-corrected station record.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not a climatological normal, an operational temperature percentile, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same place because near-surface air temperature carries a strong seasonal cycle and varies with latitude, elevation, and continentality; a cross-month or cross-place rank would be misleading.",
  "The non-exceedance percentile uses the mid-rank convention F = (cooler + tied/2) / n; the raw cooler/tied/warmer counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never classifies a heat or cold wave, diagnoses hazard, attributes cause, or infers any future value.",
] as const;

/**
 * A supplied monthly 2 m air-temperature observation. The metric is fixed, so
 * callers cannot accidentally rank a non–air-temperature layer through this
 * helper.
 */
export type AirTemperatureObservation = Omit<
  MonthlyClimateObservation,
  "metricId"
>;

/** Percentile status mirrors the underlying same-calendar-month baseline. */
export type AirTemperaturePercentileStatus = SeasonalBaselineStatus;

export interface AirTemperaturePercentileResult {
  kind: "air-temperature-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: AirTemperaturePercentileStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months strictly cooler than the target (native K). */
  coolerRecordCount: number | null;
  /** Baseline months strictly warmer than the target. */
  warmerRecordCount: number | null;
  /** Baseline months whose value equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0-100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0-1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month is cooler (target at/below the record minimum). */
  isColdestInRecord: boolean | null;
  /** True when no baseline month is warmer (target at/above the record maximum). */
  isWarmestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly 2 m air-temperature observation within prior supplied
 * observations for the same calendar month at the same place.
 *
 * The candidate list and the target are forced onto the air-temperature metric so
 * a non–air-temperature layer cannot be ranked through this helper. All sample
 * gathering, validation, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline`; a percentile is reported only when
 * that comparison is itself `available`, so a not-yet-published, low-coverage, or
 * under-sampled record never yields a fabricated rank. A `null` percentile
 * therefore means "no rank can be stated", never "median".
 */
export function describeAirTemperaturePercentile(
  targetObservation: AirTemperatureObservation,
  priorSameMonthObservations: readonly AirTemperatureObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): AirTemperaturePercentileResult {
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
    kind: "air-temperature-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    metric: AIR_TEMPERATURE_PERCENTILE_METRIC,
    status: baseline.status,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: AIR_TEMPERATURE_PERCENTILE_LIMITATIONS,
  } as const;

  // A rank is only meaningful once the audited baseline is available: the target
  // is a published, usable observation and the record clears the sample and
  // coverage floors. Every other status passes through with a null percentile.
  if (
    baseline.status !== "available" ||
    baseline.target.observedValue === null
  ) {
    return {
      ...base,
      coolerRecordCount: null,
      warmerRecordCount: null,
      tiedRecordCount: null,
      percentileRank: null,
      exceedanceProbability: null,
      isColdestInRecord: null,
      isWarmestInRecord: null,
      reason: baseline.reason ?? "percentile-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const count = baseline.samples.length;
  let cooler = 0;
  let warmer = 0;
  let tied = 0;
  for (const sample of baseline.samples) {
    if (sample.value < target) cooler += 1;
    else if (sample.value > target) warmer += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target, splitting exact ties evenly. Symmetric to exceedance, so
  // percentileRank/100 + exceedanceProbability === 1 by construction.
  const nonExceedance = (cooler + tied / 2) / count;
  return {
    ...base,
    coolerRecordCount: cooler,
    warmerRecordCount: warmer,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (warmer + tied / 2) / count,
    isColdestInRecord: cooler === 0,
    isWarmestInRecord: warmer === 0,
    reason: null,
  };
}
