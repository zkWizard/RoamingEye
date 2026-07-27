import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first co-observed-coverage bound for a multi-signal environment
 * brief.
 *
 * `coverageAdequacy` reports each signal's *marginal* sampled coverage — the
 * share of the sampled area a single product returned. But a reader who sees
 * four "available" signals is tempted to treat them as describing the same
 * patch of ground. Whether that is fair depends on the area the signals
 * *co-observe*: the share of the sampled area where every usable signal
 * simultaneously returned data. Marginal coverage alone cannot answer this —
 * two signals each covering 60% of the area might overlap completely (60%
 * co-observed) or as little as 20%.
 *
 * The exact overlap is unknowable from the brief alone: the per-signal pixel
 * masks (which pixels each product actually filled) are not carried, only the
 * scalar coverage fractions. This module therefore reports the tightest bounds
 * those fractions permit — the Fréchet inequalities for the intersection of
 * events:
 *   - upper bound = the smallest single-signal coverage (min pᵢ): the overlap
 *     can be no larger than the least-covered signal;
 *   - lower bound = max(0, Σpᵢ − (K − 1)): the guaranteed overlap when the masks
 *     disagree as much as the marginals allow.
 * When the lower bound is 0 the signals *may share no common area at all*, even
 * though each is individually "available" — the honest counterweight to reading
 * a multi-signal brief as one co-registered snapshot.
 *
 * It composes with, and never replaces, `coverageAdequacy` (marginal share),
 * `spatialSupport` (native grid size), and the temporal `briefCoObservation`
 * (which signals share a data MONTH). Co-observed coverage is a spatial-sampling
 * bound, NOT a measure of value agreement, accuracy, fitness, or condition, and
 * it never invents the unknown overlap — it only bounds it. Every participating
 * signal keeps its source `DatasetRef`.
 */

/** One available signal that supplied a usable coverage fraction to the bound. */
export interface CoObservationMember {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  /** Marginal sampled coverage in [0, 1] this signal contributed. */
  validFraction: number;
}

/** An available signal excluded from the bound for want of a coverage fraction. */
export interface CoObservationExcluded {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  /** Honest, source-carrying sentence; no fitness or quality claim. */
  statement: string;
}

export interface CoObservedCoverageSummary {
  kind: "brief-co-observed-coverage";
  /** Available signals with a classifiable coverage fraction, in signal order. */
  members: CoObservationMember[];
  /** Available signals without a supplied coverage fraction (point-like). */
  excluded: CoObservationExcluded[];
  memberCount: number;
  /**
   * Guaranteed co-observed share — max(0, Σpᵢ − (K − 1)); the least area every
   * member must share. Null when no member supplied a fraction.
   */
  lowerBound: number | null;
  /**
   * Largest possible co-observed share — min pᵢ; the overlap cannot exceed the
   * least-covered member. Null when no member supplied a fraction.
   */
  upperBound: number | null;
  /**
   * True when 2+ members supplied a fraction and the guaranteed overlap is 0 —
   * the members may share no common area, so they cannot be assumed to describe
   * the same patch of ground.
   */
  disjointPossible: boolean;
  /**
   * True only when 2+ members supplied a fraction; below that "co-observation"
   * between signals is not a meaningful concept.
   */
  multiSignal: boolean;
  /** Honest summary sentence; a sampling bound, not a value or fitness claim. */
  statement: string;
  limits: string[];
}

const CO_OBSERVED_LIMITS = [
  "Bounds use only each signal's scalar sampled-coverage fraction; the per-signal pixel masks are not carried, so the exact co-observed area is unknown within these bounds.",
  "The upper bound is the smallest single-signal coverage; the lower bound assumes the masks disagree as much as the marginals allow.",
  "Co-observed area is a spatial-sampling bound, not a measure of value agreement, accuracy, fitness, or condition.",
];

/**
 * Bound the fraction of the sampled area co-observed by every usable signal of
 * a composed brief. Only `available` signals that supplied a classifiable
 * coverage fraction participate; `available` signals whose sampler gave no
 * fraction (e.g. a point sample) are listed separately so provenance is kept
 * without inventing a coverage figure, and non-available signals are ignored.
 */
export function summarizeCoObservedCoverage(
  signals: EnvironmentSignalBrief[]
): CoObservedCoverageSummary {
  const members: CoObservationMember[] = [];
  const excluded: CoObservationExcluded[] = [];

  for (const signal of signals) {
    if (signal.status !== "available") continue;
    const fraction = signal.coverage.validFraction;
    if (fraction === null || !isFraction(fraction)) {
      excluded.push({
        id: signal.id,
        label: signal.label,
        source: signal.source,
        statement: `${signal.label}: available, but supplied no usable spatial coverage fraction; excluded from the co-observed bound; source ${sourceLabel(signal.source)}.`,
      });
      continue;
    }
    members.push({
      id: signal.id,
      label: signal.label,
      source: signal.source,
      validFraction: fraction,
    });
  }

  const memberCount = members.length;
  const fractions = members.map((m) => m.validFraction);
  const upperBound = fractions.length ? Math.min(...fractions) : null;
  // Fréchet lower bound of an intersection; may be negative before clamping.
  const rawLower = fractions.length
    ? sum(fractions) - (fractions.length - 1)
    : null;
  const lowerBound = rawLower === null ? null : Math.max(0, rawLower);
  const multiSignal = memberCount >= 2;
  // Treat a near-zero raw lower bound as disjoint-possible so floating-point
  // noise never hides a genuine "may not overlap" case.
  const disjointPossible =
    multiSignal && rawLower !== null && rawLower <= FRACTION_EPSILON;

  return {
    kind: "brief-co-observed-coverage",
    members,
    excluded,
    memberCount,
    lowerBound,
    upperBound,
    disjointPossible,
    multiSignal,
    statement: coObservedStatement({
      memberCount,
      excludedCount: excluded.length,
      lowerBound,
      upperBound,
      multiSignal,
      disjointPossible,
    }),
    limits: CO_OBSERVED_LIMITS,
  };
}

/** Tolerance for treating a raw lower bound as zero (guards float rounding). */
const FRACTION_EPSILON = 1e-9;

function coObservedStatement(summary: {
  memberCount: number;
  excludedCount: number;
  lowerBound: number | null;
  upperBound: number | null;
  multiSignal: boolean;
  disjointPossible: boolean;
}): string {
  const withoutPhrase =
    summary.excludedCount > 0
      ? ` ${summary.excludedCount} more available without a supplied fraction, excluded from the bound.`
      : "";

  if (summary.memberCount === 0) {
    if (summary.excludedCount === 0) {
      return "No available observations with a supplied coverage fraction; co-observed area cannot be bounded.";
    }
    const noun = summary.excludedCount === 1 ? "observation" : "observations";
    return `${summary.excludedCount} available ${noun}, none with a supplied coverage fraction; co-observed area cannot be bounded.`;
  }

  if (!summary.multiSignal) {
    // One member: the intersection over a single set is its own coverage, and
    // cross-signal co-observation is not a meaningful concept.
    return `1 available observation with ${formatPercent(summary.upperBound as number)} sampled coverage; co-observation needs 2+ signals, so no cross-signal overlap is bounded.${withoutPhrase}`;
  }

  const low = formatPercent(summary.lowerBound as number);
  const high = formatPercent(summary.upperBound as number);
  const overlapPhrase =
    summary.lowerBound === summary.upperBound
      ? `exactly ${low}`
      : `between ${low} and ${high}`;
  const disjointPhrase = summary.disjointPossible
    ? " The guaranteed overlap is 0%: the signals may share no common area, so they cannot be assumed to describe the same patch of ground."
    : "";
  return `${summary.memberCount} available observations co-observe ${overlapPhrase} of the sampled area (Fréchet bounds; exact overlap unknown without pixel masks).${disjointPhrase}${withoutPhrase}`;
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}

function isFraction(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
