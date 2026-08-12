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

export const CLIMATE_CHANGE_SUPPORT_LIMITATIONS = [
  "The bound is derived from the two months' scalar coverage fractions alone; the per-month pixel masks are not carried, so the true common area is unknown within these bounds.",
  "Coverage is spatial-sampling completeness, not value accuracy: a fully covered month can still carry the source product's bias.",
  "A guaranteed common area does not make the difference an anomaly, trend, cause, or forecast — it remains the plain difference of two monthly values.",
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
  const guaranteedSharedFraction = raw > SHARED_AREA_EPSILON ? raw : 0;

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
    return `the two months may share no common sampled area; at most ${formatPercent(
      maximum
    )} can overlap`;
  }
  if (Math.round(guaranteed * 100) === 0) {
    // A real but sub-percent guarantee is not the disjoint case, and "at least
    // 0%" would read as exactly that. State the guarantee in its own words.
    return `under 1% of the sampled area is guaranteed common to both months; at most ${formatPercent(
      maximum
    )} can overlap`;
  }
  if (guaranteed === maximum) {
    return `exactly ${formatPercent(
      guaranteed
    )} of the sampled area is common to both months`;
  }
  return `at least ${formatPercent(guaranteed)} and at most ${formatPercent(
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
 * Percentages are rounded for reading, but a positive share must never round
 * down to a flat "0%" — that would restate a real overlap as the disjoint case
 * the status deliberately distinguishes.
 */
function formatPercent(fraction: number): string {
  const rounded = Math.round(fraction * 100);
  if (rounded === 0 && fraction > 0) return "<1%";
  return `${rounded}%`;
}
