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
 * Empirical percentile-of-record for a supplied monthly precipitation value.
 *
 * The precipitation layer renders GLDAS monthly-mean precipitation as a rate in
 * kg/m²/s. The plainest hydrologic question a reader asks — *was this month wet
 * or dry for here?* — cannot be read off the raw rate, because precipitation
 * carries a strong seasonal cycle and a place-specific climatology, so a number
 * is only meaningful against other numbers for the *same place and same calendar
 * month*. Precipitation *percentiles of record* are exactly how operational
 * drought and pluvial monitoring express terrestrial wetness for this reason:
 * they rank a value within its own place-and-season history rather than reading
 * an absolute scale.
 *
 * An empirical percentile is an especially honest choice for precipitation.
 * Monthly precipitation is strongly right-skewed (many modest months, a few very
 * wet ones), so a Gaussian anomaly around the mean misrepresents the tails. A
 * non-exceedance percentile makes no distributional assumption at all — it just
 * counts where the target falls within the sorted record — so it is robust to
 * that skew. It is *not* the Standardized Precipitation Index (SPI), which fits a
 * gamma distribution and transforms it to a normal deviate; it is a plain,
 * non-parametric rank companion to the parametric anomaly in seasonalBaseline.ts.
 *
 * This helper describes only that empirical rank. It ranks one supplied target
 * observation against prior supplied observations for the same calendar month at
 * the same place, reusing the audited same-calendar-month baseline machinery in
 * seasonalBaseline.ts (which deduplicates years, drops unpublished or low-
 * coverage months, excludes the target year, and enforces a minimum-sample
 * floor). It reports where the target falls as a non-exceedance percentile plus
 * the raw counts behind it. It is not SPI, an operational drought percentile, a
 * climatological normal, or a probability of any future condition. It never
 * infers drought or flood category, runoff, water-balance closure, cause, or any
 * future value.
 *
 * Pure, render-free logic (see precipitationPercentile.test.ts).
 */

/** Cited GLDAS precipitation metric backing every percentile description. */
export const PRECIPITATION_PERCENTILE_METRIC: ClimateMetric =
  CLIMATE_METRICS["precipitation-rate"];

/**
 * A supplied monthly precipitation observation. The metric is fixed, so callers
 * cannot accidentally rank a non-precipitation layer through this helper.
 */
export type PrecipitationObservation = Omit<
  MonthlyClimateObservation,
  "metricId"
>;

export const PRECIPITATION_PERCENTILE_LIMITATIONS = [
  "Values are GLDAS monthly-mean precipitation rates in kg/m²/s, a land-model product, not a rain-gauge or radar measurement.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not SPI, an operational drought percentile, a climatological normal, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same place because precipitation carries a strong seasonal cycle and a place-specific climatology; a cross-month or cross-place rank would be misleading.",
  "The rank is of the monthly-mean rate. Because a calendar month has the same length across years apart from leap-year Februaries, this is all but identical to ranking the accumulated depth (rate × seconds in month).",
  "The non-exceedance percentile uses the mid-rank convention F = (below + tied/2) / n; the raw below/tied/above counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never infers drought or flood category, runoff, water-balance closure, cause, or any future value.",
] as const;

/** Percentile status mirrors the underlying same-calendar-month baseline. */
export type PrecipitationPercentileStatus = SeasonalBaselineStatus;

export interface PrecipitationPercentileResult {
  kind: "precipitation-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: PrecipitationPercentileStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months strictly drier than the target (native kg/m²/s). */
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
 * Rank one supplied monthly precipitation observation within prior supplied
 * observations for the same calendar month at the same place.
 *
 * The candidate list and the target are forced onto the precipitation-rate
 * metric so a non-precipitation layer cannot be ranked through this helper. All
 * sample gathering, validation, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline`; a percentile is reported only when
 * that comparison is itself `available`, so a not-yet-published, low-coverage,
 * or under-sampled record never yields a fabricated rank. A `null` percentile
 * therefore means "no rank can be stated", never "median".
 */
export function describePrecipitationPercentile(
  targetObservation: PrecipitationObservation,
  priorSameMonthObservations: readonly PrecipitationObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): PrecipitationPercentileResult {
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
    kind: "precipitation-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    metric: PRECIPITATION_PERCENTILE_METRIC,
    status: baseline.status,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: PRECIPITATION_PERCENTILE_LIMITATIONS,
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
