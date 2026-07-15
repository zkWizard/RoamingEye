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
 * Empirical percentile-of-record for a supplied monthly column AOD observation.
 *
 * The atmosphere layer renders MERRA-2 total aerosol optical thickness at
 * 550 nm — a dimensionless, column-integrated extinction measure. The plainest
 * question a reader asks of one value — *is this month hazy or clear for here?*
 * — cannot be read off the raw AOD, because column loading carries a strong
 * seasonal cycle (dust seasons, biomass-burning seasons, synoptic haze) and
 * varies from place to place, so a number is only meaningful against other
 * numbers for the SAME place and SAME calendar month. This helper ranks the
 * target within its own place-and-season history and reports where it falls as
 * a non-exceedance percentile plus the raw counts behind it.
 *
 * It is a NON-PARAMETRIC companion to the standardized anomaly carried by
 * aerosolSeasonalBaseline.ts: a rank is robust to a short or skewed record and
 * makes no distributional assumption, and — unlike a standardized anomaly, which
 * is undefined when the baseline spread is zero — a rank is defined whenever the
 * audited baseline is itself available. All sample gathering, deduplication,
 * coverage filtering, target-year exclusion, and the minimum-sample floor are
 * delegated to `compareAerosolToSeasonalBaseline` (which never borrows adjacent
 * months or fills missing years). This helper adds only the distribution-free
 * rank on top of that audited baseline.
 *
 * It is NOT a climatological normal, an operational aerosol percentile, a
 * significance test, an air-quality or health classification, or a probability
 * of any future condition, and an empirical percentile from a limited record can
 * never fall outside the sampled range. It never diagnoses hazard, derives a
 * surface concentration, attributes cause, or forecasts any future value.
 * Provenance (MERRA-2, not the picture) is retained through the baseline.
 *
 * Pure, render-free logic (see aerosolSeasonalPercentile.test.ts).
 */

export const AEROSOL_SEASONAL_PERCENTILE_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index; MERRA-2 is a reanalysis, so a value is a modelled monthly mean, not a direct pixel measurement.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not a climatological normal, an operational aerosol percentile, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same place because the aerosol seasonal cycle is large; a cross-month or cross-place rank would be misleading and this helper never borrows adjacent months or fills missing years.",
  "The non-exceedance percentile uses the mid-rank convention F = (clearer + tied/2) / n; the raw clearer/tied/hazier counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never classifies a haze or dust episode, diagnoses hazard, attributes cause, or infers any future value.",
] as const;

/** Percentile status mirrors the underlying same-calendar-month baseline. */
export type AerosolSeasonalPercentileStatus = AerosolSeasonalBaselineStatus;

export interface AerosolSeasonalPercentileResult {
  kind: "aerosol-seasonal-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  status: AerosolSeasonalPercentileStatus;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: AerosolSeasonalBaselineComparison;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months strictly clearer than the target (lower AOD). */
  clearerRecordCount: number | null;
  /** Baseline months strictly hazier than the target (higher AOD). */
  hazierRecordCount: number | null;
  /** Baseline months whose AOD equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0-100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0-1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month is clearer (target at/below the record minimum). */
  isClearestInRecord: boolean | null;
  /** True when no baseline month is hazier (target at/above the record maximum). */
  isHaziestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly column AOD observation within prior supplied
 * observations for the same calendar month at the same place.
 *
 * All sample gathering, validation, deduplication, coverage filtering,
 * target-year exclusion, and the minimum-sample floor are delegated to
 * `compareAerosolToSeasonalBaseline`; a percentile is reported only when that
 * comparison is itself `available`, so a not-yet-published, low-coverage, or
 * under-sampled record never yields a fabricated rank. A `null` percentile
 * therefore means "no rank can be stated", never "median".
 */
export function describeAerosolSeasonalPercentile(
  targetObservation: AerosolObservation,
  priorSameMonthObservations: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolSeasonalBaselineOptions = {}
): AerosolSeasonalPercentileResult {
  const baseline = compareAerosolToSeasonalBaseline(
    targetObservation,
    priorSameMonthObservations,
    availableThrough,
    options
  );

  const base = {
    kind: "aerosol-seasonal-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    status: baseline.status,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: AEROSOL_SEASONAL_PERCENTILE_LIMITATIONS,
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
      clearerRecordCount: null,
      hazierRecordCount: null,
      tiedRecordCount: null,
      percentileRank: null,
      exceedanceProbability: null,
      isClearestInRecord: null,
      isHaziestInRecord: null,
      reason: baseline.reason ?? "percentile-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const count = baseline.samples.length;
  let clearer = 0;
  let hazier = 0;
  let tied = 0;
  for (const sample of baseline.samples) {
    if (sample.value < target) clearer += 1;
    else if (sample.value > target) hazier += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target loading, splitting exact ties evenly. Symmetric to
  // exceedance, so percentileRank/100 + exceedanceProbability === 1 by
  // construction.
  const nonExceedance = (clearer + tied / 2) / count;
  return {
    ...base,
    clearerRecordCount: clearer,
    hazierRecordCount: hazier,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (hazier + tied / 2) / count,
    isClearestInRecord: clearer === 0,
    isHaziestInRecord: hazier === 0,
    reason: null,
  };
}
