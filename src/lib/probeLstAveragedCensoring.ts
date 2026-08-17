import type { ProbeLstExtremeCensoring } from "./probeLstExtremeCensoring";

/**
 * Why the LST end-cap marks cannot see censoring in an AVERAGED footprint — a
 * drawn study region, or the ~1° area around a probed point.
 *
 * `probeLstExtremeCensoring` screens the charted series: a month whose value
 * lands in the published colormap's lowest or highest finite bin is rendered
 * with a `≤` or `≥` prefix, because every land surface beyond that bin shares
 * one colour. That screen is exact in point mode, where the charted value is a
 * MEDIAN of a tight pixel block — a median returns one of the decoded pixel
 * values, so a censored result is itself in a terminal bin and is caught.
 *
 * Area and region mode combine differently. `ProbeSampler` inverts every
 * sampled pixel on its own and then takes a cos(lat)-weighted MEAN of the
 * usable ones (`weightedMeanValid`). A mean is not one of its members. A
 * footprint holding both capped pixels and pixels the ramp resolved therefore
 * averages to a value that can sit anywhere inside the finite ramp, while still
 * carrying the cap's one-sided error: the capped pixels entered the average at
 * the bin they were collapsed into, not at the temperature they had. Screening
 * that mean finds nothing, no inequality is drawn, and a censored area mean is
 * presented as an ordinary two-sided estimate.
 *
 * The direction of the error is knowable in principle — a floor-capped pixel
 * always enters warmer than it was, a ceiling-capped pixel always cooler — but
 * its PRESENCE is not. The sampler returns one combined value and a usable
 * share per month; nothing downstream can tell a footprint with censored pixels
 * from one without. Recovering that would take a per-pixel tally of
 * terminal-bin decodes from `sampleMonth`, which the app does not collect. So
 * this module claims no direction and no magnitude, exactly as the marine
 * sibling `marineAveragedSstCensoring.ts` does for the same two-cap reason —
 * and unlike the aerosol sibling `probeAerosolAveragedCensoring.ts`, whose ramp
 * is open at one end only and which can therefore name a direction
 * conditionally.
 *
 * A land footprint reinforces that refusal rather than weakening it. This ramp
 * caps at 200.0 K and 350.0 K, and a ~1° land box can span elevation and
 * land-cover contrast large enough to hold capped pixels at BOTH ends within
 * one footprint, which a marine box of the same size effectively cannot. That
 * only removes further any basis for signing the error; it licenses no
 * inequality, and none is rendered.
 *
 * It states the one thing the reader cannot otherwise know: on an averaged
 * footprint, the absence of a mark is not evidence of an uncensored footprint.
 *
 * A censored or uncensored LST value alike remains a radiometric skin
 * temperature from a clear-sky daytime overpass, so nothing here estimates a
 * value behind a cap, locates the censored ground inside the footprint, or
 * supports any 2 m air-temperature, heat-hazard, health, ecosystem, causal, or
 * forecast claim.
 */

/**
 * Which averaged footprint the clause describes, for wording only.
 *
 * The same string union the panel already holds for the marine clause, declared
 * here rather than imported so an atmosphere module does not depend on a marine
 * one; the two are structurally identical, so the panel passes one value to
 * both.
 */
export type LstAveragedFootprint = "drawn-region" | "sampled-area";

export const PROBE_LST_AVERAGED_CENSORING_LIMITATIONS = [
  "An averaged footprint charts a weighted mean of per-pixel decodes, so a mean of capped and resolved pixels lands inside the finite ramp and the end-cap screen does not mark it.",
  "Whether any sampled pixel was censored is not recoverable from the combined value and the usable share the sampler reports, so neither presence, direction, nor magnitude is claimed.",
  "This ramp is capped at both ends and a land footprint can hold capped pixels at each, so no direction is stated even where presence is suspected.",
  "The statement applies to averaged footprints only; a point probe charts a median of a tight pixel block, which the end-cap screen already catches.",
  "Nothing here estimates a value behind a cap or locates censored ground within the footprint, and no air-temperature, heat-hazard, health, ecosystem, causal, or forecast claim follows.",
] as const;

export interface ProbeLstAveragedCensoring {
  kind: "land-surface-temperature-averaged-ramp-censoring";
  /** A colour-ramp statement about skin temperature, never about the air. */
  airTemperatureObservation: false;
  isForecast: false;
  /** False unless an averaged LST footprint returned at least one value. */
  applicable: boolean;
  /** Which averaged footprint is described; null when not applicable. */
  footprint: LstAveragedFootprint | null;
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
  limitations: typeof PROBE_LST_AVERAGED_CENSORING_LIMITATIONS;
}

/**
 * Describe what the end-cap screen could and could not see for this footprint.
 *
 * `footprint` is null for a point probe, whose median is already screened
 * exactly; `censoring` is the summary the panel already computed, so this
 * module reads the same verdict the inequalities on screen were drawn from
 * rather than re-deriving one that could disagree with them.
 */
export function summarizeProbeLstAveragedCensoring(
  footprint: LstAveragedFootprint | null | undefined,
  censoring: ProbeLstExtremeCensoring
): ProbeLstAveragedCensoring {
  const base = {
    kind: "land-surface-temperature-averaged-ramp-censoring",
    airTemperatureObservation: false,
    isForecast: false,
    pixelCensoringDetectable: false,
    boundDirectionClaimable: false,
    limitations: PROBE_LST_AVERAGED_CENSORING_LIMITATIONS,
  } as const;

  // `applicable` on the supplied summary already means "LST layer, and at least
  // one month returned a usable value", so it is not re-tested here.
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
 * non-LST layer, and a footprint that returned nothing all stay silent, so
 * every readout outside an averaged LST probe is unchanged.
 *
 * The wording splits on whether the screen marked anything, because the two
 * readings mislead differently. With no mark the whole series reads as
 * uncensored; with marks the reader is told which months are bounds, which
 * reads as a claim the rest are not.
 */
export function lstAveragedCensoringClause(
  summary: ProbeLstAveragedCensoring,
  censoring: ProbeLstExtremeCensoring
): string | null {
  if (!summary.applicable || summary.footprint === null) return null;
  const label = footprintLabel(summary.footprint);

  if (summary.markedMonthCount > 0) {
    return `those marks screen the ${label}'s monthly means, not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp, so the unmarked months are not established as uncensored`;
  }
  return `each ${label} value is a weighted mean of per-pixel decodes, so capped pixels average in with resolved ones and land inside the finite ramp — no month is marked above, but that is not evidence the ${label} held no censored pixel (source ${censoring.ramp.colormapDoc} colormap)`;
}

/**
 * The clause for an averaged LST probe, or null when it does not apply. The
 * layer test lives in the supplied `censoring` summary, which is inapplicable
 * for every layer but LST.
 */
export function averagedLstCensoringNote(
  footprint: LstAveragedFootprint | null | undefined,
  censoring: ProbeLstExtremeCensoring
): string | null {
  return lstAveragedCensoringClause(
    summarizeProbeLstAveragedCensoring(footprint, censoring),
    censoring
  );
}

/**
 * Provenance lines carrying the same qualification into the exported CSV, or an
 * empty list for a point probe, a non-LST layer, and a footprint that returned
 * nothing — those files stay byte-identical.
 *
 * The export needs this MORE than the status line does, and in the one case the
 * status line handles by staying quiet. `lstExtremeCensoringCsvHeaders` writes
 * nothing at all when no charted month landed in a terminal bin, which is the
 * ordinary outcome for an averaged footprint precisely because a mean of capped
 * and resolved pixels lands inside the finite ramp. So the download most likely
 * to hide censoring is the one that ships with no mention of it, read later by
 * someone who no longer has the panel to consult.
 *
 * When that block IS present it states a bin rule — mark a value at or below
 * the floor bin's top, or at or above the ceiling bin's base — which is exact
 * for a point probe's median and incomplete here: it screens the footprint's
 * monthly means, not the pixels behind them, so the rows it leaves unmarked are
 * not established as uncensored. The wording splits on that, because a rule the
 * reader can apply is corrected differently from a silence.
 *
 * Claims no presence, direction, or magnitude, for the reason given at the top
 * of this file, and supports no air-temperature, heat-hazard, health,
 * ecosystem, causal, or forecast statement.
 */
export function averagedLstCensoringCsvHeaders(
  footprint: LstAveragedFootprint | null | undefined,
  censoring: ProbeLstExtremeCensoring
): string[] {
  const summary = summarizeProbeLstAveragedCensoring(footprint, censoring);
  if (!summary.applicable || summary.footprint === null) return [];
  const label = footprintLabel(summary.footprint);

  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  const scope =
    summary.markedMonthCount > 0
      ? `# lst_ramp_censoring_averaged: the bin rule above screens this ${label}'s monthly means and not the pixels behind them — a mean of capped and resolved pixels lands inside the finite ramp — so rows it does not mark are not established as uncensored`
      : `# lst_ramp_censoring_averaged: every value below is an area-weighted mean of per-pixel decodes over the ${label} — a pixel the published ${censoring.ramp.colormapDoc} colormap capped averages in with resolved ones and the mean lands inside the finite ramp — so no row is flagged as a bound and that silence is not evidence the ${label} held no censored pixel`;
  return [
    scope,
    `# lst_ramp_censoring_averaged_detection: telling which months held a capped pixel would take a per-pixel tally of terminal-bin decodes that the sampler does not report — so no presence and no direction and no magnitude is stated for this ${label}`,
  ];
}

function footprintLabel(footprint: LstAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}
