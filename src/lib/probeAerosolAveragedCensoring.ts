import { COLORMAP_DOCS } from "./colormap";
import type { ProbeAerosolCeilingCensoring } from "./probeAerosolCeilingCensoring";

/**
 * Why the aerosol end-cap marks cannot see censoring in an AVERAGED footprint —
 * a drawn study region, or the ~1° area around a probed point.
 *
 * `probeAerosolCeilingCensoring` screens the charted series: a month decoded at
 * or above the ramp's open top bin (`≥ 0.900` at 550 nm) is rendered with a `≥`
 * prefix, because every heavier column shares one colour. That screen is exact
 * in point mode, where the charted value is a MEDIAN of a tight pixel block — a
 * median returns one of the decoded pixel values, so a capped result is itself
 * in the terminal bin and is caught.
 *
 * Area and region mode combine differently. `ProbeSampler` inverts every sampled
 * pixel on its own and then takes a cos(lat)-weighted MEAN of the usable ones
 * (`weightedMeanValid`). A mean is not one of its members. A footprint holding
 * both capped pixels and pixels the ramp resolved therefore averages to a value
 * that can sit anywhere inside the finite ramp, while still carrying the cap's
 * error: the capped pixels entered the average at the bin they were collapsed
 * into, not at the loading they had. Screening that mean finds nothing, no
 * inequality is drawn, and a censored area mean is presented as an ordinary
 * estimate.
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
 * 2. The DIRECTION of the resulting error is knowable, unlike SST's. That ramp
 *    has two opposing caps, so a censored pixel may enter either too warm or too
 *    cool and the module can claim no direction. This ramp is open at one end
 *    only — the low end is closed at 0 and column AOD cannot be negative — so a
 *    capped pixel always enters the average BELOW the loading it had. If any was
 *    capped, the footprint's mean understates the true mean. That is a statement
 *    about direction conditional on presence, and it is the strongest thing that
 *    can honestly be said.
 *
 * What stays unknowable is PRESENCE. The sampler returns one combined value and
 * a usable share per month; nothing downstream can tell a footprint holding
 * capped pixels from one that holds none. Recovering it would take a per-pixel
 * tally of terminal-bin decodes from `sampleMonth`, which the app does not
 * collect. So no inequality is rendered on any number, and no magnitude is
 * claimed — only that on an averaged footprint the absence of a mark is not
 * evidence of an uncensored footprint, and that any censoring it hides biases
 * the value one way.
 *
 * Nothing here estimates the loading behind a cap, locates the censored pixels
 * inside the footprint, or supports any surface air-quality, health, exposure,
 * hazard, causal, or forecast claim.
 */

/**
 * Which averaged footprint the clause describes, for wording only.
 *
 * The same string union the panel already holds for the marine clause, declared
 * here rather than imported so an atmosphere module does not depend on a marine
 * one; the two are structurally identical, so the panel passes one value to
 * both.
 */
export type AerosolAveragedFootprint = "drawn-region" | "sampled-area";

export const PROBE_AEROSOL_AVERAGED_CENSORING_LIMITATIONS = [
  "An averaged footprint charts a weighted mean of per-pixel decodes, so a mean of capped and resolved pixels lands inside the finite ramp and the end-cap screen does not mark it.",
  "Whether any sampled pixel was capped is not recoverable from the combined value and the usable share the sampler reports, so no presence and no magnitude is claimed and no inequality is rendered.",
  "The direction is knowable if a capped pixel is present: this ramp is open at its top only, so a capped pixel always averages in below its true loading and the footprint mean understates.",
  "Marks that do survive into an averaged series undercount the censoring, because a plume narrower than the footprint is diluted below the cap while its own pixels remain capped.",
  "The statement applies to averaged footprints only; a point probe charts a median of a tight pixel block, which the end-cap screen already catches.",
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
  const label = footprintLabel(summary.footprint);
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

function footprintLabel(footprint: AerosolAveragedFootprint): string {
  return footprint === "drawn-region" ? "drawn region" : "sampled area";
}
