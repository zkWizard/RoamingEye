import { classifyCoverage, type CoverageTier } from "./coverageAdequacy";
import {
  averagedFootprintLabel,
  type AveragedFootprint,
} from "./averagedRampCensoring";
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
 * The reported range covers the months the charted mean actually averages, so
 * each share is paired with its own month's value. A month the sampler returned
 * nothing for still reports a share — zero — and folding that zero into the
 * range put a figure in front of the words "the mean covers only those pixels"
 * that the mean does not cover: a footprint whose summers sampled 60–70% of the
 * box and whose ice-covered winters sampled none read as "0%–70%", when every
 * month behind the mean sat at the top of that span. The averaged-support
 * modules for vegetation, snow, and the GLDAS layers already pair value with
 * share this way, and `sstNativeSupportNote` beside this clause already speaks
 * "only where there is a charted mean to qualify".
 *
 * A low share is a statement about how much of the footprint carried SST,
 * never about the accuracy of the pixels that did. Nothing here infers a
 * coastline, distance to shore, water share of the box, marine biology,
 * habitat, ecosystem condition, causation, or a forecast.
 */

/** Which averaged footprint the shares describe, for wording only. */
export type MarineAveragedSstFootprint = AveragedFootprint;

export type MarineAveragedSstSupportStatus =
  /** At least one sampled month returned a positive, classifiable share. */
  | "usable-sample"
  /** Every classifiable month reported a zero usable share. */
  | "no-usable-sample"
  /**
   * A month reported a positive share but none carried a charted value, so
   * there is no mean for a range to qualify. Defensive: value and share are
   * read from the same inverted pixels, so a positive share normally implies a
   * charted value. Reported rather than folded into `no-usable-sample`, whose
   * wording would deny a usable share the sampler did report.
   */
  | "no-charted-month"
  /** No share was supplied at all (a point probe supplies none). */
  | "unreported"
  /** Shares were supplied but none was a fraction in [0, 1]. */
  | "unclassifiable";

export type MarineAveragedSstSupportReason =
  | "zero-usable-share"
  | "no-charted-value"
  | "coverage-not-supplied"
  | "invalid-coverage-fractions";

export const MARINE_AVERAGED_SST_SUPPORT_LIMITATIONS = [
  "Sea surface temperature is undefined over land, so a low usable share usually reflects a footprint that is partly land rather than a source defect.",
  "The charted mean averages the usable sampled pixels of each month only; it is never a mean of the drawn or sampled footprint.",
  "The usable share does not locate the sampled water within the footprint, and is not a coastline, distance to shore, or water-area measurement.",
  "Months are summarized as a range of usable shares over the months the charted mean averages; the range does not say which months sat at either end, gives no trend, and describes no month the sampler returned nothing for.",
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
  /**
   * Classified months that also carried a charted value — the months the
   * accompanying mean averages, and the ones the reported range covers.
   */
  chartedMonthCount: number;
  /**
   * Extremes of the shares behind the charted mean; null when none were
   * classifiable. Outside `usable-sample` these fall back to the extremes of
   * every classified share, since no mean is being qualified.
   */
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
 *
 * `values` is the same series the panel charts, index-aligned with the shares —
 * the sampler fills both arrays from one pass, so entry `i` of each describes
 * the same month. It selects which months the reported range covers and is
 * optional only so a caller holding shares alone keeps the earlier whole-series
 * behaviour rather than being told there is nothing to report; the wired probe
 * path supplies it.
 */
export function summarizeMarineAveragedSstSupport(
  footprint: MarineAveragedSstFootprint,
  validFractions: readonly (number | null | undefined)[] | null | undefined,
  values?: readonly (number | null | undefined)[] | null
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
  const label = averagedFootprintLabel(footprint);

  const supplied = validFractions ?? [];
  // Only shares `coverageAdequacy` will classify are tallied. Extremes are
  // taken over the retained values, not over their positions, so months tied
  // at either end cannot change the result by their order in the series.
  const classified: number[] = [];
  // The subset behind the charted mean. A share whose own month charted
  // nothing describes a month the mean never saw, so it grades the footprint
  // without widening the range the clause hands the reader.
  const charted: number[] = [];
  const seriesSupplied = values !== undefined && values !== null;
  for (let index = 0; index < supplied.length; index++) {
    const fraction = supplied[index];
    if (fraction === null || fraction === undefined) continue;
    if (classifyCoverage(fraction) === null) continue;
    classified.push(fraction);
    if (!seriesSupplied) {
      charted.push(fraction);
      continue;
    }
    const value = values[index];
    if (value === null || value === undefined || !Number.isFinite(value)) {
      continue;
    }
    charted.push(fraction);
  }

  if (supplied.length === 0 || classified.length === 0) {
    const unreported = supplied.length === 0;
    return {
      ...base,
      status: unreported ? "unreported" : "unclassifiable",
      classifiedMonthCount: 0,
      usableMonthCount: 0,
      chartedMonthCount: 0,
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
    chartedMonthCount: charted.length,
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

  if (charted.length === 0) {
    return {
      ...shared,
      status: "no-charted-month",
      meanScope: null,
      sampledSharePhrase: `no sampled month of the ${label} charted a value`,
      reason: "no-charted-value",
    };
  }

  // The range the clause hands the reader is the one behind the mean, so the
  // tiers beside it are re-read from these extremes rather than inherited.
  const chartedMin = Math.min(...charted);
  const chartedMax = Math.max(...charted);
  return {
    ...shared,
    status: "usable-sample",
    meanScope: "usable-sampled-pixels",
    minFraction: chartedMin,
    maxFraction: chartedMax,
    lowestTier: classifyCoverage(chartedMin),
    highestTier: classifyCoverage(chartedMax),
    sampledSharePhrase: `usable SST over ${describeShareRange(chartedMin, chartedMax)} of the ${label}`,
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
  // No charted mean, so nothing for a range to qualify — and the empty-record
  // explanation below would deny a usable share the sampler did report.
  if (summary.status === "no-charted-month") return null;
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
 *
 * Parameter order matches the vegetation, snow, and GLDAS averaged-support
 * notes, which take the charted series alongside the shares for the same
 * reason: the clause qualifies a mean, so it must be graded on the months that
 * mean was taken over.
 */
export function averagedSstSupportNote(
  layerId: LayerId,
  footprint: MarineAveragedSstFootprint,
  values: readonly (number | null | undefined)[] | null | undefined,
  validFractions: readonly (number | null | undefined)[] | null | undefined
): string | null {
  if (layerId !== "sst") return null;
  return marineAveragedSstSupportClause(
    summarizeMarineAveragedSstSupport(footprint, validFractions, values)
  );
}

function describeTierRange(summary: MarineAveragedSstSupportSummary): string {
  return summary.lowestTier === summary.highestTier
    ? `${summary.lowestTier}`
    : `${summary.lowestTier} to ${summary.highestTier}`;
}

/**
 * The span of sampled shares, collapsed to a single share when both ends print
 * the same text. Rounding makes that ordinary: a footprint whose months ran
 * 0.845 to 0.854 is not usefully described as "85%–85%", and comparing the
 * rendered ends rather than the raw fractions keeps the clause from announcing
 * a range it cannot show.
 */
function describeShareRange(minFraction: number, maxFraction: number): string {
  const min = formatSampledShare(minFraction);
  const max = formatSampledShare(maxFraction);
  return min === max ? min : `${min}–${max}`;
}

/**
 * Whole percent, except at the two ends where rounding would contradict the
 * clause it sits in.
 *
 * A positive share below half a percent reads as "<1%" rather than a "0%" that
 * would contradict the temperature printed beside it. A share of exactly zero
 * stays "0%": there the absence is real.
 *
 * Symmetrically, a share short of the whole footprint reads as ">99%" rather
 * than a "100%" that the rest of the clause immediately contradicts by saying
 * the mean covers only the usable sampled pixels. For SST the rounded claim is
 * the stronger one: this product is undefined over land, so "100% of the drawn
 * region" reports the whole footprint as open water that returned usable SST,
 * which is exactly what a rejected land, ice, or cloud pixel disproves. A large
 * footprint makes it ordinary rather than rare — a drawn region samples up to
 * 28x28 (lib/probe.ts `regionGridSize`), so one rejected cell among 784 rounds
 * to 100%. Only an exact 1 prints "100%", matching the vegetation, air
 * temperature, and GLDAS averaged-support notes, which format the same share
 * for the same sampler.
 */
function formatSampledShare(fraction: number): string {
  const percent = Math.round(fraction * 100);
  if (percent === 0 && fraction > 0) return "<1%";
  if (percent === 100 && fraction < 1) return ">99%";
  return `${percent}%`;
}
