import type { DatasetRef, YearMonth } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  SNOW_SEASON_CHANGE_THRESHOLD_PP,
  summarizeSnowCover,
  type SnowCoverObservation,
  type SnowCoverSummary,
} from "./snowCover";

/**
 * Season-scale progression of monthly-average snow-cover extent (cryosphere).
 *
 * `describeSnowSeasonChange` in ./snowCover.ts compares exactly two consecutive
 * months. This module extends that to an ordered run of consecutive months so a
 * probed point can be described across a whole accumulation/ablation window:
 * its net change in covered area, the peak and trough sampled extent, and the
 * *shape* of the progression (a steady rise, a rise-then-retreat, etc.).
 *
 * Like every snow helper it works on MOD10CM's monthly-average fractional
 * snow-covered-area percentage (0-100) — never depth, snow-water-equivalent,
 * melt or accumulation rate, runoff, water volume, cause, or any future value.
 * The progression is a descriptor of the sampled monthly values only: interior
 * no-data months are skipped, not interpolated, so a step between two usable
 * points may span a gap. Callers can read `usableMonths`/`observedMonths` and
 * `hasGaps` to see how completely the window was actually sampled.
 *
 * Pure, render-free logic (see snowSeason.test.ts). Provenance is inherited
 * from ./snowCover so a publication cites MOD10CM, not the picture.
 */

/**
 * Shape of a snow-cover season across the sampled months. "peak" is a rise to
 * an interior maximum followed by a retreat (accumulation then ablation);
 * "trough" is the mirror image. Boundaries between these labels use the same
 * percentage-point threshold as the month-over-month change helper so sub-bin
 * wobble is never read as a real reversal.
 */
export type SnowSeasonProgression =
  "advancing" | "retreating" | "peak" | "trough" | "steady" | "mixed";

export type SnowSeasonSeriesStatus =
  | "available"
  | "non-consecutive-months"
  | "insufficient-usable-months"
  | "unavailable";

/** A sampled month and its usable monthly-average snow-covered-area percentage. */
export interface SnowSeasonExtreme {
  dataMonth: YearMonth;
  snowCoveredPercent: number;
}

/** Extra caveats specific to reducing a run of months to one progression. */
export const SNOW_SEASON_SERIES_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "Progression describes the shape of the sampled monthly values only; interior no-data months are skipped, not interpolated.",
] as const;

export interface SnowSeasonSeries {
  kind: "observed-snow-cover-series";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SnowSeasonSeriesStatus;
  dataset: DatasetRef;
  /** One summary per supplied observation, kept in the supplied order. */
  summaries: SnowCoverSummary[];
  /** Number of supplied observations. */
  observedMonths: number;
  /** Number of those that are published with usable coverage. */
  usableMonths: number;
  /** True when some supplied month could not contribute a usable value. */
  hasGaps: boolean;
  progression: SnowSeasonProgression | null;
  /** Last usable minus first usable, in percentage points; null when N/A. */
  netChangePercentPoints: number | null;
  /** Highest sampled extent and its month, or null when no usable value. */
  peak: SnowSeasonExtreme | null;
  /** Lowest sampled extent and its month, or null when no usable value. */
  trough: SnowSeasonExtreme | null;
  /** Peak minus trough, in percentage points; null when N/A. */
  amplitudePercentPoints: number | null;
  thresholdPercentPoints: number;
  /** Short machine-readable reason when no progression is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface SnowSeasonSeriesOptions {
  /** Percentage-point band treated as flat between adjacent usable points. */
  thresholdPercentPoints?: number;
}

/**
 * Describe how monthly-average snow-covered area progresses across an ordered
 * run of consecutive months of the same MOD10CM product. The supplied months
 * must be strictly consecutive calendar months (`later` exactly one month after
 * its predecessor); the helper never spans a gap in the *supplied* sequence or
 * reorders it. Individual months may still be unpublished or cloud/darkness
 * gaps — those are dropped from the usable subsequence and flagged via
 * `hasGaps`, never invented. At least two usable months are required to report
 * a progression. The result describes change in covered area only.
 */
export function describeSnowSeasonSeries(
  observations: readonly SnowCoverObservation[],
  availableThrough: YearMonth,
  options: SnowSeasonSeriesOptions = {}
): SnowSeasonSeries {
  const summaries = observations.map((observation) =>
    summarizeSnowCover(observation, availableThrough)
  );
  const threshold =
    options.thresholdPercentPoints ?? SNOW_SEASON_CHANGE_THRESHOLD_PP;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0;

  const usable = summaries
    .filter(
      (summary): summary is SnowCoverSummary =>
        summary.snowCoveredPercent !== null
    )
    .map((summary) => ({
      dataMonth: summary.dataMonth,
      snowCoveredPercent: summary.snowCoveredPercent as number,
    }));

  const base = {
    kind: "observed-snow-cover-series" as const,
    isForecast: false as const,
    dataset: SNOW_COVER_DATASET,
    summaries,
    observedMonths: observations.length,
    usableMonths: usable.length,
    hasGaps: usable.length < observations.length,
    progression: null,
    netChangePercentPoints: null,
    peak: null,
    trough: null,
    amplitudePercentPoints: null,
    thresholdPercentPoints: validThreshold
      ? threshold
      : SNOW_SEASON_CHANGE_THRESHOLD_PP,
    limitations: SNOW_SEASON_SERIES_LIMITATIONS,
  };

  if (!validThreshold) {
    return { ...base, status: "unavailable", reason: "invalid-threshold" };
  }
  if (observations.length < 2) {
    return {
      ...base,
      status: "insufficient-usable-months",
      reason: "fewer-than-two-observations",
    };
  }
  if (!isConsecutiveRun(observations)) {
    return {
      ...base,
      status: "non-consecutive-months",
      reason: "months-not-consecutive",
    };
  }
  if (usable.length < 2) {
    return {
      ...base,
      status: "insufficient-usable-months",
      reason: "fewer-than-two-usable",
    };
  }

  const first = usable[0];
  const last = usable[usable.length - 1];
  const netChange = last.snowCoveredPercent - first.snowCoveredPercent;
  const peak = extremeBy(usable, (a, b) => a > b);
  const trough = extremeBy(usable, (a, b) => a < b);
  const amplitude = peak.snowCoveredPercent - trough.snowCoveredPercent;

  return {
    ...base,
    status: "available",
    progression: classifyProgression(usable, threshold),
    netChangePercentPoints: netChange,
    peak,
    trough,
    amplitudePercentPoints: amplitude,
    reason: null,
  };
}

/** True when each observation is exactly one calendar month after the prior. */
function isConsecutiveRun(
  observations: readonly SnowCoverObservation[]
): boolean {
  for (let i = 1; i < observations.length; i += 1) {
    const prev = observations[i - 1].dataMonth;
    const next = observations[i].dataMonth;
    if (
      !isCalendarMonth(prev) ||
      !isCalendarMonth(next) ||
      monthDistance(prev, next) !== 1
    ) {
      return false;
    }
  }
  return true;
}

/** First point whose value wins `better` against the running extreme. */
function extremeBy(
  points: readonly SnowSeasonExtreme[],
  better: (candidate: number, current: number) => boolean
): SnowSeasonExtreme {
  let best = points[0];
  for (const point of points) {
    if (better(point.snowCoveredPercent, best.snowCoveredPercent)) {
      best = point;
    }
  }
  return best;
}

/**
 * Reduce the run of usable values to a progression label. Each adjacent step is
 * classed as rising (+1), falling (-1), or flat (0) using the threshold band;
 * flats are dropped and equal signs collapsed, so the number of surviving sign
 * runs decides the shape: none = steady, one = advancing/retreating, two =
 * peak/trough, more = mixed.
 */
function classifyProgression(
  usable: readonly SnowSeasonExtreme[],
  threshold: number
): SnowSeasonProgression {
  const signs: number[] = [];
  for (let i = 1; i < usable.length; i += 1) {
    const delta =
      usable[i].snowCoveredPercent - usable[i - 1].snowCoveredPercent;
    if (Math.abs(delta) < threshold) {
      continue;
    }
    const sign = delta > 0 ? 1 : -1;
    if (signs.length === 0 || signs[signs.length - 1] !== sign) {
      signs.push(sign);
    }
  }
  if (signs.length === 0) {
    return "steady";
  }
  if (signs.length === 1) {
    return signs[0] > 0 ? "advancing" : "retreating";
  }
  if (signs.length === 2) {
    return signs[0] > 0 ? "peak" : "trough";
  }
  return "mixed";
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
