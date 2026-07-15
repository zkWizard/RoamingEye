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
 * Circular summary of *when* the annual NDVI trough lands across several years.
 *
 * {@link summarizeAnnualNdviPhenology} already reports, per year, the lowest
 * (trough) supplied monthly MOD13A3 NDVI observation. This helper answers a
 * descriptive question only: in which calendar month did that annual minimum
 * fall each year, and how consistent was that month across the record? It is
 * the honest complement to the peak-timing descriptor — the low-greenness
 * (dormant- or dry-season) marker rather than the greenest-month marker.
 *
 * It does NOT infer senescence or dormancy onset dates, growing-season length,
 * plant phenophases, biomass, ecosystem health, causes, or future timing — a
 * monthly index minimum is not a phenological event.
 *
 * Calendar months are circular (December is adjacent to January), so the trough
 * month cannot be averaged with ordinary arithmetic: a December trough and a
 * January trough average to the December/January turn, not to July. We place
 * each year's trough month on the unit circle and use the mean resultant
 * vector — the standard tool for directional data (Fisher, *Statistical
 * Analysis of Circular Data*, 1993). Its length R in [0, 1] measures timing
 * concordance: R near 1 means troughs recur in nearly the same month every
 * year; R near 0 means they are spread around the calendar.
 *
 * This descriptor is kept deliberately independent of the peak-timing
 * descriptor: it re-derives the same directional-statistics convention locally
 * rather than coupling the two sibling summaries. It also carries one honesty
 * signal peaks rarely need — a trough drawn from a near-flat year (a small
 * annual NDVI range) is poorly localized, because the month-to-month index
 * minimum is then within the sensor's own noise. Such years are still counted,
 * but flagged in {@link NdviTroughGreennessTimingCoverage.weaklyLocalizedYearCount}
 * so consumers can judge how well-defined the reported timing is.
 */

/** A conservative floor before speaking of trough-timing concordance at all. */
export const MINIMUM_YEARS_FOR_TROUGH_TIMING = 3;

/**
 * Annual NDVI range (peak minus trough) below which the trough month is treated
 * as weakly localized. This is a conservative presentation threshold, not a
 * value from any published standard: a monthly MOD13A3 NDVI series carries
 * roughly 0.02–0.05 of residual month-to-month variability, so when the whole
 * year spans less than this, the "lowest" month is barely distinguishable from
 * its neighbours and its calendar position should not be over-read. The circular
 * statistic itself still uses every contributing year; this only annotates them.
 */
export const WEAK_TROUGH_LOCALIZATION_RANGE = 0.05;

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;

/** Below this resultant length the mean direction is treated as undefined. */
const RESULTANT_EPSILON = 1e-9;

export type TroughGreennessTimingStatus = "available" | "insufficient-years";

/**
 * Convenience bins for the mean resultant length R. These are presentation
 * thresholds for R, not categories from any published standard; R itself is
 * the measurement and should be preferred for any quantitative use.
 */
export type TroughTimingConcordance =
  "tightly-clustered" | "clustered" | "variable" | "dispersed";

export interface TroughMonthTally {
  /** Calendar month (1..12) that held the annual NDVI trough. */
  month: number;
  /** Calendar-season label for the hemisphere, never a dormancy-phase claim. */
  meteorologicalSeason: MeteorologicalSeason;
  /** Years whose trough fell in this month. */
  count: number;
}

export interface NdviTroughGreennessTimingCoverage {
  /** Years contributing a usable, unique annual trough month. */
  contributingYearCount: number;
  /** Years excluded because the annual trough was null (sparse or no-data). */
  sparseYearCount: number;
  /** Years excluded for an invalid trough month or a repeated calendar year. */
  invalidYearCount: number;
  /**
   * Contributing years whose annual NDVI range fell below
   * {@link WEAK_TROUGH_LOCALIZATION_RANGE}, so the trough month is within index
   * noise and its calendar position is weakly defined. A subset of
   * `contributingYearCount`, never subtracted from it.
   */
  weaklyLocalizedYearCount: number;
  requiredYearCount: number;
  /** Earliest and latest contributing calendar years, or null when none. */
  firstYear: number | null;
  lastYear: number | null;
}

export interface NdviTroughGreennessTiming {
  kind: "ndvi-trough-greenness-timing";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  status: TroughGreennessTimingStatus;
  hemisphere: Hemisphere;
  coverage: NdviTroughGreennessTimingCoverage;
  /** Per-month tally of contributing troughs, ascending, months with data only. */
  troughMonthCounts: TroughMonthTally[];
  /** Most frequent trough month; ties resolved toward the circular mean. */
  dominantTroughMonth: TroughMonthTally | null;
  /**
   * Calendar month (1..12) nearest the circular mean of the trough months, or
   * null when the resultant vector is too short to define a direction.
   */
  circularMeanMonth: number | null;
  /** Meteorological season of `circularMeanMonth`, or "not-assigned". */
  circularMeanSeason: MeteorologicalSeason;
  /** Mean resultant length R in [0, 1]; higher means tighter clustering. */
  meanResultantLength: number | null;
  /** Presentation bin for R; null when R is unavailable. */
  timingConcordance: TroughTimingConcordance | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
}

interface ContributingTrough {
  year: number;
  month: number;
  /** Annual NDVI range for the year, used only to flag weak localization. */
  seasonalRange: number | null;
}

/**
 * Summarize the calendar timing of annual NDVI troughs across supplied years.
 * Sparse years (no reported trough) and any duplicate calendar years are
 * counted as excluded rather than silently dropped, so the contributing sample
 * is always reconstructable from the coverage tally.
 */
export function summarizeTroughGreennessTiming(
  annualSummaries: readonly NdviAnnualPhenology[],
  options: { minimumYears?: number } = {}
): NdviTroughGreennessTiming {
  const requiredYearCount =
    Number.isInteger(options.minimumYears) &&
    (options.minimumYears as number) > 0
      ? (options.minimumYears as number)
      : MINIMUM_YEARS_FOR_TROUGH_TIMING;
  const hemisphere = hemisphereOf(annualSummaries);

  const contributing: ContributingTrough[] = [];
  const seenYears = new Set<number>();
  let sparseYearCount = 0;
  let invalidYearCount = 0;

  for (const summary of annualSummaries) {
    if (summary.trough === null) {
      sparseYearCount += 1;
      continue;
    }
    const troughMonth = summary.trough.month?.month;
    if (
      !Number.isInteger(summary.year) ||
      !Number.isInteger(troughMonth) ||
      troughMonth < 1 ||
      troughMonth > 12 ||
      seenYears.has(summary.year)
    ) {
      invalidYearCount += 1;
      continue;
    }
    seenYears.add(summary.year);
    contributing.push({
      year: summary.year,
      month: troughMonth,
      seasonalRange: summary.seasonalRange,
    });
  }

  const contributingYears = contributing.map(({ year }) => year);
  const weaklyLocalizedYearCount = contributing.filter(
    ({ seasonalRange }) =>
      seasonalRange !== null &&
      Number.isFinite(seasonalRange) &&
      seasonalRange < WEAK_TROUGH_LOCALIZATION_RANGE
  ).length;
  const coverage: NdviTroughGreennessTimingCoverage = {
    contributingYearCount: contributing.length,
    sparseYearCount,
    invalidYearCount,
    weaklyLocalizedYearCount,
    requiredYearCount,
    firstYear: contributingYears.length ? Math.min(...contributingYears) : null,
    lastYear: contributingYears.length ? Math.max(...contributingYears) : null,
  };
  const troughMonthCounts = tallyTroughMonths(contributing, hemisphere);

  if (contributing.length < requiredYearCount) {
    return {
      kind: "ndvi-trough-greenness-timing",
      isForecast: false,
      status: "insufficient-years",
      hemisphere,
      coverage,
      troughMonthCounts,
      dominantTroughMonth: null,
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
  const dominantTroughMonth = dominantMonth(troughMonthCounts, meanAngle);

  return {
    kind: "ndvi-trough-greenness-timing",
    isForecast: false,
    status: "available",
    hemisphere,
    coverage,
    troughMonthCounts,
    dominantTroughMonth,
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

function tallyTroughMonths(
  contributing: readonly ContributingTrough[],
  hemisphere: Hemisphere
): TroughMonthTally[] {
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

function circularStatistics(contributing: readonly ContributingTrough[]): {
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
 * The modal trough month. Ties are broken toward the circular mean direction so
 * the reported month is the one the vector average actually favors, then by the
 * smaller month number for full determinism.
 */
function dominantMonth(
  tallies: readonly TroughMonthTally[],
  meanAngle: number | null
): TroughMonthTally | null {
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

function concordanceForResultant(
  resultantLength: number
): TroughTimingConcordance {
  if (resultantLength >= 0.9) return "tightly-clustered";
  if (resultantLength >= 0.75) return "clustered";
  if (resultantLength >= 0.5) return "variable";
  return "dispersed";
}
