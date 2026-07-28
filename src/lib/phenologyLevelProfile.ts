import {
  MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA,
  NDVI_SOURCE,
  NDVI_UNIT,
  hemisphereForLatitude,
  type Hemisphere,
  type NdviMonthlyObservation,
} from "./phenology";
import { neumaierSum } from "./numerics";
import type { DatasetRef } from "./timeline";

/**
 * Descriptive per-year *robust central level* of monthly NDVI greenness.
 *
 * {@link summarizeAnnualNdviPhenology} reduces a year to its highest (peak) and
 * lowest (trough) supplied monthly MOD13A3 NDVI observation. Those are the two
 * order-statistic *extremes*, and both are maximally sensitive to a single
 * anomalous month: one cloud-, snow-, or aerosol-contaminated composite can set
 * the annual peak or trough on its own, and the peak-minus-trough amplitude
 * inherits that sensitivity. This helper adds the distribution's *interior*
 * shape for each year — the median and quartiles of the supplied monthly values
 * — giving an outlier-resistant "typical greenness level" (the median) and an
 * outlier-resistant spread (the interquartile range) to sit alongside the
 * extrema and their range.
 *
 * NDVI is a continuous, interval-scaled vegetation index, so its order
 * statistics (median, quartiles, IQR) are well defined and rank-preserving —
 * unlike a categorical land-cover class code, which must never be averaged or
 * ranked. The median and IQR reported here are therefore legitimate summaries
 * of the index itself.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - The median and IQR summarize only the *supplied* monthly index values for a
 *    year. They are NOT growing-season productivity, biomass, canopy cover, a
 *    leaf-area or fraction-of-cover measure, a phenophase or growing-season
 *    length, an anomaly against any climatology, a cause, or a forecast. A
 *    higher median is not "healthier" vegetation.
 *  - Because NDVI months are unequally informative when coverage is patchy and a
 *    calendar year is only ~12 samples, a minimum valid-month count is required
 *    and the full coverage tally is always returned for auditability. Interior
 *    quantiles from a short record are uncertain.
 *  - Quantiles use linear interpolation between the two nearest order statistics
 *    (the R-7 / NumPy-default convention), matching the seismic depth profile so
 *    the two order-statistic summaries are read the same way.
 *  - The mean is reported alongside the median only as a non-robust companion;
 *    the median is the intended central-level statistic.
 */

/** Honest scope limits for the derived per-year NDVI level profile. */
export const NDVI_LEVEL_PROFILE_LIMITATIONS =
  "The NDVI level profile is the order-statistic summary (min, first quartile, " +
  "median, third quartile, max, and interquartile range) of a year's supplied " +
  "monthly MOD13A3 NDVI values, with the non-robust mean reported alongside. It " +
  "describes only the central level and spread of that unitless vegetation " +
  "index for the supplied months — the median is an outlier-resistant typical " +
  "greenness level and the IQR an outlier-resistant spread, complementing the " +
  "extrema-based peak, trough, and amplitude. Quantiles use linear " +
  "interpolation between the two nearest order statistics (the R-7 / " +
  "NumPy-default convention); interior quantiles from a short record are " +
  "uncertain. It requires a minimum number of valid months (gaps bias the " +
  "statistics) and carries the shared cited provenance — it is not a " +
  "growing-season productivity, biomass, canopy, or fraction-of-cover measure, " +
  "a phenophase or growing-season length, an anomaly, ecosystem-condition " +
  "assessment, cause, or forecast.";

export type NdviLevelProfileStatus = "available" | "insufficient-coverage";

export interface NdviLevelQuantiles {
  /** Lowest supplied monthly NDVI for the year (unitless). */
  min: number;
  /** First quartile (25th percentile) of the supplied monthly NDVI. */
  q1: number;
  /** Median (50th percentile): the robust central greenness level. */
  median: number;
  /** Third quartile (75th percentile) of the supplied monthly NDVI. */
  q3: number;
  /** Highest supplied monthly NDVI for the year (unitless). */
  max: number;
  /** Interquartile range, q3 − q1; the robust spread. Zero when values agree. */
  iqr: number;
  /**
   * Arithmetic mean of the supplied monthly NDVI, reported only as a non-robust
   * companion to the median; the median is the intended central-level statistic.
   */
  mean: number;
}

export interface NdviLevelProfileCoverage {
  /** Valid calendar months supplied for this year (not an assumed 12 months). */
  validMonthCount: number;
  /** Supplied months without a usable NDVI observation. */
  missingMonthCount: number;
  /** Supplied records rejected for invalid date, value, coverage, or duplicate. */
  invalidRecordCount: number;
  /** Minimum valid months required before a level profile is stated. */
  requiredMonthCount: number;
  /** Lowest reported regional valid fraction among the retained observations. */
  minimumValidFraction: number | null;
}

export interface NdviLevelProfile {
  kind: "ndvi-level-profile";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  year: number;
  hemisphere: Hemisphere;
  status: NdviLevelProfileStatus;
  coverage: NdviLevelProfileCoverage;
  /** Order-statistic summary for the year, or null when coverage is too sparse. */
  quantiles: NdviLevelQuantiles | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no profile is reported. */
  reason: string | null;
}

interface YearGroup {
  seenMonths: Set<number>;
  valid: { ndvi: number; validFraction: number }[];
  missingMonthCount: number;
  invalidRecordCount: number;
}

/**
 * Summarize the per-year robust central level and spread of monthly NDVI for
 * each year in a run of supplied observations.
 *
 * Input may be supplied in any order and may be incomplete; omitted calendar
 * months are never counted as data. Grouping and per-observation validation
 * mirror {@link summarizeAnnualNdviPhenology} exactly (same calendar-month,
 * duplicate, range, and coverage rules), so coverage tallies are comparable and
 * a duplicate can never silently shift a year's order statistics.
 */
export function summarizeNdviLevelProfile(
  observations: readonly NdviMonthlyObservation[],
  latitude: number,
  options: { minimumMonths?: number } = {}
): NdviLevelProfile[] {
  const requiredMonthCount =
    Number.isInteger(options.minimumMonths) &&
    (options.minimumMonths as number) > 0
      ? (options.minimumMonths as number)
      : MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA;
  const hemisphere = hemisphereForLatitude(latitude);

  const years = new Map<number, YearGroup>();
  for (const observation of observations) {
    const year = observation.month?.year;
    if (!Number.isInteger(year)) continue;
    const group = years.get(year) ?? emptyYearGroup();
    years.set(year, group);

    if (!isCalendarMonth(observation.month)) {
      group.invalidRecordCount += 1;
      continue;
    }
    const month = observation.month.month;
    if (group.seenMonths.has(month)) {
      group.invalidRecordCount += 1;
      continue;
    }
    group.seenMonths.add(month);

    if (observation.ndvi === null || observation.validFraction === 0) {
      group.missingMonthCount += 1;
      continue;
    }
    if (
      !Number.isFinite(observation.ndvi) ||
      (observation.ndvi as number) < -1 ||
      (observation.ndvi as number) > 1 ||
      (observation.validFraction !== undefined &&
        (!Number.isFinite(observation.validFraction) ||
          observation.validFraction < 0 ||
          observation.validFraction > 1))
    ) {
      group.invalidRecordCount += 1;
      continue;
    }

    group.valid.push({
      ndvi: observation.ndvi as number,
      validFraction: observation.validFraction ?? 1,
    });
  }

  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, group]) =>
      profileForYear(year, group, hemisphere, requiredMonthCount)
    );
}

function emptyYearGroup(): YearGroup {
  return {
    seenMonths: new Set<number>(),
    valid: [],
    missingMonthCount: 0,
    invalidRecordCount: 0,
  };
}

function isCalendarMonth(month: NdviMonthlyObservation["month"]): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function profileForYear(
  year: number,
  group: YearGroup,
  hemisphere: Hemisphere,
  requiredMonthCount: number
): NdviLevelProfile {
  const coverage: NdviLevelProfileCoverage = {
    validMonthCount: group.valid.length,
    missingMonthCount: group.missingMonthCount,
    invalidRecordCount: group.invalidRecordCount,
    requiredMonthCount,
    minimumValidFraction:
      group.valid.length === 0
        ? null
        : Math.min(...group.valid.map(({ validFraction }) => validFraction)),
  };
  const base = {
    kind: "ndvi-level-profile" as const,
    isForecast: false as const,
    year,
    hemisphere,
    coverage,
    source: NDVI_SOURCE,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  if (group.valid.length < requiredMonthCount) {
    return {
      ...base,
      status: "insufficient-coverage",
      quantiles: null,
      reason: "insufficient-months",
    };
  }

  const sorted = group.valid.map(({ ndvi }) => ndvi).sort((a, b) => a - b);
  const q1 = quantileSorted(sorted, 0.25);
  const q3 = quantileSorted(sorted, 0.75);
  return {
    ...base,
    status: "available",
    quantiles: {
      min: sorted[0],
      q1,
      median: quantileSorted(sorted, 0.5),
      q3,
      max: sorted[sorted.length - 1],
      iqr: q3 - q1,
      mean: neumaierSum(sorted) / sorted.length,
    },
    reason: null,
  };
}

/**
 * The p-th quantile (0 ≤ p ≤ 1) of a pre-sorted ascending array by linear
 * interpolation between the closest ranks — the R-7 / NumPy-default method,
 * matching {@link seismicDepthProfile}. The caller guarantees a non-empty array.
 */
function quantileSorted(sorted: readonly number[], p: number): number {
  const lastIndex = sorted.length - 1;
  if (lastIndex === 0) return sorted[0];
  const rank = lastIndex * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}
