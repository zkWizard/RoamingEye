import type { MonthlyClimateSummary } from "./climate";
import { classifyCoverage, type CoverageTier } from "./coverageAdequacy";

/**
 * Provenance-first bound on the sampled area two climate months have in common.
 *
 * The place readout differences two monthly observations of one region ("+1.2 K
 * vs 2026-01"). Each month's value is an area aggregate over that month's
 * *usable* pixels only — the place sampler reports that share as the month's
 * `validFraction` and aggregates nothing else. So when the two months' usable
 * shares differ, part of the difference is a change in which ground was
 * aggregated, not a change in the atmosphere over fixed ground.
 *
 * How much ground the two months actually share is unknowable from the readout:
 * only the scalar coverage fractions survive sampling, never the per-month pixel
 * masks. This module therefore reports the tightest bounds those two scalars
 * permit — the Fréchet inequalities for the intersection of two events:
 *   - upper bound = min(p_earlier, p_later): the common area can be no larger
 *     than the less-covered month;
 *   - lower bound = max(0, p_earlier + p_later − 1): the guaranteed common area
 *     when the two masks disagree as much as the marginals allow.
 * A zero lower bound is the honest warning: two months each "available" at 50%
 * coverage may share no ground at all, and their difference cannot then be read
 * as a change over one place.
 *
 * This is the *temporal* counterpart of `coObservedCoverage`, which bounds
 * the area several signals co-observe within one month; the mathematics is the
 * same, the question is not. It composes with, and never replaces, the marginal
 * per-month coverage already stated by `coverageAdequacy`. The bound describes
 * spatial sampling only: it is not a measure of value accuracy, agreement, or
 * significance, and it never converts a difference into an anomaly, trend,
 * cause, or forecast.
 */

export type ClimateChangeSupportStatus =
  /** Both months supplied coverage and a positive common area is guaranteed. */
  | "bounded"
  /** Both months supplied coverage but the guaranteed common area is zero. */
  | "possibly-disjoint"
  /** The bound cannot be computed; see `reason`. */
  | "unknown";

/**
 * Guaranteed common areas at or below this share are reported as zero. The
 * bound is a difference of floating-point fractions, so an exactly-touching
 * pair (0.5 and 0.5) can compute as ~1e-16 — arithmetic noise must not be
 * presented as a positive guarantee of shared ground.
 */
const SHARED_AREA_EPSILON = 1e-9;

/**
 * How close a scaled fraction must sit to a whole percent to be treated as
 * exactly that percent before a bound is rounded. Binary representation error
 * puts 0.29 × 100 at 28.999…, and directed rounding would otherwise push an
 * exact 29% share onto the neighbouring percent.
 */
const PERCENT_SNAP_EPSILON = 1e-9;

export const CLIMATE_CHANGE_SUPPORT_LIMITATIONS = [
  "The bound is derived from the two months' scalar coverage fractions alone; the per-month pixel masks are not carried, so the true common area is unknown within these bounds.",
  "Coverage is spatial-sampling completeness, not value accuracy: a fully covered month can still carry the source product's bias.",
  "A guaranteed common area does not make the difference an anomaly, trend, cause, or forecast — it remains the plain difference of two monthly values.",
  "Bounds are stated to the whole percent and rounded outward — the guarantee down, the ceiling up — so the printed interval can be up to a percent wider than the coverage fractions require, never narrower.",
] as const;

export interface ClimateChangeSupport {
  kind: "month-over-month-shared-coverage-bound";
  status: ClimateChangeSupportStatus;
  /** Why no bound could be computed; null whenever one was. */
  reason: string | null;
  /** Usable sampled share of each month, or null when it was not supplied. */
  earlierFraction: number | null;
  laterFraction: number | null;
  /** max(0, p_earlier + p_later − 1); null when unbounded. */
  guaranteedSharedFraction: number | null;
  /** min(p_earlier, p_later); null when unbounded. */
  maximumSharedFraction: number | null;
  /** Completeness tier of the *guaranteed* share, using the shared bands. */
  tier: CoverageTier | null;
  /** Compact clause for the place readout; null when nothing can be stated. */
  statement: string | null;
  limitations: readonly string[];
}

/**
 * Bound the sampled area two monthly climate observations have in common.
 *
 * Both months must be usable published observations — an unavailable month is
 * never differenced, so bounding its overlap would describe a comparison that
 * is not made. Either month omitting a coverage fraction (a point sample, for
 * example) leaves the overlap unbounded rather than assumed complete.
 */
export function monthOverMonthCoverageSupport(
  earlier: MonthlyClimateSummary,
  later: MonthlyClimateSummary
): ClimateChangeSupport {
  if (!isUsable(earlier) || !isUsable(later)) {
    return unbounded("no usable pair of published observations", null, null);
  }

  const earlierFraction = earlier.coverage.validFraction;
  const laterFraction = later.coverage.validFraction;
  if (earlierFraction === null || laterFraction === null) {
    return unbounded(
      "coverage not supplied for both months",
      earlierFraction,
      laterFraction
    );
  }
  if (!isFraction(earlierFraction) || !isFraction(laterFraction)) {
    // climate.ts already rejects out-of-range coverage, so this is a guard
    // against a future caller constructing a summary by hand.
    return unbounded("coverage fraction out of range", null, null);
  }

  const maximumSharedFraction = Math.min(earlierFraction, laterFraction);
  const raw = earlierFraction + laterFraction - 1;
  // The lower bound can float above the upper one when a month is fully
  // covered: 0.834 + 1 − 1 evaluates to 0.8340000000000001, just past the
  // min() ceiling of 0.834. A guarantee larger than the maximum it sits under
  // is not a bound at all — it describes an empty interval to any consumer
  // comparing the two — so it is clamped to the ceiling it can never exceed.
  const guaranteedSharedFraction =
    raw > SHARED_AREA_EPSILON ? Math.min(raw, maximumSharedFraction) : 0;

  return {
    kind: "month-over-month-shared-coverage-bound",
    status: guaranteedSharedFraction > 0 ? "bounded" : "possibly-disjoint",
    reason: null,
    earlierFraction,
    laterFraction,
    guaranteedSharedFraction,
    maximumSharedFraction,
    tier: classifyCoverage(guaranteedSharedFraction),
    statement: statementFor(guaranteedSharedFraction, maximumSharedFraction),
    limitations: CLIMATE_CHANGE_SUPPORT_LIMITATIONS,
  };
}

function statementFor(guaranteed: number, maximum: number): string {
  if (guaranteed === 0) {
    return `the two months may share no common sampled area; at most ${formatAtMost(
      maximum
    )} can overlap`;
  }
  if (wholePercent(guaranteed, "down") === 0) {
    // A real but sub-percent guarantee is not the disjoint case, and "at least
    // 0%" would read as exactly that. State the guarantee in its own words.
    // The floor is what decides this: a 0.7% guarantee rounds to the nearest
    // "1%", and printing "at least 1%" would inflate it by nearly half.
    return `under 1% of the sampled area is guaranteed common to both months; at most ${formatAtMost(
      maximum
    )} can overlap`;
  }
  if (guaranteed === maximum) {
    // The bounds coincide, so the common area is known rather than bracketed;
    // nearest-percent rounding is right for a point value. The one exception is
    // an incomplete share that rounds to a flat "100%" — that would state the
    // complete-overlap case this bound exists to distinguish.
    if (guaranteed < 1 && Math.round(guaranteed * 100) >= 100) {
      return "all but under 1% of the sampled area is common to both months";
    }
    return `exactly ${Math.round(
      guaranteed * 100
    )}% of the sampled area is common to both months`;
  }
  return `at least ${formatAtLeast(guaranteed)} and at most ${formatAtMost(
    maximum
  )} of the sampled area is common to both months`;
}

function unbounded(
  reason: string,
  earlierFraction: number | null,
  laterFraction: number | null
): ClimateChangeSupport {
  return {
    kind: "month-over-month-shared-coverage-bound",
    status: "unknown",
    reason,
    earlierFraction,
    laterFraction,
    guaranteedSharedFraction: null,
    maximumSharedFraction: null,
    tier: null,
    statement: null,
    limitations: CLIMATE_CHANGE_SUPPORT_LIMITATIONS,
  };
}

function isUsable(summary: MonthlyClimateSummary): boolean {
  return (
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.observedValue !== null
  );
}

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

/**
 * Round a bound to a whole percent in the direction that keeps it true.
 *
 * Percentages are rounded for reading, but a bound rounded to the nearest
 * percent stops being a bound: two months each covering 99.8% guarantee 99.6%
 * common ground, and "at least 100%" claims the complete overlap the coverage
 * never established — the very reading this module exists to refuse. Rounding a
 * lower bound down and an upper bound up keeps both sides honest, at the cost of
 * an interval up to a percent wider than the fractions strictly require.
 *
 * A fraction already sitting on a whole percent is snapped to it first, so
 * representation error never widens an exact share (see
 * {@link PERCENT_SNAP_EPSILON}).
 */
function wholePercent(fraction: number, direction: "down" | "up"): number {
  const scaled = fraction * 100;
  const nearest = Math.round(scaled);
  if (Math.abs(scaled - nearest) < PERCENT_SNAP_EPSILON) return nearest;
  return direction === "down" ? Math.floor(scaled) : Math.ceil(scaled);
}

/** A guaranteed share never rounds up: "at least" has to stay true. */
function formatAtLeast(fraction: number): string {
  return `${wholePercent(fraction, "down")}%`;
}

/** A ceiling never rounds down: "at most" has to stay true. */
function formatAtMost(fraction: number): string {
  return `${wholePercent(fraction, "up")}%`;
}
