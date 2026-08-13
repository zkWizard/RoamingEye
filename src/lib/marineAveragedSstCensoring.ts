import type { MarineAveragedSstFootprint } from "./marineAveragedSstSupport";
import type { ProbeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import type { SstRampCensoringSummary } from "./sstRampCensoring";

/**
 * Why the SST end-cap marks cannot see censoring in an AVERAGED footprint — a
 * drawn study region, the ~1° area around a probed point, or the searched
 * boundary behind a place card's mean.
 *
 * `probeSstExtremeCensoring` screens the charted series: a month whose value
 * lands in the published colormap's lowest or highest finite bin is rendered
 * with a `≤` or `≥` prefix, because every SST beyond that bin shares one
 * colour. That screen is exact in point mode, where the charted value is a
 * MEDIAN of a tight pixel block — a median returns one of the decoded pixel
 * values, so a censored result is itself in a terminal bin and is caught.
 *
 * Area and region mode combine differently, and so does the place card, whose
 * "approximate mean SST observation sampled within <place>" comes from
 * `ProbeSampler.sampleGeometryPhysical` over the searched boundary — the same
 * combiner as a drawn region. `ProbeSampler` inverts every sampled pixel on its
 * own and then takes a cos(lat)-weighted MEAN of the usable ones
 * (`weightedMeanValid`). A mean is not one of its members. A
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

/**
 * The same qualification for a SINGLE averaged value — the place card's
 * boundary mean — where there is no charted series to summarize.
 *
 * The card already reports a mean that lands in a terminal bin as a bound, and
 * `summarizeSstRampCensoring` notes that the DIRECTION of that bound is safe for
 * a mean as well as for a pixel. What neither can do is see the other way round:
 * a boundary holding both capped and resolved pixels averages to a value inside
 * the finite ramp, so the screen marks nothing and the card's silence reads as a
 * two-sided estimate. The probe already says this for its own averaged
 * footprints on both the status line and the exported CSV; the place card samples
 * the searched boundary through the same weighted mean and said nothing, so the
 * same reader met the same combiner with and without the caveat depending only on
 * which surface they opened.
 *
 * Null — no clause at all — in the three cases where the statement would not be
 * true of the printed value: no usable value to qualify, and a value outside the
 * published ramp, which was not decoded from this ramp and so carries no
 * statement about its caps.
 *
 * Claims no presence, direction, or magnitude, for the reason given at the top of
 * this file, and supports no sea-ice, marine-biology, ecosystem, habitat, hazard,
 * causal, or forecast statement.
 */
export function marineBoundaryMeanSstCensoringNote(
  censoring: SstRampCensoringSummary | null | undefined
): string | null {
  if (!censoring) return null;
  const { status, ramp } = censoring;

  if (status === "at-ramp-floor" || status === "at-ramp-ceiling") {
    // The bound printed just before this clause was read off the MEAN, so it
    // says nothing about the pixels averaged into it — and in particular does
    // not establish that an unmarked mean held none of them.
    return `that bound screens the boundary mean and not the pixels behind it — a mean of capped and resolved pixels lands inside the finite ramp, so an unmarked mean is not established as uncensored`;
  }
  if (status === "within-published-ramp") {
    return `this boundary mean is an area-weighted mean of per-pixel decodes, so a pixel the published ${ramp.colormapDoc} colormap capped averages in with resolved ones and the mean lands inside the finite ramp — no bound is marked here, but that is not evidence the boundary held no censored pixel`;
  }
  return null;
}

/**
 * Provenance lines carrying the same qualification into the exported CSV, or
 * an empty list for a point probe, a non-SST layer, and a footprint that
 * returned nothing — those files stay byte-identical.
 *
 * The export needs this MORE than the status line does, and in the one case
 * the status line handles by staying quiet. `sstExtremeCensoringCsvHeaders`
 * writes nothing at all when no charted month landed in a terminal bin, which
 * is the ordinary outcome for an averaged footprint precisely because a mean of
 * capped and resolved pixels lands inside the finite ramp. So the download most
 * likely to hide censoring is the one that ships with no mention of it, read
 * later by someone who no longer has the panel to consult.
 *
 * When that block IS present it states a bin rule — mark a value under the
 * floor bin's top, or at or above the ceiling bin's base — which is exact for a
 * point probe's median and incomplete here: it screens the footprint's monthly
 * means, not the pixels behind them, so the rows it leaves unmarked are not
 * established as uncensored. The wording splits on that, because a rule the
 * reader can apply is corrected differently from a silence.
 *
 * Claims no presence, direction, or magnitude, for the reason given at the top
 * of this file, and supports no sea-ice, marine-biology, ecosystem, habitat,
 * hazard, causal, or forecast statement.
 */
export function marineAveragedSstCensoringCsvHeaders(
  footprint: MarineAveragedSstFootprint | null | undefined,
  censoring: ProbeSstExtremeCensoring
): string[] {
  const summary = summarizeMarineAveragedSstCensoring(footprint, censoring);
  if (!summary.applicable || summary.footprint === null) return [];
  const label = footprintLabel(summary.footprint);

  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  const scope =
    summary.markedMonthCount > 0
      ? `# sst_ramp_censoring_averaged: the bin rule above screens this ${label}'s monthly means and not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp — so rows it does not mark are not established as uncensored`
      : `# sst_ramp_censoring_averaged: every value below is an area-weighted mean of per-pixel decodes over the ${label} — a pixel the published ${censoring.ramp.colormapDoc} colormap capped averages in with resolved ones and the mean lands inside the finite ramp — so no row is flagged as a bound and that silence is not evidence the ${label} held no censored pixel`;
  return [
    scope,
    `# sst_ramp_censoring_averaged_detection: telling which months held a capped pixel would take a per-pixel tally of terminal-bin decodes that the sampler does not report — so no presence and no direction and no magnitude is stated for this ${label}`,
  ];
}

function footprintLabel(footprint: MarineAveragedSstFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}
