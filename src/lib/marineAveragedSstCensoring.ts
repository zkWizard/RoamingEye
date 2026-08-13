import type { MarineAveragedSstFootprint } from "./marineAveragedSstSupport";
import type { ProbeSstExtremeCensoring } from "./probeSstExtremeCensoring";

/**
 * Why the probe's SST end-cap marks cannot see censoring in an AVERAGED
 * footprint — a drawn study region, or the ~1° area around a probed point.
 *
 * `probeSstExtremeCensoring` screens the charted series: a month whose value
 * lands in the published colormap's lowest or highest finite bin is rendered
 * with a `≤` or `≥` prefix, because every SST beyond that bin shares one
 * colour. That screen is exact in point mode, where the charted value is a
 * MEDIAN of a tight pixel block — a median returns one of the decoded pixel
 * values, so a censored result is itself in a terminal bin and is caught.
 *
 * Area and region mode combine differently. `ProbeSampler` inverts every
 * sampled pixel on its own and then takes a cos(lat)-weighted MEAN of the
 * usable ones (`weightedMeanValid`). A mean is not one of its members. A
 * footprint holding both capped pixels and pixels the ramp resolved therefore
 * averages to a value that can sit anywhere inside the finite ramp, while
 * still carrying the cap's one-sided error: the capped pixels entered the
 * average at the bin they were collapsed into, not at the temperature they
 * had. Screening that mean finds nothing, no inequality is drawn, and a
 * censored area mean is presented as an ordinary two-sided estimate.
 *
 * The direction of the error is knowable in principle — a floor-capped pixel
 * always enters warmer than it was, a ceiling-capped pixel always cooler — but
 * its PRESENCE is not. The sampler returns one combined value and a usable
 * share per month; nothing downstream can tell a footprint with censored
 * pixels from one without. Recovering that would take a per-pixel tally of
 * terminal-bin decodes from `sampleMonth`, which the app does not collect. So
 * this module claims no direction and no magnitude. It states the one thing
 * the reader cannot otherwise know: on an averaged footprint, the absence of a
 * mark is not evidence of an uncensored footprint.
 *
 * The hydrology sibling `gldasRampSaturation.ts` describes the opposite
 * mechanism on the GLDAS ramp, where a saturated pixel is REJECTED rather than
 * decoded, so its footprint's mean loses exactly its wettest samples. Here the
 * capped pixel is kept and averaged in at the wrong value. Both leave an area
 * mean that reads as a measurement; neither is repairable from the imagery.
 *
 * Nothing here estimates a value behind a cap, locates the censored water
 * inside the footprint, or supports any sea-ice, habitat, marine-biology,
 * ecosystem, hazard, causal, or forecast claim.
 */

export const MARINE_AVERAGED_SST_CENSORING_LIMITATIONS = [
  "An averaged footprint charts a weighted mean of per-pixel decodes, so a mean of capped and resolved pixels lands inside the finite ramp and the end-cap screen does not mark it.",
  "Whether any sampled pixel was censored is not recoverable from the combined value and the usable share the sampler reports, so neither presence, direction, nor magnitude is claimed.",
  "The statement applies to averaged footprints only; a point probe charts a median of a tight pixel block, which the end-cap screen already catches.",
  "Nothing here estimates a value behind a cap or locates censored water within the footprint, and no sea-ice, marine-biology, ecosystem, hazard, causal, or forecast claim follows.",
] as const;

export interface MarineAveragedSstCensoring {
  kind: "sea-surface-temperature-averaged-ramp-censoring";
  /** A colour-ramp statement, never a biological one. */
  marineBiologyObservation: false;
  isForecast: false;
  /** False unless an averaged SST footprint returned at least one value. */
  applicable: boolean;
  /** Which averaged footprint is described; null when not applicable. */
  footprint: MarineAveragedSstFootprint | null;
  /** How the charted value was combined; null when not applicable. */
  combination: "area-weighted-mean-of-per-pixel-decodes" | null;
  /**
   * Charted months the end-cap screen did mark. Zero means the whole series
   * read as uncensored — the case this module exists to qualify.
   */
  markedMonthCount: number;
  /**
   * Always false: the sampler reports one combined value per month, so a
   * censored pixel inside an averaged footprint leaves no trace to detect.
   * Recovering it needs a per-pixel terminal-bin tally from the sampler.
   */
  pixelCensoringDetectable: false;
  /** Always false: presence is unknown, so no inequality can be rendered. */
  boundDirectionClaimable: false;
  limitations: typeof MARINE_AVERAGED_SST_CENSORING_LIMITATIONS;
}

/**
 * Describe what the end-cap screen could and could not see for this footprint.
 *
 * `footprint` is null for a point probe, whose median is already screened
 * exactly; `censoring` is the summary the panel already computed, so this
 * module reads the same verdict the inequalities on screen were drawn from
 * rather than re-deriving one that could disagree with them.
 */
export function summarizeMarineAveragedSstCensoring(
  footprint: MarineAveragedSstFootprint | null | undefined,
  censoring: ProbeSstExtremeCensoring
): MarineAveragedSstCensoring {
  const base = {
    kind: "sea-surface-temperature-averaged-ramp-censoring",
    marineBiologyObservation: false,
    isForecast: false,
    pixelCensoringDetectable: false,
    boundDirectionClaimable: false,
    limitations: MARINE_AVERAGED_SST_CENSORING_LIMITATIONS,
  } as const;

  // `applicable` on the supplied summary already means "SST layer, and at
  // least one month returned a usable value", so it is not re-tested here.
  if (!footprint || !censoring.applicable) {
    return {
      ...base,
      applicable: false,
      footprint: footprint ?? null,
      combination: null,
      markedMonthCount: 0,
    };
  }

  return {
    ...base,
    applicable: true,
    footprint,
    combination: "area-weighted-mean-of-per-pixel-decodes",
    markedMonthCount: censoring.floorMonthCount + censoring.ceilingMonthCount,
  };
}

/**
 * One status-line clause, or null when this does not apply — a point probe, a
 * non-SST layer, and a footprint that returned nothing all stay silent, so
 * every readout outside an averaged SST probe is unchanged.
 *
 * The wording splits on whether the screen marked anything, because the two
 * readings mislead differently. With no mark the whole series reads as
 * uncensored; with marks the reader is told which months are bounds, which
 * reads as a claim the rest are not.
 */
export function marineAveragedSstCensoringClause(
  summary: MarineAveragedSstCensoring,
  censoring: ProbeSstExtremeCensoring
): string | null {
  if (!summary.applicable || summary.footprint === null) return null;
  const label = footprintLabel(summary.footprint);

  if (summary.markedMonthCount > 0) {
    return `those marks screen the ${label}'s monthly means, not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp, so the unmarked months are not established as uncensored`;
  }
  return `each ${label} value is a weighted mean of per-pixel decodes, so capped pixels average in with resolved ones and land inside the finite ramp — no month is marked above, but that is not evidence the ${label} held no censored pixel (source ${censoring.ramp.colormapDoc} colormap)`;
}

/**
 * The clause for an averaged SST probe, or null when it does not apply. The
 * layer test lives in the supplied `censoring` summary, which is inapplicable
 * for every layer but SST.
 */
export function averagedSstCensoringNote(
  footprint: MarineAveragedSstFootprint | null | undefined,
  censoring: ProbeSstExtremeCensoring
): string | null {
  return marineAveragedSstCensoringClause(
    summarizeMarineAveragedSstCensoring(footprint, censoring),
    censoring
  );
}

function footprintLabel(footprint: MarineAveragedSstFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}
