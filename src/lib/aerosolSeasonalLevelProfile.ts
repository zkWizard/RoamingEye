import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  type AerosolObservation,
} from "./aerosolLoading";
import {
  compareAerosolToSeasonalBaseline,
  type AerosolSeasonalBaselineBounds,
  type AerosolSeasonalBaselineOptions,
  type AerosolSeasonalBaselineSample,
} from "./aerosolSeasonalBaseline";
import { neumaierSum } from "./numerics";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Source-aware *robust central-level profile* of a same-calendar-month column
 * aerosol optical depth (AOD) record.
 *
 * {@link compareAerosolToSeasonalBaseline} describes one supplied monthly AOD
 * observation against the mean (± sample standard deviation) of prior
 * same-calendar-month observations for the same place. The arithmetic mean is
 * the natural centre for a symmetric distribution, but column AOD is not
 * symmetric: its same-month record is strongly right-skewed because episodic
 * dust outbreaks, biomass-burning plumes, and synoptic haze inject occasional
 * very high months onto an otherwise low background. A single such month pulls
 * the mean up and inflates the standard deviation, so "the mean July here" can
 * sit well above the level a typical July actually reaches.
 *
 * This helper adds the outlier-resistant companion to that mean baseline: the
 * order-statistic profile (minimum, first quartile, median, third quartile,
 * maximum, and interquartile range) of the SAME audited same-calendar-month
 * sample the baseline retains. The median is an outlier-resistant "typical haze
 * level" for the month, and the interquartile range an outlier-resistant spread;
 * a mean sitting well above the median is itself the signature of that
 * right-skew. It delegates sample collection to the baseline so the two
 * summaries describe an identical set of retained years — same deduplication,
 * coverage floor, publication filtering, and year window — and can be shown side
 * by side honestly.
 *
 * Scientific honesty (kept in the code because callers surface it):
 *  - AOD at 550 nm is a whole-column optical thickness, NOT a surface
 *    concentration and NOT a regulatory air-quality or health index. A higher
 *    median column loading is not "worse air".
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so every value is a modelled monthly mean, not a direct pixel measurement.
 *  - The median and quartiles summarize a SHORT supplied same-calendar-month
 *    record for one place. They are a robust description of that record's level
 *    and spread, NOT a climatological normal, an exceedance probability, a
 *    significance test, a cause, or a forecast. Interior quantiles from a short
 *    record are uncertain.
 *  - Quantiles use linear interpolation between the two nearest order statistics
 *    (the R-7 / NumPy-default convention), matching the other order-statistic
 *    profiles in this codebase so they are all read the same way.
 *  - The arithmetic mean is reported alongside the median only as a non-robust
 *    companion (and as the tie-in to the mean baseline); the median is the
 *    intended central-level statistic.
 *
 * Pure, render-free logic (see aerosolSeasonalLevelProfile.test.ts).
 */

/** Honest scope limits for the derived same-calendar-month AOD level profile. */
export const AEROSOL_SEASONAL_LEVEL_PROFILE_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so every value is a modelled monthly mean, not a direct pixel measurement.",
  "The profile is the order-statistic summary (min, first quartile, median, third quartile, max, and interquartile range) of a short supplied record of prior same-calendar-month observations for the same place — a robust description of that record's level and spread, not a climatological normal, an exceedance probability, a significance test, a cause, or a forecast.",
  "Column AOD is right-skewed by episodic dust and biomass-burning months, so the median is a more representative typical level than the mean and the interquartile range a more robust spread than the standard deviation; a mean well above the median flags that skew rather than a measurement error.",
  "Quantiles use linear interpolation between the two nearest order statistics (the R-7 / NumPy-default convention); interior quantiles from a short record are uncertain. The retained same-calendar-month sample is shared with the mean baseline (same deduplication, coverage floor, publication filtering, and year window) and same-place grouping is the caller's responsibility.",
] as const;

export type AerosolSeasonalLevelProfileStatus =
  "available" | "insufficient-samples" | "unavailable";

export interface AerosolLevelQuantiles {
  /** Lowest retained same-calendar-month AOD in the record (dimensionless). */
  min: number;
  /** First quartile (25th percentile) of the retained AOD sample. */
  q1: number;
  /** Median (50th percentile): the robust central column-loading level. */
  median: number;
  /** Third quartile (75th percentile) of the retained AOD sample. */
  q3: number;
  /** Highest retained same-calendar-month AOD in the record (dimensionless). */
  max: number;
  /** Interquartile range, q3 − q1; the robust spread. Zero when values agree. */
  iqr: number;
  /**
   * Arithmetic mean of the retained AOD sample, reported only as a non-robust
   * companion to the median and as the tie-in to the mean baseline; the median
   * is the intended central-level statistic.
   */
  mean: number;
}

export interface AerosolSeasonalLevelProfile {
  kind: "same-calendar-month-aerosol-level-profile";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-column-aerosol-optical-depth-only";
  status: AerosolSeasonalLevelProfileStatus;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  /** Calendar month and year window the profile was built on (from baseline). */
  bounds: AerosolSeasonalBaselineBounds;
  /** Retained same-calendar-month samples, or 0 when none qualified. */
  sampleCount: number;
  /** Minimum retained same-calendar-month samples required for a profile. */
  requiredSampleCount: number;
  /** Order-statistic profile, or null when the record is too short/undefined. */
  quantiles: AerosolLevelQuantiles | null;
  /** Retained baseline samples, oldest to newest, for auditability. */
  samples: AerosolSeasonalBaselineSample[];
  /** Short machine-readable reason when no profile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Describe the robust central level and spread of a same-calendar-month AOD
 * record. Sample collection is delegated to
 * {@link compareAerosolToSeasonalBaseline}, so the retained record is exactly
 * the one the mean baseline uses (same deduplication, coverage floor,
 * publication filtering, and year window). The target observation only fixes the
 * calendar month and year window; the profile characterizes the historical
 * record, so it is reported whenever enough same-calendar-month samples are
 * retained even if the target month itself is unpublished or low-coverage. A
 * `null` set of quantiles always means "no profile can be stated", never
 * "median of zero".
 */
export function describeAerosolSeasonalLevelProfile(
  targetObservation: AerosolObservation,
  baselineCandidates: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolSeasonalBaselineOptions = {}
): AerosolSeasonalLevelProfile {
  const baseline = compareAerosolToSeasonalBaseline(
    targetObservation,
    baselineCandidates,
    availableThrough,
    options
  );
  const samples = baseline.samples;
  const requiredSampleCount = baseline.baseline.requiredSampleCount;

  // A null calendar month (invalid target month) or an invalid baseline
  // configuration means the record itself is undefined — never a real profile.
  if (
    baseline.bounds.calendarMonth === null ||
    baseline.reason === "invalid-baseline-configuration"
  ) {
    return profileFor(
      "unavailable",
      baseline.bounds,
      samples,
      requiredSampleCount,
      baseline.reason ?? "level-profile-unavailable"
    );
  }

  if (samples.length < requiredSampleCount) {
    return profileFor(
      "insufficient-samples",
      baseline.bounds,
      samples,
      requiredSampleCount,
      "too-few-same-calendar-month-samples"
    );
  }

  return {
    kind: "same-calendar-month-aerosol-level-profile",
    isForecast: false,
    claimScope: "descriptive-column-aerosol-optical-depth-only",
    status: "available",
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    bounds: baseline.bounds,
    sampleCount: samples.length,
    requiredSampleCount,
    quantiles: quantilesOf(samples.map((sample) => sample.value)),
    samples,
    reason: null,
    limitations: AEROSOL_SEASONAL_LEVEL_PROFILE_LIMITATIONS,
  };
}

function profileFor(
  status: AerosolSeasonalLevelProfileStatus,
  bounds: AerosolSeasonalBaselineBounds,
  samples: AerosolSeasonalBaselineSample[],
  requiredSampleCount: number,
  reason: string
): AerosolSeasonalLevelProfile {
  return {
    kind: "same-calendar-month-aerosol-level-profile",
    isForecast: false,
    claimScope: "descriptive-column-aerosol-optical-depth-only",
    status,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    bounds,
    sampleCount: samples.length,
    requiredSampleCount,
    quantiles: null,
    samples,
    reason,
    limitations: AEROSOL_SEASONAL_LEVEL_PROFILE_LIMITATIONS,
  };
}

/**
 * Order-statistic profile of a non-empty AOD sample. Callers guarantee a
 * non-empty array (the minimum-sample floor is enforced upstream). The mean uses
 * compensated summation to match the baseline's arithmetic.
 */
function quantilesOf(values: readonly number[]): AerosolLevelQuantiles {
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  return {
    min: sorted[0],
    q1,
    median: quantileSorted(sorted, 0.5),
    q3,
    max: sorted[sorted.length - 1],
    iqr: q3 - q1,
    mean: neumaierSum(sorted) / sorted.length,
  };
}

/**
 * Linear-interpolation quantile (the R-7 / NumPy-default convention) of an
 * ascending-sorted, non-empty array. Position `h = (n − 1)·p` is interpolated
 * between its two bracketing order statistics.
 */
function quantileSorted(sorted: readonly number[], p: number): number {
  const lastIndex = sorted.length - 1;
  if (lastIndex === 0) return sorted[0];
  const position = lastIndex * p;
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, lastIndex);
  return sorted[lower] + (position - lower) * (sorted[upper] - sorted[lower]);
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/**
 * A compact, honest one-line readout of the AOD level profile, matching the
 * place panel's cited-readout style. It states the robust median and
 * interquartile range for the calendar month, the number of same-calendar-month
 * years behind them, and (when they diverge) flags the right-skew implied by a
 * mean above the median. Non-`available` results are reported plainly rather
 * than dressed up as numbers, and it never infers air quality, cause, or any
 * forecast.
 */
export function formatAerosolSeasonalLevelProfile(
  profile: AerosolSeasonalLevelProfile
): string {
  const provenance = `Source: ${profile.source.shortName} v${profile.source.version}. Robust order statistics of a short modelled same-calendar-month record — not a climatological normal, air-quality or health index, cause, or forecast.`;
  const calendarMonthName =
    profile.bounds.calendarMonth !== null
      ? MONTH_NAMES[profile.bounds.calendarMonth - 1]
      : "the same calendar month";
  const lead = `Column-AOD (550 nm) level profile for ${calendarMonthName}:`;

  if (profile.status !== "available" || profile.quantiles === null) {
    return `${lead} no profile is reported (${profile.reason ?? "unavailable"}). ${provenance}`;
  }

  const { median, iqr, q1, q3, mean } = profile.quantiles;
  const years =
    profile.sampleCount === 1
      ? "1 same-calendar-month year"
      : `${profile.sampleCount} same-calendar-month years`;
  const skew =
    mean > median
      ? ` The mean (${round(mean)}) sits above the median, indicating a right-skewed record of episodic high-AOD months.`
      : "";

  return `${lead} median ${round(median)}, IQR ${round(iqr)} (Q1 ${round(q1)} to Q3 ${round(q3)}), across ${years}.${skew} ${provenance}`;
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000;
}
