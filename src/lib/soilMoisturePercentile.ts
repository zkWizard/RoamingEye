import { CLIMATE_METRICS, type ClimateMetric } from "./climate";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
  type SeasonalBaselineOptions,
  type SeasonalBaselineStatus,
} from "./seasonalBaseline";
import type { SoilMoistureObservation } from "./soilMoistureChange";
import type { YearMonth } from "./timeline";

/**
 * Empirical percentile-of-record for a supplied monthly soil-moisture value.
 *
 * The soil layer renders GLDAS-Noah underground (root-zone) soil moisture as a
 * modeled column water content in kg/m². The plainest wetness question a reader
 * asks — *is this month wet or dry for here?* — cannot be answered from the raw
 * value, because column water content carries the model's seasonal cycle and
 * scales with the model's soil-column depth, so a number is only meaningful
 * against other numbers for the *same place and same calendar month*. Soil-
 * moisture *percentiles of record* are exactly how operational drought
 * monitoring expresses terrestrial wetness for this reason: they rank a value
 * within its own place-and-season history rather than reading an absolute scale.
 *
 * This helper describes only that empirical rank. It ranks one supplied target
 * observation against prior supplied observations for the same calendar month at
 * the same place, reusing the audited same-calendar-month baseline machinery in
 * seasonalBaseline.ts (which deduplicates years, drops unpublished or low-
 * coverage months, excludes the target year, and enforces a minimum-sample
 * floor). It reports where the target falls as a non-exceedance percentile plus
 * the raw counts behind it. It is a non-parametric companion to the parametric
 * anomaly in seasonalBaseline.ts — robust to a short or skewed record and making
 * no normality assumption — not an operational drought percentile, a
 * climatological normal, or a probability of any future condition. It never
 * infers drought category, recharge, runoff, cause, or any future value.
 *
 * Pure, render-free logic (see soilMoisturePercentile.test.ts).
 */

/** Cited GLDAS soil-moisture metric backing every percentile description. */
export const SOIL_MOISTURE_PERCENTILE_METRIC: ClimateMetric =
  CLIMATE_METRICS["soil-moisture"];

export const SOIL_MOISTURE_PERCENTILE_LIMITATIONS = [
  "Values are GLDAS-Noah modeled column soil-water content in kg/m², not a direct in-situ measurement.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not an operational drought percentile, a climatological normal, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same place because column water content carries the model's seasonal cycle and scales with soil-column depth; a cross-month or cross-place rank would be misleading.",
  "The non-exceedance percentile uses the mid-rank convention F = (below + tied/2) / n; the raw below/tied/above counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never infers drought category, recharge, runoff, evapotranspiration, water-balance closure, cause, or any future value.",
] as const;

/** Percentile status mirrors the underlying same-calendar-month baseline. */
export type SoilMoisturePercentileStatus = SeasonalBaselineStatus;

export interface SoilMoisturePercentileResult {
  kind: "soil-moisture-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: SoilMoisturePercentileStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months strictly drier than the target (native kg/m²). */
  drierRecordCount: number | null;
  /** Baseline months strictly wetter than the target. */
  wetterRecordCount: number | null;
  /** Baseline months whose value equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0-100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0-1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month is drier (target at/below the record minimum). */
  isDriestInRecord: boolean | null;
  /** True when no baseline month is wetter (target at/above the record maximum). */
  isWettestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly soil-moisture observation within prior supplied
 * observations for the same calendar month at the same place.
 *
 * The candidate list and the target are forced onto the soil-moisture metric so
 * a non–soil-moisture layer cannot be ranked through this helper. All sample
 * gathering, validation, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline`; a percentile is reported only when
 * that comparison is itself `available`, so a not-yet-published, low-coverage,
 * or under-sampled record never yields a fabricated rank. A `null` percentile
 * therefore means "no rank can be stated", never "median".
 */
export function describeSoilMoisturePercentile(
  targetObservation: SoilMoistureObservation,
  priorSameMonthObservations: readonly SoilMoistureObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): SoilMoisturePercentileResult {
  const baseline = compareMonthlyClimateToSeasonalBaseline(
    { ...targetObservation, metricId: "soil-moisture" },
    priorSameMonthObservations.map((observation) => ({
      ...observation,
      metricId: "soil-moisture" as const,
    })),
    availableThrough,
    options
  );

  const base = {
    kind: "soil-moisture-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    metric: SOIL_MOISTURE_PERCENTILE_METRIC,
    status: baseline.status,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: SOIL_MOISTURE_PERCENTILE_LIMITATIONS,
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
      drierRecordCount: null,
      wetterRecordCount: null,
      tiedRecordCount: null,
      percentileRank: null,
      exceedanceProbability: null,
      isDriestInRecord: null,
      isWettestInRecord: null,
      reason: baseline.reason ?? "percentile-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const count = baseline.samples.length;
  let drier = 0;
  let wetter = 0;
  let tied = 0;
  for (const sample of baseline.samples) {
    if (sample.value < target) drier += 1;
    else if (sample.value > target) wetter += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target, splitting exact ties evenly. Symmetric to exceedance, so
  // percentileRank/100 + exceedanceProbability === 1 by construction.
  const nonExceedance = (drier + tied / 2) / count;
  return {
    ...base,
    drierRecordCount: drier,
    wetterRecordCount: wetter,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (wetter + tied / 2) / count,
    isDriestInRecord: drier === 0,
    isWettestInRecord: wetter === 0,
    reason: null,
  };
}
