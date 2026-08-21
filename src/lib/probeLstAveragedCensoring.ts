import type { ProbeLstExtremeCensoring } from "./probeLstExtremeCensoring";
import {
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  AVERAGED_RAMP_SCOPE_LIMITATION,
  AVERAGED_RAMP_UNDETECTABLE_LIMITATION,
  averagedRampCensoringClause,
  averagedRampCensoringCsvHeaders,
  type AveragedFootprint,
} from "./averagedRampCensoring";

/**
 * What the LST end-cap marks cannot see in an AVERAGED footprint — a drawn study
 * region, or the ~1° area around a probed point.
 *
 * The mechanism is shared with every two-cap layer and stated once in
 * `averagedRampCensoring.ts`: an averaged footprint defeats the end-cap screen,
 * so `probeLstExtremeCensoring` marks nothing and neither direction nor
 * magnitude is claimed.
 *
 * A land footprint reinforces that refusal rather than weakening it. This ramp
 * caps at 200.0 K and 350.0 K, and a ~1° land box can span elevation and
 * land-cover contrast large enough to hold capped pixels at BOTH ends within
 * one footprint, which a marine box of the same size effectively cannot. That
 * only removes further any basis for signing the error; it licenses no
 * inequality, and none is rendered.
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
 * Aliases the shared union so an atmosphere module and a marine one can agree on
 * the value the panel passes to both without either depending on the other.
 */
export type LstAveragedFootprint = AveragedFootprint;

export const PROBE_LST_AVERAGED_CENSORING_LIMITATIONS = [
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  AVERAGED_RAMP_UNDETECTABLE_LIMITATION,
  "This ramp is capped at both ends and a land footprint can hold capped pixels at each, so no direction is stated even where presence is suspected.",
  AVERAGED_RAMP_SCOPE_LIMITATION,
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
 * every readout outside an averaged LST probe is unchanged. Worded in
 * `averagedRampCensoring.ts`, shared with the marine sibling.
 */
export function lstAveragedCensoringClause(
  summary: ProbeLstAveragedCensoring,
  censoring: ProbeLstExtremeCensoring
): string | null {
  if (!summary.applicable || summary.footprint === null) return null;
  return averagedRampCensoringClause(
    summary.footprint,
    summary.markedMonthCount,
    censoring.ramp.colormapDoc
  );
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
 * nothing — those files stay byte-identical. Why the export needs this more than
 * the panel does is in `averagedRampCensoring.ts`; the claim limits are those at
 * the top of this file.
 */
export function averagedLstCensoringCsvHeaders(
  footprint: LstAveragedFootprint | null | undefined,
  censoring: ProbeLstExtremeCensoring
): string[] {
  const summary = summarizeProbeLstAveragedCensoring(footprint, censoring);
  if (!summary.applicable || summary.footprint === null) return [];
  return averagedRampCensoringCsvHeaders(
    "lst",
    summary.footprint,
    summary.markedMonthCount,
    censoring.ramp.colormapDoc
  );
}
