import { classifyCoverage, type CoverageTier } from "./coverageAdequacy";

/**
 * Spatial support for a boundary-sampled sea-surface-temperature mean.
 *
 * Sea surface temperature is undefined over land, so the usable share of a
 * searched place boundary is governed first by that boundary's land/water
 * split and only then by clouds and source gaps. A searched administrative
 * area (a city, a county, a region) is normally mostly land, so its SST valid
 * fraction is normally small — and the mean that comes back is the mean of the
 * water pixels that were usable, wherever in the polygon they happen to lie.
 * It is not a mean of the searched boundary.
 *
 * This module states that distinction and grades the usable share. It reuses
 * `coverageAdequacy`'s tier vocabulary so the app keeps one definition of
 * sampled completeness. A low tier is a statement about how much of the
 * boundary carried SST, never about the accuracy of the pixels that did: a
 * handful of clear water pixels can be read perfectly well. Nothing here
 * infers a coastline, distance to shore, marine biology, habitat, ecosystem
 * condition, causation, or a forecast.
 */

export type MarineBoundarySstSupportStatus =
  /** A positive, classifiable share of the boundary returned usable SST. */
  | "usable-sample"
  /** The sampler reported that no part of the boundary returned usable SST. */
  | "no-usable-sample"
  /** The sampler supplied no spatial coverage figure at all. */
  | "unreported"
  /** A coverage figure was supplied but is not a fraction in [0, 1]. */
  | "unclassifiable";

export type MarineBoundarySstSupportReason =
  "zero-usable-share" | "coverage-not-supplied" | "invalid-coverage-fraction";

export const MARINE_BOUNDARY_SST_SUPPORT_LIMITATIONS = [
  "Sea surface temperature is undefined over land, so a low usable share usually reflects a mostly-land boundary rather than a source defect.",
  "The accompanying mean averages the usable sampled pixels only; it is never a mean of the searched boundary.",
  "The usable share does not locate the sampled water within the boundary, and is not a coastline, distance to shore, or shoreline length.",
  "Tiers are descriptive bands of sampled completeness and imply no fitness threshold or accuracy claim.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

export interface MarineBoundarySstSupportSummary {
  kind: "sea-surface-temperature-boundary-support";
  /** Prevents this support record from being mistaken for biology data. */
  marineBiologyObservation: false;
  isForecast: false;
  claimScope: "descriptive-spatial-support-only";
  status: MarineBoundarySstSupportStatus;
  /** Usable share exactly as supplied; null when absent or unclassifiable. */
  validFraction: number | null;
  /** Completeness band from `coverageAdequacy`; null without a usable share. */
  tier: CoverageTier | null;
  /** What an accompanying mean averages over; null without a usable sample. */
  meanScope: "usable-sampled-pixels" | null;
  /** An SST mean never stands for the whole searched boundary, at any tier. */
  representsSearchedBoundary: false;
  /**
   * Display share that never reports a positive usable fraction as "0%".
   * A sliver of water in a large boundary rounds to zero percent, which reads
   * as "no data" beside a stated temperature.
   */
  sampledSharePhrase: string;
  reason: MarineBoundarySstSupportReason | null;
  limitations: typeof MARINE_BOUNDARY_SST_SUPPORT_LIMITATIONS;
}

/**
 * Grade the usable share of a searched boundary that returned SST. The share
 * is read verbatim from the sampler; nothing is re-sampled or estimated, and
 * an absent share stays explicitly absent rather than defaulting to zero.
 */
export function summarizeMarineBoundarySstSupport(
  validFraction: number | null | undefined
): MarineBoundarySstSupportSummary {
  const base = {
    kind: "sea-surface-temperature-boundary-support",
    marineBiologyObservation: false,
    isForecast: false,
    claimScope: "descriptive-spatial-support-only",
    representsSearchedBoundary: false,
    limitations: MARINE_BOUNDARY_SST_SUPPORT_LIMITATIONS,
  } as const;

  if (validFraction === null || validFraction === undefined) {
    return {
      ...base,
      status: "unreported",
      validFraction: null,
      tier: null,
      meanScope: null,
      sampledSharePhrase: "sampled boundary share not supplied",
      reason: "coverage-not-supplied",
    };
  }

  const tier = classifyCoverage(validFraction);
  if (tier === null) {
    return {
      ...base,
      status: "unclassifiable",
      validFraction: null,
      tier: null,
      meanScope: null,
      sampledSharePhrase: "sampled boundary share invalid",
      reason: "invalid-coverage-fraction",
    };
  }
  if (validFraction === 0) {
    return {
      ...base,
      status: "no-usable-sample",
      validFraction: 0,
      tier,
      meanScope: null,
      sampledSharePhrase: "no usable SST anywhere in the searched boundary",
      reason: "zero-usable-share",
    };
  }

  return {
    ...base,
    status: "usable-sample",
    validFraction,
    tier,
    meanScope: "usable-sampled-pixels",
    sampledSharePhrase: `usable SST over ${formatSampledShare(validFraction)} of the searched boundary (${tier})`,
    reason: null,
  };
}

/**
 * Why an empty searched boundary is not a failed retrieval — the same two-sided
 * statement `marineAveragedSstSupport` makes for its footprints, in this
 * module's vocabulary. Land is the usual reason a searched administrative area
 * returns nothing, and it is named first because that is what the limitations
 * above already commit to; the rest of the clause refuses to settle which cause
 * emptied this boundary, since `sstNoData` forbids reading a surface class out
 * of a missing value.
 */
const EMPTY_BOUNDARY_DOMAIN_CLAUSE =
  "SST is undefined over land, and cloud, ice, or source gaps also leave a searched boundary empty";

/**
 * One clause for a place readout. Keeps the usable share and the scope of the
 * mean together, so a share is never read as a boundary-wide temperature.
 *
 * A boundary that returned nothing gets the domain clause appended. Without it
 * the card asserted "no usable SST anywhere in the searched boundary" and
 * stopped, which reports the ocean product's domain boundary as a retrieval
 * failure — the same defect the probe surface carries `marineProbeDomain` to
 * correct, and the first entry of this module's own limitations. The other two
 * empty states stay bare on purpose: an unsupplied or invalid share is not a
 * report that the boundary held no water, so explaining it by the domain would
 * attribute a cause the sampler never observed.
 */
export function describeMarineBoundarySstSupport(
  summary: MarineBoundarySstSupportSummary
): string {
  if (summary.status === "no-usable-sample") {
    return `${summary.sampledSharePhrase} — ${EMPTY_BOUNDARY_DOMAIN_CLAUSE}`;
  }
  return summary.meanScope === null
    ? summary.sampledSharePhrase
    : `${summary.sampledSharePhrase}; mean covers only those pixels`;
}

/**
 * Whole percent, except that any positive share below half a percent is
 * reported as "<1%" rather than rounded down to a "0%" that would contradict
 * the temperature printed beside it.
 */
function formatSampledShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  return percent === 0 ? "<1%" : `${percent}%`;
}
