import { classifyCoverage, type CoverageTier } from "./coverageAdequacy";
import type { LayerId } from "./timeline";

/**
 * Spatial support for an SST mean averaged over a footprint — a drawn study
 * region or the ~1° area around a probed point.
 *
 * Sea surface temperature is undefined over land, and the sampler rejects the
 * pixels the product left empty rather than averaging them in (lib/sstNoData).
 * So the number charted for a footprint that straddles a coast is the mean of
 * the water pixels that were usable, wherever in the box they happen to lie —
 * not a mean of the box the panel header names. The per-month usable share
 * already reaches the CSV as a coverage column; this module states the same
 * thing on the surface the user is actually looking at.
 *
 * `marineBoundarySstSupport` makes this statement for a single searched place
 * boundary from one month's share. This module is its series counterpart: many
 * months, one footprint, and a range rather than a point value. Both reuse
 * `coverageAdequacy`'s tiers so the app keeps one definition of sampled
 * completeness.
 *
 * A low share is a statement about how much of the footprint carried SST,
 * never about the accuracy of the pixels that did. Nothing here infers a
 * coastline, distance to shore, water share of the box, marine biology,
 * habitat, ecosystem condition, causation, or a forecast.
 */

/** Which averaged footprint the shares describe, for wording only. */
export type MarineAveragedSstFootprint = "drawn-region" | "sampled-area";

export type MarineAveragedSstSupportStatus =
  /** At least one sampled month returned a positive, classifiable share. */
  | "usable-sample"
  /** Every classifiable month reported a zero usable share. */
  | "no-usable-sample"
  /** No share was supplied at all (a point probe supplies none). */
  | "unreported"
  /** Shares were supplied but none was a fraction in [0, 1]. */
  | "unclassifiable";

export type MarineAveragedSstSupportReason =
  "zero-usable-share" | "coverage-not-supplied" | "invalid-coverage-fractions";

export const MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS = [
  "Sea surface temperature is undefined over land, so a low usable share usually reflects a footprint that is partly land rather than a source defect.",
  "The charted mean averages the usable sampled pixels of each month only; it is never a mean of the drawn or sampled footprint.",
  "The usable share does not locate the sampled water within the footprint, and is not a coastline, distance to shore, or water-area measurement.",
  "Months are summarized as a range of usable shares; the range does not say which months sat at either end, and gives no trend.",
  "Tiers are descriptive bands of sampled completeness and imply no fitness threshold or accuracy claim.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

export interface MarineAveragedSstSupportSummary {
  kind: "sea-surface-temperature-averaged-support";
  /** Prevents this support record from being mistaken for biology data. */
  marineBiologyObservation: false;
  isForecast: false;
  claimScope: "descriptive-spatial-support-only";
  footprint: MarineAveragedSstFootprint;
  status: MarineAveragedSstSupportStatus;
  /** Supplied shares that were fractions in [0, 1]. */
  classifiedMonthCount: number;
  /** Classified months whose usable share was greater than zero. */
  usableMonthCount: number;
  /** Extremes of the classified shares; null when none were classifiable. */
  minFraction: number | null;
  maxFraction: number | null;
  /** Tiers of those extremes; null when none were classifiable. */
  lowestTier: CoverageTier | null;
  highestTier: CoverageTier | null;
  /** What the accompanying mean averages over; null without a usable month. */
  meanScope: "usable-sampled-pixels" | null;
  /** An SST mean never stands for the whole footprint, at any tier. */
  representsWholeFootprint: false;
  /** Display phrase that never reports a positive share as "0%". */
  sampledSharePhrase: string;
  reason: MarineAveragedSstSupportReason | null;
  limitations: typeof MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS;
}

/**
 * Grade the usable shares a footprint returned across the charted months.
 * Shares are read verbatim from the sampler; nothing is re-sampled, estimated,
 * or defaulted, and a month whose share is absent or out of range is left out
 * of the tally rather than counted as zero.
 */
export function summarizeMarineAveragedSstSupport(
  footprint: MarineAveragedSstFootprint,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): MarineAveragedSstSupportSummary {
  const base = {
    kind: "sea-surface-temperature-averaged-support",
    marineBiologyObservation: false,
    isForecast: false,
    claimScope: "descriptive-spatial-support-only",
    footprint,
    representsWholeFootprint: false,
    limitations: MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS,
  } as const;
  const label = footprintLabel(footprint);

  const supplied = validFractions ?? [];
  // Only shares `coverageAdequacy` will classify are tallied. Extremes are
  // taken over the retained values, not over their positions, so months tied
  // at either end cannot change the result by their order in the series.
  const classified: number[] = [];
  for (const fraction of supplied) {
    if (fraction === null || fraction === undefined) continue;
    if (classifyCoverage(fraction) === null) continue;
    classified.push(fraction);
  }

  if (supplied.length === 0 || classified.length === 0) {
    const unreported = supplied.length === 0;
    return {
      ...base,
      status: unreported ? "unreported" : "unclassifiable",
      classifiedMonthCount: 0,
      usableMonthCount: 0,
      minFraction: null,
      maxFraction: null,
      lowestTier: null,
      highestTier: null,
      meanScope: null,
      sampledSharePhrase: unreported
        ? `sampled ${label} share not supplied`
        : `sampled ${label} share invalid`,
      reason: unreported
        ? "coverage-not-supplied"
        : "invalid-coverage-fractions",
    };
  }

  const minFraction = Math.min(...classified);
  const maxFraction = Math.max(...classified);
  const usableMonthCount = classified.filter((f) => f > 0).length;
  const shared = {
    ...base,
    classifiedMonthCount: classified.length,
    usableMonthCount,
    minFraction,
    maxFraction,
    // classifyCoverage returned a tier for every retained value, so these are
    // non-null; the cast-free lookup keeps that provable to the reader.
    lowestTier: classifyCoverage(minFraction),
    highestTier: classifyCoverage(maxFraction),
  };

  if (usableMonthCount === 0) {
    return {
      ...shared,
      status: "no-usable-sample",
      meanScope: null,
      sampledSharePhrase: `no usable SST anywhere in the ${label} in any sampled month`,
      reason: "zero-usable-share",
    };
  }

  return {
    ...shared,
    status: "usable-sample",
    meanScope: "usable-sampled-pixels",
    sampledSharePhrase: `usable SST over ${describeShareRange(minFraction, maxFraction)} of the ${label}`,
    reason: null,
  };
}

/**
 * One status-line clause, or null when there is nothing worth saying: a
 * footprint whose every month was fully sampled already has a mean that covers
 * it, and a probe that supplied no shares has nothing to report. Staying
 * silent in the ordinary case keeps the open-ocean readout unchanged.
 */
export function marineAveragedSstSupportClause(
  summary: MarineAveragedSstSupportSummary
): string | null {
  if (summary.status === "unreported" || summary.status === "unclassifiable") {
    return null;
  }
  if (summary.status === "no-usable-sample") {
    // Land is the usual reason, but cloud, sea ice, and missing swaths empty a
    // record too, so name the domain without claiming it caused this one.
    return `${summary.sampledSharePhrase} — SST is undefined over land, and cloud, ice, or source gaps also leave a footprint empty`;
  }
  if (summary.lowestTier === "full") return null;
  return `${summary.sampledSharePhrase} (${describeTierRange(summary)}); the mean covers only those pixels`;
}

/**
 * The clause for an averaged probe, or null when it does not apply. Only the
 * SST layer is described here: this module reasons about the ocean product's
 * domain, and the same shares mean something different for a land-only or an
 * everywhere-defined layer. A point probe passes no shares and stays silent.
 */
export function averagedSstSupportNote(
  layerId: LayerId,
  footprint: MarineAveragedSstFootprint,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "sst") return null;
  return marineAveragedSstSupportClause(
    summarizeMarineAveragedSstSupport(footprint, validFractions)
  );
}

function footprintLabel(footprint: MarineAveragedSstFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}

function describeTierRange(summary: MarineAveragedSstSupportSummary): string {
  return summary.lowestTier === summary.highestTier
    ? `${summary.lowestTier}`
    : `${summary.lowestTier} to ${summary.highestTier}`;
}

function describeShareRange(minFraction: number, maxFraction: number): string {
  return minFraction === maxFraction
    ? formatSampledShare(minFraction)
    : `${formatSampledShare(minFraction)}–${formatSampledShare(maxFraction)}`;
}

/**
 * Whole percent, except that a positive share below half a percent reads as
 * "<1%" rather than a "0%" that would contradict the temperature printed
 * beside it. A share of exactly zero stays "0%": there the absence is real.
 */
function formatSampledShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  return percent === 0 && fraction > 0 ? "<1%" : `${percent}%`;
}
