import {
  NDVI_SOURCE,
  NDVI_UNIT,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
  type NdviAnnualPhenology,
} from "./phenology";
import { neumaierSum } from "./numerics";
import type { DatasetRef } from "./timeline";

/**
 * Circular summary of *when* the annual NDVI peak lands across several years.
 *
 * This consumes the honest per-year extrema from `summarizeAnnualNdviPhenology`
 * and answers a descriptive question only: in which calendar month did the
 * highest supplied monthly NDVI observation fall each year, and how consistent
 * was that month across the record? It does not infer green-up or senescence
 * dates, growing-season length, plant phenophases, biomass, ecosystem health,
 * causes, or future timing — a monthly index maximum is not a phenological
 * event.
 *
 * Calendar months are circular (December is adjacent to January), so the peak
 * month cannot be averaged with ordinary arithmetic: a December peak and a
 * January peak average to the December/January turn, not to July. We therefore
 * place each year's peak month on the unit circle and use the mean resultant
 * vector — the standard tool for directional data (Fisher, *Statistical
 * Analysis of Circular Data*, 1993). Its length R in [0, 1] measures timing
 * concordance: R near 1 means peaks recur in nearly the same month every year;
 * R near 0 means they are spread around the calendar. R is descriptive and is
 * unstable for a handful of years, so a conservative minimum is enforced and
 * the raw per-month tally is always returned for auditability.
 */

/** A conservative floor before speaking of peak-timing concordance at all. */
export const MINIMUM_YEARS_FOR_PEAK_TIMING = 3;

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;

/** Below this resultant length the mean direction is treated as undefined. */
const RESULTANT_EPSILON = 1e-9;

export type PeakGreennessTimingStatus = "available" | "insufficient-years";

/**
 * Convenience bins for the mean resultant length R. These are presentation
 * thresholds for R, not categories from any published standard; R itself is
 * the measurement and should be preferred for any quantitative use.
 */
export type TimingConcordance =
  "tightly-clustered" | "clustered" | "variable" | "dispersed";

export interface PeakMonthTally {
  /** Calendar month (1..12) that held the annual NDVI peak. */
  month: number;
  /** Calendar-season label for the hemisphere, never a growth-phase claim. */
  meteorologicalSeason: MeteorologicalSeason;
  /** Years whose peak fell in this month. */
  count: number;
}

export interface PeakGreennessTimingCoverage {
  /** Years contributing a usable, unique annual peak month. */
  contributingYearCount: number;
  /** Years excluded because the annual peak was null (sparse or no-data). */
  sparseYearCount: number;
  /** Years excluded for an invalid peak month or a repeated calendar year. */
  invalidYearCount: number;
  requiredYearCount: number;
  /** Earliest and latest contributing calendar years, or null when none. */
  firstYear: number | null;
  lastYear: number | null;
}

export interface PeakGreennessTiming {
  kind: "ndvi-peak-greenness-timing";
  status: PeakGreennessTimingStatus;
  hemisphere: Hemisphere;
  coverage: PeakGreennessTimingCoverage;
  /** Per-month tally of contributing peaks, ascending, months with data only. */
  peakMonthCounts: PeakMonthTally[];
  /** Most frequent peak month; ties resolved toward the circular mean. */
  dominantPeakMonth: PeakMonthTally | null;
  /**
   * Calendar month (1..12) nearest the circular mean of the peak months, or
   * null when the resultant vector is too short to define a direction.
   */
  circularMeanMonth: number | null;
  /** Meteorological season of `circularMeanMonth`, or "not-assigned". */
  circularMeanSeason: MeteorologicalSeason;
  /** Mean resultant length R in [0, 1]; higher means tighter clustering. */
  meanResultantLength: number | null;
  /** Presentation bin for R; null when R is unavailable. */
  timingConcordance: TimingConcordance | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
}

interface ContributingPeak {
  year: number;
  month: number;
}

/**
 * Summarize the calendar timing of annual NDVI peaks across supplied years.
 * Sparse years (no reported peak) and any duplicate calendar years are counted
 * as excluded rather than silently dropped, so the contributing sample is
 * always reconstructable from the coverage tally.
 */
export function summarizePeakGreennessTiming(
  annualSummaries: readonly NdviAnnualPhenology[],
  options: { minimumYears?: number } = {}
): PeakGreennessTiming {
  const requiredYearCount =
    Number.isInteger(options.minimumYears) &&
    (options.minimumYears as number) > 0
      ? (options.minimumYears as number)
      : MINIMUM_YEARS_FOR_PEAK_TIMING;
  const hemisphere = hemisphereOf(annualSummaries);

  const contributing: ContributingPeak[] = [];
  const seenYears = new Set<number>();
  let sparseYearCount = 0;
  let invalidYearCount = 0;

  for (const summary of annualSummaries) {
    if (summary.peak === null) {
      sparseYearCount += 1;
      continue;
    }
    const peakMonth = summary.peak.month?.month;
    if (
      !Number.isInteger(summary.year) ||
      !Number.isInteger(peakMonth) ||
      peakMonth < 1 ||
      peakMonth > 12 ||
      seenYears.has(summary.year)
    ) {
      invalidYearCount += 1;
      continue;
    }
    seenYears.add(summary.year);
    contributing.push({ year: summary.year, month: peakMonth });
  }

  const contributingYears = contributing.map(({ year }) => year);
  const coverage: PeakGreennessTimingCoverage = {
    contributingYearCount: contributing.length,
    sparseYearCount,
    invalidYearCount,
    requiredYearCount,
    firstYear: contributingYears.length ? Math.min(...contributingYears) : null,
    lastYear: contributingYears.length ? Math.max(...contributingYears) : null,
  };
  const peakMonthCounts = tallyPeakMonths(contributing, hemisphere);

  if (contributing.length < requiredYearCount) {
    return {
      kind: "ndvi-peak-greenness-timing",
      status: "insufficient-years",
      hemisphere,
      coverage,
      peakMonthCounts,
      dominantPeakMonth: null,
      circularMeanMonth: null,
      circularMeanSeason: "not-assigned",
      meanResultantLength: null,
      timingConcordance: null,
      source: NDVI_SOURCE,
      unit: NDVI_UNIT,
    };
  }

  const { resultantLength, meanAngle } = circularStatistics(contributing);
  const circularMeanMonth =
    meanAngle === null ? null : monthForAngle(meanAngle);
  const dominantPeakMonth = dominantMonth(peakMonthCounts, meanAngle);

  return {
    kind: "ndvi-peak-greenness-timing",
    status: "available",
    hemisphere,
    coverage,
    peakMonthCounts,
    dominantPeakMonth,
    circularMeanMonth,
    circularMeanSeason:
      circularMeanMonth === null
        ? "not-assigned"
        : meteorologicalSeasonForMonth(circularMeanMonth, hemisphere),
    meanResultantLength: resultantLength,
    timingConcordance: concordanceForResultant(resultantLength),
    source: NDVI_SOURCE,
    unit: NDVI_UNIT,
  };
}

/** All summaries share one location; take the first defined hemisphere. */
function hemisphereOf(
  annualSummaries: readonly NdviAnnualPhenology[]
): Hemisphere {
  for (const summary of annualSummaries) {
    if (summary.hemisphere !== "unknown") return summary.hemisphere;
  }
  return annualSummaries[0]?.hemisphere ?? "unknown";
}

function tallyPeakMonths(
  contributing: readonly ContributingPeak[],
  hemisphere: Hemisphere
): PeakMonthTally[] {
  const counts = new Map<number, number>();
  for (const { month } of contributing) {
    counts.set(month, (counts.get(month) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a - b)
    .map(([month, count]) => ({
      month,
      meteorologicalSeason: meteorologicalSeasonForMonth(month, hemisphere),
      count,
    }));
}

function circularStatistics(contributing: readonly ContributingPeak[]): {
  resultantLength: number;
  meanAngle: number | null;
} {
  const cosParts = contributing.map(({ month }) =>
    Math.cos((month - 1) * RADIANS_PER_MONTH)
  );
  const sinParts = contributing.map(({ month }) =>
    Math.sin((month - 1) * RADIANS_PER_MONTH)
  );
  const meanCos = neumaierSum(cosParts) / contributing.length;
  const meanSin = neumaierSum(sinParts) / contributing.length;
  const resultantLength = Math.min(1, Math.hypot(meanCos, meanSin));
  if (resultantLength < RESULTANT_EPSILON) {
    return { resultantLength, meanAngle: null };
  }
  let meanAngle = Math.atan2(meanSin, meanCos);
  if (meanAngle < 0) meanAngle += 2 * Math.PI;
  return { resultantLength, meanAngle };
}

/** Map a circular mean angle back to the nearest calendar month (1..12). */
function monthForAngle(angle: number): number {
  const continuous = angle / RADIANS_PER_MONTH + 1; // in [1, 13)
  const rounded = Math.round(continuous);
  return ((rounded - 1) % 12) + 1; // wrap 13 -> 1
}

/**
 * The modal peak month. Ties are broken toward the circular mean direction so
 * the reported month is the one the vector average actually favors, then by the
 * smaller month number for full determinism.
 */
function dominantMonth(
  tallies: readonly PeakMonthTally[],
  meanAngle: number | null
): PeakMonthTally | null {
  if (tallies.length === 0) return null;
  const maxCount = Math.max(...tallies.map((tally) => tally.count));
  const leaders = tallies.filter((tally) => tally.count === maxCount);
  if (leaders.length === 1 || meanAngle === null) {
    return leaders[0];
  }
  return leaders.reduce((best, candidate) =>
    angularDistance((candidate.month - 1) * RADIANS_PER_MONTH, meanAngle) <
    angularDistance((best.month - 1) * RADIANS_PER_MONTH, meanAngle)
      ? candidate
      : best
  );
}

/** Smallest absolute angular separation between two directions, in radians. */
function angularDistance(a: number, b: number): number {
  return Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));
}

function concordanceForResultant(resultantLength: number): TimingConcordance {
  if (resultantLength >= 0.9) return "tightly-clustered";
  if (resultantLength >= 0.75) return "clustered";
  if (resultantLength >= 0.5) return "variable";
  return "dispersed";
}
