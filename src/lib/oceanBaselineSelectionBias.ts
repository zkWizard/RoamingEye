import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type {
  OceanSeasonalBaselineComparison,
  UsableSstFootprint,
} from "./oceanSeasonalBaseline";
import type { DatasetRef } from "./timeline";

/**
 * Selection pressure on a same-calendar-month sea-surface-temperature baseline.
 *
 * `compareSstToSeasonalBaseline` builds its baseline from the candidate years
 * that survive a usability filter: a year is kept only when it carries a usable
 * SST value at the target's footprint with enough spatial coverage. Years that
 * fail are simply dropped, and the mean is taken over what is left. The
 * comparison already reports `sampleCount` and an `exclusions` tally, and
 * `oceanBaselineEffectiveSampleSize` (when present) asks how much *independent*
 * information those retained years carry. Neither asks the prior question:
 * whether the retained years are a *representative* subset of the candidate
 * years at all.
 *
 * For MODIS/Aqua thermal-infrared SST they are not, and the reason is physical.
 * The retrieval domain of this product is cloud-free, ice-free ocean:
 *
 *  - A thermal-infrared radiometer cannot see the sea surface through cloud, so
 *    a cloudy month yields reduced or zero coverage.
 *  - The product carries no retrieval over sea ice. Sampling the rendered layer
 *    confirms it: at 66°S, 45°W (Weddell Sea) the September 2023 monthly image
 *    carries the colormap's no-data entry, while February 2023 — the austral
 *    summer, when that water is open — renders a real SST bin; at 85°N, 0°E the
 *    image is no-data in both months. The absence is the ice, not an outage.
 *
 * Cloud and ice do not drop years at random with respect to temperature, and
 * the two differ in how much can honestly be said about the resulting bias:
 *
 *  - **Sea ice has a known sign.** Ice forms only where the water has reached
 *    its freezing point, so an ice-dropped year is necessarily one of the
 *    *coldest* candidate years. Removing it can only raise the mean of what
 *    remains. Wherever ice dropout is physically admissible, the baseline mean
 *    is therefore biased warm, and the anomaly measured against it — target
 *    minus baseline — is correspondingly biased cold.
 *  - **Cloud does not.** The correlation between cloud cover and SST varies by
 *    region and season and is not of one sign globally, so a cloud-dropped year
 *    licenses no directional claim at all.
 *
 * This helper reports exactly that distinction and nothing more. It states the
 * *direction* of the bias when the direction is deducible from the freezing
 * point, and declines to state a direction otherwise. It never estimates a
 * magnitude, never imputes a value for a dropped year, never corrects the
 * baseline mean or the anomaly, and never claims that ice was actually present
 * in any particular month — only that, at the temperatures observed, ice
 * dropout is or is not physically admissible.
 *
 * Like every descriptor in this module family it is temperature-only: it infers
 * no marine-biological abundance, habitat, ecosystem condition, heat stress,
 * cause, risk, or future ocean state.
 */

/**
 * Surface freezing point of seawater near open-ocean salinity (~35 g/kg), in
 * °C. Below this the surface is ice rather than water, so no candidate year can
 * hold a liquid-surface value colder than roughly this figure. Freshened polar
 * surface layers freeze slightly warmer; this is the conventional open-ocean
 * value and is used only to explain why ice dropout removes cold years.
 */
export const SEAWATER_FREEZING_POINT_C = -1.8;

/**
 * Monthly-mean SST at or below which sea-ice dropout is treated as physically
 * admissible for the sampled boundary, in °C.
 *
 * This reuses the repo's existing `near-freezing` band edge in `oceanConditions`
 * rather than introducing a second cold convention. It is deliberately generous:
 * a monthly mean over a boundary mixes ice-free water with any ice-free margin,
 * so a boundary that freezes in some month can still average well above the
 * freezing point in the months it does not. It is a screening threshold, not a
 * measurement, and never asserts that ice occurred.
 */
export const SEA_ICE_ADMISSIBLE_THRESHOLD_C = 2;

export type OceanBaselineSelectionStatus =
  /** A usable baseline mean exists, so its selection can be assessed. */
  | "assessed"
  /** The comparison produced no baseline mean; there is nothing to assess. */
  | "baseline-unavailable";

export type BaselineMeanBiasDirection =
  /**
   * Candidate years were dropped by an observation-side mechanism AND the
   * retained years sit cold enough for ice dropout to be admissible, so the
   * baseline mean is biased warm. Sign only; no magnitude is estimated.
   */
  | "warm-biased"
  /**
   * Candidate years were dropped, but the retained years are too warm for ice
   * dropout to be admissible, leaving cloud as the mechanism. Cloud licenses no
   * directional claim, so no sign is asserted.
   */
  | "sign-undetermined"
  /** No candidate year was dropped by an observation-side mechanism. */
  | "no-dropout"
  /** No baseline mean, so selection is not assessed. */
  | "unassessed";

export type AnomalyBiasDirection =
  /** Baseline mean biased warm, so target minus baseline reads too cold. */
  "cold-biased" | "sign-undetermined" | "no-dropout" | "unassessed";

export interface OceanBaselineDropoutCounts {
  /**
   * Same-calendar-month candidate years inside the baseline window: the
   * retained years plus every year the filter dropped from that window.
   * Candidates outside the window or on the wrong calendar month are not
   * counted — they were never eligible.
   */
  withinWindowCandidates: number;
  /** Years retained in the baseline mean. */
  retained: number;
  /**
   * Years dropped by an *observation-side* mechanism — the ones cloud and ice
   * act through. Sums the comparison's `insufficientCoverage` (partial view of
   * the boundary) and `footprintMismatch` (no usable value at the target's
   * footprint at all, which is where a fully ice-covered month lands).
   *
   * `footprintMismatch` is conflated: it also absorbs a genuine change of
   * surface footprint between years, which is not a temperature-driven dropout.
   * Both components are reported separately so a consumer can see the mix.
   */
  observationDropout: number;
  /** Component of `observationDropout`: coverage below the required fraction. */
  insufficientCoverage: number;
  /** Component of `observationDropout`; conflated, see above. */
  footprintMismatch: number;
  /**
   * Years dropped for bookkeeping rather than observation — the window held
   * more than one observation for that year, so none could be used. Not a
   * temperature-driven dropout.
   */
  ambiguousYears: number;
}

export interface OceanBaselineSelectionSummary {
  kind: "sst-baseline-selection-bias";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: OceanBaselineSelectionStatus;
  source: DatasetRef;
  /** Unit of every temperature reported here; no display conversion is done. */
  unit: string;
  /** Footprint the assessed baseline was restricted to, when it had one. */
  footprint: UsableSstFootprint | null;
  counts: OceanBaselineDropoutCounts;
  /** Retained share of the within-window candidates; null when there were none. */
  retainedFraction: number | null;
  /** Coldest retained baseline sample, the value the ice screen reads. */
  coldestRetainedValue: number | null;
  /** Coldest retained sample minus the seawater freezing point; null if none. */
  marginAboveFreezingPoint: number | null;
  /** Threshold the ice screen used, echoed for auditability. */
  iceAdmissibleThreshold: number;
  /**
   * True when the coldest retained sample is at or below the threshold, i.e.
   * the boundary is cold enough that ice dropout is physically admissible.
   * Never a claim that ice occurred.
   */
  seaIceDropoutAdmissible: boolean;
  /** Direction of the bias in the baseline mean; sign only, never a magnitude. */
  baselineMeanBias: BaselineMeanBiasDirection;
  /** Direction the anomaly inherits from that bias; sign only. */
  anomalyBias: AnomalyBiasDirection;
  /** Honest one-line statement; no biological, hazard, or causal claim. */
  statement: string;
  limitations: readonly string[];
}

export interface OceanBaselineSelectionOptions {
  /**
   * Override the monthly-mean SST at or below which ice dropout is treated as
   * admissible, in °C. Values that are not finite fall back to the default.
   */
  iceAdmissibleThreshold?: number;
}

export const OCEAN_BASELINE_SELECTION_LIMITATIONS = [
  "Only the direction of the bias is reported; no magnitude is estimated, no dropped year is imputed, and neither the baseline mean nor the anomaly is corrected.",
  "A warm-biased direction follows from the freezing point of seawater — an ice-dropped year is necessarily among the coldest — not from any observation that ice was present in a particular month.",
  "The ice screen is a threshold on the coldest retained monthly mean, deliberately generous because a monthly mean over a boundary mixes ice-free water with any ice-free margin.",
  "Cloud dropout is left without a sign because the correlation between cloud cover and sea surface temperature varies by region and season.",
  "The observation-side dropout count includes a conflated bucket that also absorbs genuine footprint changes between years; its components are reported separately.",
  "Selection is assessed only over same-calendar-month candidates inside the baseline window; years outside it were never eligible and are not counted as dropped.",
  "This is a sampling descriptor over already-computed temperature statistics, not a marine-biological, habitat, heat-stress, hazard, causal, or forecast claim.",
] as const;

/**
 * Assess whether a completed same-calendar-month SST baseline was built from a
 * representative subset of its candidate years, and report the direction — never
 * the magnitude — of any bias the dropout implies.
 */
export function summarizeOceanBaselineSelection(
  comparison: OceanSeasonalBaselineComparison,
  options: OceanBaselineSelectionOptions = {}
): OceanBaselineSelectionSummary {
  const rawThreshold = options.iceAdmissibleThreshold;
  const iceAdmissibleThreshold =
    rawThreshold !== undefined && Number.isFinite(rawThreshold)
      ? rawThreshold
      : SEA_ICE_ADMISSIBLE_THRESHOLD_C;

  const { exclusions, samples } = comparison;
  const observationDropout =
    exclusions.insufficientCoverage + exclusions.footprintMismatch;
  const withinWindowCandidates =
    samples.length + observationDropout + exclusions.duplicateYear;
  const counts: OceanBaselineDropoutCounts = {
    withinWindowCandidates,
    retained: samples.length,
    observationDropout,
    insufficientCoverage: exclusions.insufficientCoverage,
    footprintMismatch: exclusions.footprintMismatch,
    ambiguousYears: exclusions.duplicateYear,
  };

  const base = {
    kind: "sst-baseline-selection-bias" as const,
    isForecast: false as const,
    claimScope: "descriptive-sea-surface-temperature-only" as const,
    source: SEA_SURFACE_TEMPERATURE_METRIC.source,
    unit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    footprint: comparison.bounds.footprint,
    counts,
    retainedFraction:
      withinWindowCandidates > 0
        ? samples.length / withinWindowCandidates
        : null,
    iceAdmissibleThreshold,
    limitations: OCEAN_BASELINE_SELECTION_LIMITATIONS,
  };

  // Without a baseline mean there is no selected population to characterize.
  // The dropout tally is still reported, because it is exactly what explains an
  // unavailable baseline, but no bias direction is asserted over it.
  if (comparison.status !== "available" || comparison.baseline.mean === null) {
    return {
      ...base,
      status: "baseline-unavailable",
      coldestRetainedValue: null,
      marginAboveFreezingPoint: null,
      seaIceDropoutAdmissible: false,
      baselineMeanBias: "unassessed",
      anomalyBias: "unassessed",
      statement:
        "Baseline selection not assessed: the same-calendar-month comparison produced no baseline mean.",
    };
  }

  const coldestRetainedValue = coldestSample(samples);
  const seaIceDropoutAdmissible =
    coldestRetainedValue !== null &&
    coldestRetainedValue <= iceAdmissibleThreshold;
  const baselineMeanBias: BaselineMeanBiasDirection =
    observationDropout === 0
      ? "no-dropout"
      : seaIceDropoutAdmissible
        ? "warm-biased"
        : "sign-undetermined";
  const anomalyBias: AnomalyBiasDirection =
    baselineMeanBias === "warm-biased"
      ? "cold-biased"
      : baselineMeanBias === "no-dropout"
        ? "no-dropout"
        : "sign-undetermined";

  return {
    ...base,
    status: "assessed",
    coldestRetainedValue,
    marginAboveFreezingPoint:
      coldestRetainedValue === null
        ? null
        : coldestRetainedValue - SEAWATER_FREEZING_POINT_C,
    seaIceDropoutAdmissible,
    baselineMeanBias,
    anomalyBias,
    statement: statementFor(
      counts,
      baselineMeanBias,
      coldestRetainedValue,
      iceAdmissibleThreshold
    ),
  };
}

function coldestSample(
  samples: OceanSeasonalBaselineComparison["samples"]
): number | null {
  let coldest: number | null = null;
  for (const sample of samples) {
    if (coldest === null || sample.value < coldest) coldest = sample.value;
  }
  return coldest;
}

function statementFor(
  counts: OceanBaselineDropoutCounts,
  bias: BaselineMeanBiasDirection,
  coldestRetainedValue: number | null,
  threshold: number
): string {
  const unit = SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit;
  const kept = `${counts.retained} of ${counts.withinWindowCandidates} same-calendar-month candidate years retained`;
  if (bias === "no-dropout") {
    return `${kept}; no candidate year was dropped for coverage or footprint, so the baseline mean carries no dropout-driven bias.`;
  }
  const dropped = `${counts.observationDropout} dropped for insufficient coverage or no usable value at the baseline footprint`;
  const coldest =
    coldestRetainedValue === null
      ? "no retained value"
      : `coldest retained month ${coldestRetainedValue.toFixed(1)} ${unit}`;
  if (bias === "warm-biased") {
    return `${kept}, ${dropped}; ${coldest} is at or below ${threshold} ${unit}, so sea-ice dropout is physically admissible and would remove only the coldest years — the baseline mean is biased warm and the anomaly measured against it biased cold. Direction only; no magnitude is estimated.`;
  }
  return `${kept}, ${dropped}; ${coldest} is above ${threshold} ${unit}, so sea-ice dropout is not admissible and cloud is the remaining mechanism — no bias direction is asserted.`;
}
