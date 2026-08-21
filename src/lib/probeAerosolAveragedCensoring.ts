import { COLORMAP_DOCS } from "./colormap";
import {
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  AVERAGED_RAMP_SCOPE_LIMITATION,
  averagedFootprintLabel,
  type AveragedFootprint,
} from "./averagedRampCensoring";
import type { ProbeAerosolCeilingCensoring } from "./probeAerosolCeilingCensoring";

/**
 * Why the aerosol end-cap marks cannot see censoring in an AVERAGED footprint —
 * a drawn study region, or the ~1° area around a probed point.
 *
 * The averaging mechanism is the one stated once in `averagedRampCensoring.ts`:
 * `probeAerosolCeilingCensoring` marks a month decoded at or above the ramp's
 * open top bin (`≥ 0.900` at 550 nm), which is exact for a point probe's median
 * but blind on a weighted mean of per-pixel decodes.
 *
 * Two things make this WORSE here than for the marine sibling
 * (`marineAveragedSstCensoring.ts`), and both are stated in the clause:
 *
 * 1. Averaging dilutes the very signal the cap marks. The columns that reach
 *    0.9 are dust outbreaks and biomass-burning plumes, and a plume is routinely
 *    narrower than a drawn region — so the larger the footprint, the further the
 *    regional mean falls below the cap while capped pixels are still inside it.
 *    A `≥` mark surviving into an averaged series means the WHOLE footprint
 *    averaged past the ceiling, which is a far rarer event than a capped pixel.
 *    So the marks that do appear undercount, and their absence says less the
 *    bigger the box.
 *
 * 2. The DIRECTION of the resulting error is knowable, unlike a two-cap layer's.
 *    This ramp is open at one end only — the low end is closed at 0 and column
 *    AOD cannot be negative — so a capped pixel always enters the average BELOW
 *    the loading it had. If any was capped, the footprint's mean understates the
 *    true mean: a statement about direction conditional on presence, and the
 *    strongest thing that can honestly be said.
 *
 * What stays unknowable is PRESENCE, for the reason given in
 * `averagedRampCensoring.ts`. So no inequality is rendered on any number and no
 * magnitude is claimed — only that on an averaged footprint the absence of a
 * mark is not evidence of an uncensored footprint, and that any censoring it
 * hides biases the value one way.
 *
 * Nothing here estimates the loading behind a cap, locates the censored pixels
 * inside the footprint, or supports any surface air-quality, health, exposure,
 * hazard, causal, or forecast claim.
 */

/**
 * Which averaged footprint the clause describes, for wording only.
 *
 * Aliases the shared union so an atmosphere module and a marine one can agree on
 * the value the panel passes to both without either depending on the other.
 */
export type AerosolAveragedFootprint = AveragedFootprint;

export const PROBE_AEROSOL_AVERAGED_CENSORING_LIMITATIONS = [
  AVERAGED_RAMP_MEAN_DEFEATS_SCREEN_LIMITATION,
  "Whether any sampled pixel was capped is not recoverable from the combined value and the usable share the sampler reports, so no presence and no magnitude is claimed and no inequality is rendered.",
  "The direction is knowable if a capped pixel is present: this ramp is open at its top only, so a capped pixel always averages in below its true loading and the footprint mean understates.",
  "Marks that do survive into an averaged series undercount the censoring, because a plume narrower than the footprint is diluted below the cap while its own pixels remain capped.",
  AVERAGED_RAMP_SCOPE_LIMITATION,
  "Nothing here estimates the loading behind a cap or locates capped pixels within the footprint, and no surface air-quality, health, exposure, hazard, causal, or forecast claim follows.",
] as const;

export interface ProbeAerosolAveragedCensoring {
  kind: "probe-aerosol-averaged-ceiling-censoring";
  /** A colour-ramp statement, never a surface air-quality one. */
  airQualityObservation: false;
  isForecast: false;
  /** False unless an averaged aerosol footprint returned at least one value. */
  applicable: boolean;
  /** Which averaged footprint is described; null when not applicable. */
  footprint: AerosolAveragedFootprint | null;
  /** How the charted value was combined; null when not applicable. */
  combination: "area-weighted-mean-of-per-pixel-decodes" | null;
  /**
   * Charted months the end-cap screen did mark. Zero means the whole series
   * read as uncensored — the case this module exists to qualify.
   */
  markedMonthCount: number;
  /**
   * Always false: the sampler reports one combined value per month, so a capped
   * pixel inside an averaged footprint leaves no trace to detect. Recovering it
   * needs a per-pixel terminal-bin tally the sampler does not report.
   */
  pixelCensoringDetectable: false;
  /** Always false: presence is unknown, so no inequality can be rendered. */
  boundMarkClaimable: false;
  /**
   * Which way an averaged value is wrong IF it hid a capped pixel — always
   * "understates" while applicable, because this ramp is open at one end only.
   * Null when not applicable. Conditional on a presence that is not detectable,
   * so it never licenses a bound on the printed number.
   */
  biasDirectionIfPresent: "understates" | null;
  limitations: typeof PROBE_AEROSOL_AVERAGED_CENSORING_LIMITATIONS;
}

/**
 * Describe what the end-cap screen could and could not see for this footprint.
 *
 * `footprint` is null for a point probe, whose median is already screened
 * exactly; `censoring` is the summary the panel already computed, so this module
 * reads the same verdict the inequalities on screen were drawn from rather than
 * re-deriving one that could disagree with them.
 */
export function summarizeProbeAerosolAveragedCensoring(
  footprint: AerosolAveragedFootprint | null | undefined,
  censoring: ProbeAerosolCeilingCensoring
): ProbeAerosolAveragedCensoring {
  const base = {
    kind: "probe-aerosol-averaged-ceiling-censoring",
    airQualityObservation: false,
    isForecast: false,
    pixelCensoringDetectable: false,
    boundMarkClaimable: false,
    limitations: PROBE_AEROSOL_AVERAGED_CENSORING_LIMITATIONS,
  } as const;

  // `applicable` on the supplied summary already means "aerosol layer, and at
  // least one month returned a usable value", so it is not re-tested here.
  if (!footprint || !censoring.applicable) {
    return {
      ...base,
      applicable: false,
      footprint: footprint ?? null,
      combination: null,
      markedMonthCount: 0,
      biasDirectionIfPresent: null,
    };
  }

  return {
    ...base,
    applicable: true,
    footprint,
    combination: "area-weighted-mean-of-per-pixel-decodes",
    markedMonthCount: censoring.ceilingMonthCount,
    biasDirectionIfPresent: "understates",
  };
}

/**
 * One status-line clause, or null when this does not apply — a point probe, a
 * non-aerosol layer, and a footprint that returned nothing all stay silent, so
 * every readout outside an averaged aerosol probe is unchanged.
 *
 * The wording splits on whether the screen marked anything, because the two
 * readings mislead differently. With no mark the whole series reads as
 * uncensored; with marks the reader is told which months are bounds, which reads
 * as a claim the rest are not.
 */
export function aerosolAveragedCensoringClause(
  summary: ProbeAerosolAveragedCensoring,
  censoring: ProbeAerosolCeilingCensoring
): string | null {
  if (!summary.applicable || summary.footprint === null) return null;
  const label = averagedFootprintLabel(summary.footprint);
  const doc = COLORMAP_DOCS.aerosol;

  if (summary.markedMonthCount > 0) {
    return (
      `those marks screen the ${label}'s monthly means and not the pixels behind them — a plume narrower than the ${label} is averaged below the cap while its own pixels stay capped — ` +
      `so the unmarked months are not established as uncensored, and any cap they hide can only have lowered the value (source ${doc} colormap)`
    );
  }
  // No mark was printed, so the sibling clause that normally states the cap
  // stayed silent too — name it here or "capped" has no referent on screen.
  const cap = `AOD ${censoring.rampMax.toFixed(3)} at ${censoring.wavelengthNm} nm`;
  return (
    `each ${label} value is an area-weighted mean of per-pixel decodes, so a pixel the published ${doc} colormap capped at ${cap} averages in with resolved ones and lands inside the finite ramp — ` +
    `no month is marked above, but that is not evidence the ${label} held no capped pixel, and were one present this mean would understate the true loading`
  );
}

/**
 * The clause for an averaged aerosol probe, or null when it does not apply. The
 * layer test lives in the supplied `censoring` summary, which is inapplicable
 * for every layer but aerosol.
 */
export function averagedAerosolCensoringNote(
  footprint: AerosolAveragedFootprint | null | undefined,
  censoring: ProbeAerosolCeilingCensoring
): string | null {
  return aerosolAveragedCensoringClause(
    summarizeProbeAerosolAveragedCensoring(footprint, censoring),
    censoring
  );
}

/**
 * The same qualification carried into the exported CSV, or an empty list for a
 * point probe, a non-aerosol layer, and a footprint that returned nothing —
 * those files stay byte-identical.
 *
 * The export needs this more than the status line does, and most in the case the
 * status line handles by staying quiet. `aerosolCeilingCensoringCsvHeaders`
 * writes nothing at all when no charted month reached the cap, which is the
 * ordinary outcome for an averaged footprint precisely because a mean of capped
 * and resolved pixels lands inside the finite ramp. So the download most likely
 * to hide censoring is the one that ships with no mention of it, opened later by
 * someone who no longer has the panel to consult.
 *
 * When that block IS present it states a bin rule — mark a value at or above the
 * decode ceiling — which is exact for a point probe's median and incomplete
 * here: it screens the footprint's monthly means, not the pixels behind them, so
 * the rows it leaves unmarked are not established as uncensored. The wording
 * splits on that, because a rule the reader can apply is corrected differently
 * from a silence.
 *
 * Claims no presence and no magnitude, for the reason given at the top of this
 * file. Direction alone is stated, and only conditionally: this ramp is open at
 * one end, so a capped pixel can only have averaged in below its true loading.
 * That licenses no inequality on any printed number, and supports no surface
 * air-quality, health, exposure, hazard, causal, or forecast claim.
 */
export function averagedAerosolCensoringCsvHeaders(
  footprint: AerosolAveragedFootprint | null | undefined,
  censoring: ProbeAerosolCeilingCensoring
): string[] {
  const summary = summarizeProbeAerosolAveragedCensoring(footprint, censoring);
  if (!summary.applicable || summary.footprint === null) return [];
  const label = averagedFootprintLabel(summary.footprint);
  const doc = COLORMAP_DOCS.aerosol;

  // No commas anywhere below: a `#` line must never contain a CSV delimiter
  // (see the header discipline documented on `csvHeaderText` in probe.ts).
  const scope =
    summary.markedMonthCount > 0
      ? `# aerosol_ramp_censoring_averaged: the bin rule above screens this ${label}'s monthly means and not the pixels behind them — a plume narrower than the ${label} averages below the cap while its own pixels stay capped — so rows it does not mark are not established as uncensored`
      : `# aerosol_ramp_censoring_averaged: every value below is an area-weighted mean of per-pixel decodes over the ${label} — a pixel the published ${doc} colormap capped at AOD ${censoring.rampMax.toFixed(
          3
        )} at ${censoring.wavelengthNm} nm averages in with resolved ones and the mean lands inside the finite ramp — so no row is flagged as a bound and that silence is not evidence the ${label} held no capped pixel`;
  return [
    scope,
    `# aerosol_ramp_censoring_averaged_detection: telling which months held a capped pixel would take a per-pixel tally of top-bin decodes that the sampler does not report — so no presence and no magnitude is stated for this ${label}; were a capped pixel present the mean would understate the true loading because this ramp is open at its top only`,
  ];
}
