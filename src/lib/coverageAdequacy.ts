import type {
  EnvironmentSignalBrief,
  EnvironmentSignalId,
} from "./environmentBrief";
import type { DatasetRef } from "./timeline";

/**
 * Provenance-first spatial-coverage (sampling completeness) descriptor.
 *
 * When the environment brief samples an area rather than a single point, each
 * signal reports the fraction of that area that returned usable data — its
 * `validFraction`. This module states, per available observation, what share of
 * the sampled area was usable and buckets that share into a neutral, purely
 * descriptive completeness tier.
 *
 * It answers "how much of the sampled area returned data?" and nothing more.
 * Coverage is a spatial-sampling completeness figure, NOT a measure of value
 * accuracy, fitness, risk, or reliability: a partly-cloudy month can still be a
 * perfectly accurate reading of the pixels that were clear. Every observation
 * keeps its source `DatasetRef`. This is deliberately distinct from — and
 * composes with — the brief's completeness tally (how many signals are
 * present?), its cross-signal temporal spread (are the signals synchronized?),
 * and its recency descriptor (how current is each one?); adequacy is about the
 * usable spatial share of the observations that ARE present, a different axis
 * from count, timing, or currency.
 */

export type CoverageTier =
  /** ≥ 99% of the sampled area returned usable data. */
  | "full"
  /** 75–99% of the sampled area returned usable data. */
  | "substantial"
  /** 40–75% of the sampled area returned usable data. */
  | "partial"
  /** < 40% of the sampled area returned usable data. */
  | "sparse";

/**
 * Descending sampled-share thresholds. A fraction is placed in the first tier
 * whose `min` it meets. Bands are descriptive only and imply no fitness cutoff.
 */
export const COVERAGE_TIERS: readonly { tier: CoverageTier; min: number }[] = [
  { tier: "full", min: 0.99 },
  { tier: "substantial", min: 0.75 },
  { tier: "partial", min: 0.4 },
  { tier: "sparse", min: 0 },
];

const TIER_ORDER: readonly CoverageTier[] = COVERAGE_TIERS.map((t) => t.tier);

/** Provenance kept for an available signal that supplied no coverage fraction. */
export interface UnreportedCoverage {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  /** Honest, source-carrying sentence; no fitness or quality claim. */
  statement: string;
}

export interface SignalCoverageAdequacy {
  id: EnvironmentSignalId;
  label: string;
  source: DatasetRef;
  /** Usable share of the sampled area, in [0, 1]. */
  validFraction: number;
  tier: CoverageTier;
  /** Honest, source-carrying sentence; no fitness or quality claim. */
  statement: string;
}

export interface CoverageAdequacySummary {
  kind: "environment-coverage-adequacy";
  /** Available signals that supplied a classifiable coverage fraction. */
  reported: SignalCoverageAdequacy[];
  /** Available signals whose sampler gave no spatial coverage (point-like). */
  unreported: UnreportedCoverage[];
  reportedCount: number;
  /** Lowest / highest reported sampled share; null when none were reported. */
  minFraction: number | null;
  maxFraction: number | null;
  /** Count of reported signals in each tier (zeros included). */
  tierCounts: Record<CoverageTier, number>;
  /** Honest summary sentence; coverage is sampling completeness, not fitness. */
  statement: string;
  limits: string[];
}

const COVERAGE_LIMITS = [
  "Coverage is the usable share of the sampled area, not a measure of value accuracy.",
  "Only available observations that supplied a spatial coverage fraction are tallied.",
  "Tiers are descriptive bands of sampled completeness and imply no fitness threshold.",
];

/**
 * Bucket a usable-area fraction into a neutral completeness tier. Returns null
 * for a non-finite fraction or one outside [0, 1] — an unclassifiable input
 * must never be silently placed in a tier.
 */
export function classifyCoverage(fraction: number): CoverageTier | null {
  if (!Number.isFinite(fraction) || fraction < 0 || fraction > 1) return null;
  for (const { tier, min } of COVERAGE_TIERS) {
    if (fraction >= min) return tier;
  }
  return "sparse";
}

/**
 * Describe the spatial-sampling completeness of a composed brief's signals.
 * Only `available` signals carry a meaningful usable-area share; among those,
 * signals that supplied a classifiable fraction are reported and tiered, while
 * signals whose sampler gave no fraction (e.g. a point sample) are listed
 * separately so provenance is preserved without inventing a coverage figure.
 */
export function summarizeCoverageAdequacy(
  signals: EnvironmentSignalBrief[]
): CoverageAdequacySummary {
  const reported: SignalCoverageAdequacy[] = [];
  const unreported: UnreportedCoverage[] = [];

  for (const signal of signals) {
    if (signal.status !== "available") continue;
    const fraction = signal.coverage.validFraction;
    const tier = fraction === null ? null : classifyCoverage(fraction);
    if (fraction === null || tier === null) {
      unreported.push({
        id: signal.id,
        label: signal.label,
        source: signal.source,
        statement: `${signal.label}: available, but the sampler supplied no spatial coverage fraction; source ${sourceLabel(signal.source)}.`,
      });
      continue;
    }
    reported.push({
      id: signal.id,
      label: signal.label,
      source: signal.source,
      validFraction: fraction,
      tier,
      statement: `${signal.label}: ${formatPercent(fraction)} of the sampled area returned usable data (${tier}); source ${sourceLabel(signal.source)}.`,
    });
  }

  const tierCounts = countTiers(reported);
  const fractions = reported.map((r) => r.validFraction);
  const minFraction = fractions.length ? Math.min(...fractions) : null;
  const maxFraction = fractions.length ? Math.max(...fractions) : null;

  return {
    kind: "environment-coverage-adequacy",
    reported,
    unreported,
    reportedCount: reported.length,
    minFraction,
    maxFraction,
    tierCounts,
    statement: summaryStatement(
      reported.length,
      unreported.length,
      minFraction,
      maxFraction,
      tierCounts
    ),
    limits: COVERAGE_LIMITS,
  };
}

function countTiers(
  reported: SignalCoverageAdequacy[]
): Record<CoverageTier, number> {
  const counts: Record<CoverageTier, number> = {
    full: 0,
    substantial: 0,
    partial: 0,
    sparse: 0,
  };
  for (const signal of reported) counts[signal.tier] += 1;
  return counts;
}

function summaryStatement(
  reportedCount: number,
  unreportedCount: number,
  minFraction: number | null,
  maxFraction: number | null,
  tierCounts: Record<CoverageTier, number>
): string {
  if (reportedCount === 0) {
    if (unreportedCount === 0) {
      return "No available observations to assess for spatial coverage.";
    }
    const noun = unreportedCount === 1 ? "observation" : "observations";
    return `${unreportedCount} available ${noun}, none with a supplied spatial coverage fraction; adequacy cannot be tallied.`;
  }

  const noun =
    reportedCount === 1 ? "observation reports" : "observations report";
  const sharePhrase =
    minFraction === maxFraction
      ? `${formatPercent(minFraction as number)} sampled coverage`
      : `${formatPercent(minFraction as number)}–${formatPercent(maxFraction as number)} sampled coverage`;
  const withoutPhrase =
    unreportedCount > 0
      ? ` ${unreportedCount} more available without a supplied fraction.`
      : "";
  return `${reportedCount} available ${noun} ${sharePhrase} (${tierBreakdown(tierCounts)}); coverage is the usable share of the sampled area, not a data-quality score.${withoutPhrase}`;
}

/** Non-zero tier counts in descending-completeness order, e.g. "2 full, 1 partial". */
function tierBreakdown(tierCounts: Record<CoverageTier, number>): string {
  const parts = TIER_ORDER.filter((tier) => tierCounts[tier] > 0).map(
    (tier) => `${tierCounts[tier]} ${tier}`
  );
  return parts.join(", ");
}

function formatPercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}
