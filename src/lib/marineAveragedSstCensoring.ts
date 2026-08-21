import type { MarineAveragedSstFootprint } from "./marineAveragedSstSupport";
import type { ProbeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import type {
  SstDifferenceBound,
  SstRampCensoringSummary,
} from "./sstRampCensoring";
import {
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  AVERAGED_RAMP_SCOPE_LIMITATION,
  AVERAGED_RAMP_UNDETECTABLE_LIMITATION,
  averagedRampCensoringClause,
  averagedRampCensoringCsvHeaders,
} from "./averagedRampCensoring";

/**
 * What the SST end-cap marks cannot see in an AVERAGED footprint — a drawn study
 * region, the ~1° area around a probed point, or the searched boundary behind a
 * place card's mean.
 *
 * The mechanism is shared with every two-cap layer and stated once in
 * `averagedRampCensoring.ts`: an averaged footprint defeats the end-cap screen,
 * so `probeSstExtremeCensoring` marks nothing and neither direction nor
 * magnitude is claimed.
 *
 * The place card is in scope for the same reason a drawn region is: its
 * "approximate mean SST observation sampled within <place>" comes from
 * `ProbeSampler.sampleGeometryPhysical` over the searched boundary, which is the
 * same combiner. That is why this module also words the boundary-mean and
 * year-over-year-difference clauses below.
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
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  AVERAGED_RAMP_UNDETECTABLE_LIMITATION,
  AVERAGED_RAMP_SCOPE_LIMITATION,
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
 * every readout outside an averaged SST probe is unchanged. Worded in
 * `averagedRampCensoring.ts`, shared with the LST sibling.
 */
export function marineAveragedSstCensoringClause(
  summary: MarineAveragedSstCensoring,
  censoring: ProbeSstExtremeCensoring
): string | null {
  if (!summary.applicable || summary.footprint === null) return null;
  return averagedRampCensoringClause(
    summary.footprint,
    summary.markedMonthCount,
    censoring.ramp.colormapDoc
  );
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
 * `differenceStatedBound` extends the same qualification to a DIFFERENCE printed
 * on the same card, and is optional because omitting it leaves every existing
 * caller's text unchanged. It matters because the card does not stop at the mean:
 * beside it the panel prints a year-over-year difference between this boundary
 * mean and the same calendar month a year earlier, and `describeSstDifferenceCensoring`
 * screens that pair by reading the two MEANS. That screen is exact for a pixel
 * and blind here for the reason above, so the whole apparatus a reader can see —
 * the `≥`/`≤` prefix, the suppressed direction, the withheld doubly-censored pair
 * — fires only when a mean itself reached a terminal bin, which averaging is what
 * prevents. Qualifying the single value while leaving the difference beside it
 * bare states the incomplete rule twice and corrects it once.
 *
 * Pass the comparison's bound when a difference is actually stated: `null` or
 * `"none"` for one carrying no inequality, `"lower"`/`"upper"` for one that does.
 * Pass nothing (or `"indeterminate"`, where the difference was withheld outright
 * and there is no claim left to qualify) for no extra clause.
 *
 * Claims no presence, direction, or magnitude, for the reason given at the top of
 * this file, and supports no sea-ice, marine-biology, ecosystem, habitat, hazard,
 * causal, or forecast statement. In particular it neither corrects a difference
 * nor withdraws its direction: the sign of what censoring did to a difference
 * needs its presence in BOTH months, which is exactly what is unrecoverable.
 */
export function marineBoundaryMeanSstCensoringNote(
  censoring: SstRampCensoringSummary | null | undefined,
  differenceStatedBound?: SstDifferenceBound | null
): string | null {
  if (!censoring) return null;
  const { status, ramp } = censoring;

  if (status === "at-ramp-floor" || status === "at-ramp-ceiling") {
    // The bound printed just before this clause was read off the MEAN, so it
    // says nothing about the pixels averaged into it — and in particular does
    // not establish that an unmarked mean held none of them.
    return `that bound screens the boundary mean and not the pixels behind it — a mean of capped and resolved pixels lands inside the finite ramp, so an unmarked mean is not established as uncensored${boundaryDifferenceClause(
      differenceStatedBound
    )}`;
  }
  if (status === "within-published-ramp") {
    return `this boundary mean is an area-weighted mean of per-pixel decodes, so a pixel the published ${ramp.colormapDoc} colormap capped averages in with resolved ones and the mean lands inside the finite ramp — no bound is marked here, but that is not evidence the boundary held no censored pixel${boundaryDifferenceClause(
      differenceStatedBound
    )}`;
  }
  return null;
}

/**
 * The trailing half-sentence carrying the mean's qualification onto a difference
 * printed beside it, or "" when no difference was stated.
 *
 * The two stated cases mislead differently, so they are worded differently. An
 * unmarked difference reads as a screened pair that came back clean; a marked one
 * reads as a screen that found what there was to find. Both were read off two
 * averaged means, and neither says anything about the pixels behind them.
 */
function boundaryDifferenceClause(
  bound: SstDifferenceBound | null | undefined
): string {
  if (bound === undefined || bound === "indeterminate") return "";
  if (bound === "lower" || bound === "upper") {
    return `; the inequality on the year-over-year difference above was read off two such means as well, so it marks only what the means themselves reached and leaves censoring inside either month's footprint undetected`;
  }
  return `; the year-over-year difference above is taken between two such means and screened by that same rule, so the absence of an inequality on it is not evidence that either month was uncensored`;
}

/**
 * The same qualification as a STANDALONE clause, for a difference of two boundary
 * means printed on its own line rather than trailing the mean's sentence.
 *
 * The place card carries two differences over the same boundary, produced by two
 * different code paths. The year-over-year one is built inside `marinePlaceInsight`
 * and is qualified by `boundaryDifferenceClause` above. The month-over-month one is
 * computed separately and appended to the card's detail by the place controller,
 * after everything `marinePlaceInsight` wrote — and it was left bare, even though
 * `describeSstDifferenceCensoring` screens it by reading the very same two averaged
 * means and is blind for the very same reason. So the card printed one difference
 * with the qualification and a second, of identical construction, without it.
 *
 * Naming only the sibling made the omission worse than silence: a reader who meets
 * a caveat that says "the year-over-year difference above" and then meets a second
 * difference with no such caveat is entitled to read the omission as a statement
 * that this one WAS screened exactly.
 *
 * The wording here is deliberately self-contained rather than shared verbatim with
 * `boundaryDifferenceClause`: that clause trails the mean's sentence and can lean on
 * it for "two such means", while this one is appended last and can reach the reader
 * with no preceding mean clause at all — the mean's note is omitted for a value that
 * fell outside the published ramp, and the change line is printed regardless. The
 * SCIENCE is one statement; only the connective differs.
 *
 * Null — no clause — when no inequality-bearing claim was made: an omitted bound, and
 * `indeterminate`, where the difference was withheld outright and nothing remains to
 * qualify. As above, this neither corrects a difference nor withdraws its direction;
 * the sign of what censoring did to a difference needs its presence in BOTH months,
 * which averaging is exactly what destroys.
 */
export function marineBoundaryMeanSstDifferenceCensoringNote(
  bound: SstDifferenceBound | null | undefined
): string | null {
  if (bound === undefined || bound === null || bound === "indeterminate") {
    return null;
  }
  if (bound === "lower" || bound === "upper") {
    return "that inequality was read off two area-weighted boundary means, so it marks only what those means themselves reached and leaves censoring inside either month's footprint undetected";
  }
  return "this change is a difference of two area-weighted boundary means, screened for the published colormap's end caps by reading those means, so the absence of an inequality on it is not evidence that either month's boundary was uncensored";
}

/**
 * Provenance lines carrying the same qualification into the exported CSV, or
 * an empty list for a point probe, a non-SST layer, and a footprint that
 * returned nothing — those files stay byte-identical. Why the export needs this
 * more than the panel does is in `averagedRampCensoring.ts`; the claim limits
 * are those at the top of this file.
 */
export function marineAveragedSstCensoringCsvHeaders(
  footprint: MarineAveragedSstFootprint | null | undefined,
  censoring: ProbeSstExtremeCensoring
): string[] {
  const summary = summarizeMarineAveragedSstCensoring(footprint, censoring);
  if (!summary.applicable || summary.footprint === null) return [];
  return averagedRampCensoringCsvHeaders(
    "sst",
    summary.footprint,
    summary.markedMonthCount,
    censoring.ramp.colormapDoc
  );
}
