import type { NdviMonthlyObservation } from "./phenology";
import {
  compareMonthlyNdviToSeasonalBaseline,
  type NdviMetric,
  NDVI_METRIC,
  type NdviSeasonalBaselineComparison,
  type NdviSeasonalBaselineOptions,
  type NdviSeasonalBaselineStatus,
} from "./phenologyBaseline";
import type { YearMonth } from "./timeline";

/**
 * Empirical percentile-of-record for a supplied monthly NDVI observation.
 *
 * The plainest greenness question a reader asks — *is this month greener or
 * less green than usual for here?* — cannot be answered from the raw MOD13A3
 * NDVI value, because a unitless vegetation index carries a strong seasonal
 * cycle and its typical level varies enormously by land cover, so a number is
 * only meaningful against other numbers for the *same place and same calendar
 * month*. This helper answers that question by ranking one supplied target
 * observation against prior supplied observations for the same calendar month
 * at the same place, and reporting where the target falls as a non-exceedance
 * percentile plus the raw counts behind it.
 *
 * All sample gathering, validation, year-deduplication, publication and
 * coverage filtering, target-year exclusion, and the minimum-sample floor are
 * delegated to the audited same-calendar-month machinery in
 * {@link compareMonthlyNdviToSeasonalBaseline}; a percentile is reported only
 * when that comparison is itself `available`, so a not-yet-published,
 * low-coverage, or under-sampled record never yields a fabricated rank. A
 * `null` percentile therefore means "no rank can be stated", never "median".
 *
 * This is a descriptive, non-parametric companion to the parametric
 * standardized departure in phenologyStandardizedDeparture.ts: it is robust to
 * a short or skewed record and makes no distributional assumption, but an
 * empirical percentile from a limited record is uncertain and cannot fall
 * outside the sampled range. It is NOT a probability of any future condition, a
 * climatological normal, a land-surface-phenology stage, or a productivity,
 * biomass, habitat-quality, ecosystem-health, or causal claim. NDVI is a
 * unitless vegetation-index observation; nothing here infers plant phenology or
 * causes. Provenance from the underlying comparison is retained.
 *
 * Pure, render-free logic (see phenologySeasonalPercentile.test.ts).
 */

/** Cited MOD13A3 NDVI metric backing every percentile description. */
export const NDVI_PERCENTILE_METRIC: NdviMetric = NDVI_METRIC;

export const NDVI_SEASONAL_PERCENTILE_LIMITATIONS = [
  "Values are MOD13A3 NDVI, a unitless vegetation index, not a direct measurement of vegetation amount, biomass, or condition.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not a climatological normal or a probability of future greenness.",
  "Ranking is restricted to the same calendar month and the same place because NDVI carries a strong seasonal cycle and varies with land cover; a cross-month or cross-place rank would be misleading.",
  "The non-exceedance percentile uses the mid-rank convention F = (less-green + tied/2) / n; the raw less-green/tied/greener counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never infers plant phenophase, green-up or senescence timing, productivity, biomass, habitat quality, ecosystem health, cause, or any future value.",
] as const;

/** Percentile status mirrors the underlying same-calendar-month baseline. */
export type NdviSeasonalPercentileStatus = NdviSeasonalBaselineStatus;

export interface NdviSeasonalPercentileResult {
  kind: "ndvi-seasonal-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  metric: NdviMetric;
  status: NdviSeasonalPercentileStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: NdviSeasonalBaselineComparison;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months with strictly lower NDVI than the target. */
  lessGreenRecordCount: number | null;
  /** Baseline months with strictly higher NDVI than the target. */
  greenerRecordCount: number | null;
  /** Baseline months whose NDVI equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0-100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0-1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month is less green (target at/below the record minimum). */
  isLeastGreenInRecord: boolean | null;
  /** True when no baseline month is greener (target at/above the record maximum). */
  isGreenestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly NDVI observation within prior supplied observations
 * for the same calendar month at the same place.
 *
 * A percentile is reported only when the underlying same-calendar-month
 * comparison is itself `available`, so a not-yet-published, low-coverage, or
 * under-sampled record never yields a fabricated rank. Ties are split evenly
 * (mid-rank), so `percentileRank/100 + exceedanceProbability === 1` by
 * construction.
 */
export function describeNdviSeasonalPercentile(
  targetObservation: NdviMonthlyObservation,
  priorSameMonthObservations: readonly NdviMonthlyObservation[],
  availableThrough: YearMonth,
  latitude: number,
  options: NdviSeasonalBaselineOptions = {}
): NdviSeasonalPercentileResult {
  const baseline = compareMonthlyNdviToSeasonalBaseline(
    targetObservation,
    priorSameMonthObservations,
    availableThrough,
    latitude,
    options
  );

  const base = {
    kind: "ndvi-seasonal-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    metric: NDVI_PERCENTILE_METRIC,
    status: baseline.status,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: NDVI_SEASONAL_PERCENTILE_LIMITATIONS,
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
      lessGreenRecordCount: null,
      greenerRecordCount: null,
      tiedRecordCount: null,
      percentileRank: null,
      exceedanceProbability: null,
      isLeastGreenInRecord: null,
      isGreenestInRecord: null,
      reason: baseline.reason ?? "percentile-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const count = baseline.samples.length;
  let lessGreen = 0;
  let greener = 0;
  let tied = 0;
  for (const sample of baseline.samples) {
    if (sample.ndvi < target) lessGreen += 1;
    else if (sample.ndvi > target) greener += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target, splitting exact ties evenly. Symmetric to exceedance, so
  // percentileRank/100 + exceedanceProbability === 1 by construction.
  const nonExceedance = (lessGreen + tied / 2) / count;
  return {
    ...base,
    lessGreenRecordCount: lessGreen,
    greenerRecordCount: greener,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (greener + tied / 2) / count,
    isLeastGreenInRecord: lessGreen === 0,
    isGreenestInRecord: greener === 0,
    reason: null,
  };
}
