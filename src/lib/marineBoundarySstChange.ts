import { marineBoundaryMeanSstDifferenceCensoringNote } from "./marineAveragedSstCensoring";
import type { MarinePlaceInsightReading } from "./marinePlaceInsight";
import {
  describeSstDifferenceCensoring,
  type SstDifferenceCensoring,
} from "./sstRampCensoring";
import { formatYm, ymToIndex } from "./timeline";

/**
 * Describe the month-over-month *change* between two boundary-mean sea-surface
 * temperature readings for the same searched place.
 *
 * Every terrestrial place metric already carries a month-over-month readout;
 * the SST card is the one metric reported as a bare single month. This helper
 * closes that gap using the readings the place panel actually produces
 * (`marineBoundarySstReading`), whose coverage context is an honest
 * "unknown" footprint — the sampler cannot tell water from land from cloud.
 *
 * It is a plain subtraction (later minus earlier) in the source unit (°C). It
 * adds no anomaly, climatology, warming/cooling rate, cause, ecosystem signal,
 * or forecast. Two adjacent monthly means are not a trend line.
 *
 * The guard that matters most here is spatial: a MODIS thermal-infrared SST
 * retrieval only exists under a cloud-free sky, so the usable share of a
 * boundary changes from month to month. Two monthly boundary means built from
 * very different shares of the same boundary are not means over the same water,
 * and differencing them would conflate a temperature change with a change in
 * which water was measured. On gross disparity the signed change is withheld.
 */

/** Direction of the month-over-month change in observed boundary-mean SST. */
export type MarineBoundarySstTrend = "warmer" | "cooler" | "little-change";

export type MarineBoundarySstChangeStatus =
  | "available"
  | "endpoint-unavailable"
  | "non-adjacent-months"
  | "different-geography"
  | "incomparable-coverage"
  | "incomparable-censoring";

/**
 * Change of observed SST (°C) below which the pair is reported as
 * `little-change` rather than warmer or cooler. A reporting convention, not a
 * physical threshold: a month-to-month difference under 0.5 °C sits within the
 * combined sampling and monthly-mean noise of the source product and should not
 * be over-read as directional. Callers may override it.
 */
export const MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C = 0.5;

/**
 * Largest difference between the two endpoints' usable boundary shares (as an
 * absolute difference in valid fraction) for which a signed change is still
 * reported. A reporting convention, not a physical or statistical threshold:
 * it catches gross disparity in spatial support, and nothing finer. Equal valid
 * fractions do NOT establish that the same cells were sampled in both months.
 */
export const MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT = 0.25;

export const MARINE_BOUNDARY_SST_CHANGE_LIMITATIONS = [
  "The change is the plain difference of two boundary-mean SST observations (later minus earlier) in the source unit (°C).",
  "Both endpoints are area-weighted means over whichever boundary cells returned a usable SST that month; the sampler reports an unknown surface footprint, so neither endpoint is established as open water.",
  "A thermal-infrared retrieval only exists under cloud-free sky, so the usable share of the boundary differs between months; a signed change is withheld when those shares differ grossly, and equal shares still do not prove the same cells were sampled.",
  "The direction bin (warmer/cooler/little-change) is a reporting convention over a continuous difference; its threshold is not a physical boundary.",
  "The published colormap's terminal bins are open-ended, so an endpoint that lands in one is a bound rather than a point value; the change is then reported as a one-sided bound, and when both endpoints are censored in opposing directions no change is stated at all.",
  "Two adjacent monthly means are not a trend line, a warming or cooling rate, or a climatology anomaly, and this helper does not compute one.",
  "It inherits the SST product's resolution and biases and infers no ecosystem condition, marine-biology signal, cause, hazard, or any future value.",
] as const;

export interface MarineBoundarySstChangeSpatialSupport {
  /** Usable share of the boundary at each endpoint; null when not supplied. */
  earlierValidFraction: number | null;
  laterValidFraction: number | null;
  /** Absolute difference of the two shares; null when either is missing. */
  disparity: number | null;
  /** Disparity reading against the stated convention. */
  comparability: "within-convention" | "gross-disparity" | "unavailable";
}

export interface MarineBoundarySstChange {
  kind: "month-over-month-boundary-sea-surface-temperature-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-boundary-sea-surface-temperature-change-only";
  marineBiologyObservation: false;
  status: MarineBoundarySstChangeStatus;
  /** Shared cited SST product for both endpoints. */
  source: MarinePlaceInsightReading["source"];
  /** Searched-area label both endpoints must share; null when they do not. */
  geographyLabel: string | null;
  earlierMonth: MarinePlaceInsightReading["dataMonth"];
  laterMonth: MarinePlaceInsightReading["dataMonth"];
  spatialSupport: MarineBoundarySstChangeSpatialSupport;
  /**
   * How the published colormap's open end caps constrain this difference. Always
   * stated, so a consumer can never read `changeValue` as a point estimate
   * without first seeing whether it is only a bound.
   */
  censoring: SstDifferenceCensoring;
  /**
   * Later observed value minus earlier, in °C; null when not computable. When
   * `censoring.bound` is "lower"/"upper" this is a ONE-SIDED BOUND on the true
   * change, not the change itself.
   */
  changeValue: number | null;
  /**
   * Null when a censored endpoint leaves the direction unestablished — which is
   * not the same as `little-change`, and must never be rendered as one.
   */
  trend: MarineBoundarySstTrend | null;
  thresholdValue: number;
  disparityLimit: number;
  /** Short machine-readable reason when no change is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface MarineBoundarySstChangeOptions {
  /** Change band (°C) treated as `little-change` (defaults to convention). */
  thresholdC?: number;
  /** Valid-fraction disparity above which a change is withheld. */
  disparityLimit?: number;
}

/**
 * Compare two boundary-mean SST readings for the same searched place. Both must
 * carry a usable observed value, `later` must fall exactly one calendar month
 * after `earlier`, both must name the same sampled geography, and their usable
 * boundary shares must not differ grossly. On any unmet rule the helper reports
 * the reason and a null change rather than a fabricated difference; a null
 * change means "no change can be stated", never "no change occurred".
 */
export function describeMarineBoundarySstChange(
  earlier: MarinePlaceInsightReading,
  later: MarinePlaceInsightReading,
  options: MarineBoundarySstChangeOptions = {}
): MarineBoundarySstChange {
  const threshold =
    options.thresholdC ?? MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C;
  const disparityLimit =
    options.disparityLimit ?? MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT;
  const sameGeography =
    earlier.sampledGeography.label === later.sampledGeography.label;
  const spatialSupport = spatialSupportFor(earlier, later, disparityLimit);
  const censoring = describeSstDifferenceCensoring(
    earlier.observedValue,
    later.observedValue
  );

  const base = {
    kind: "month-over-month-boundary-sea-surface-temperature-change" as const,
    isForecast: false as const,
    claimScope:
      "descriptive-boundary-sea-surface-temperature-change-only" as const,
    marineBiologyObservation: false as const,
    source: later.source,
    geographyLabel: sameGeography ? later.sampledGeography.label : null,
    earlierMonth: earlier.dataMonth,
    laterMonth: later.dataMonth,
    spatialSupport,
    censoring,
    changeValue: null,
    trend: null,
    thresholdValue: validConvention(threshold)
      ? threshold
      : MARINE_BOUNDARY_SST_CHANGE_THRESHOLD_C,
    disparityLimit: validConvention(disparityLimit)
      ? disparityLimit
      : MARINE_BOUNDARY_SST_COVERAGE_DISPARITY_LIMIT,
    limitations: MARINE_BOUNDARY_SST_CHANGE_LIMITATIONS,
  };

  if (!validConvention(threshold) || !validConvention(disparityLimit)) {
    return {
      ...base,
      status: "endpoint-unavailable",
      reason: "invalid-convention",
    };
  }
  if (
    earlier.availability !== "available" ||
    later.availability !== "available" ||
    earlier.observedValue === null ||
    later.observedValue === null
  ) {
    return {
      ...base,
      status: "endpoint-unavailable",
      reason: "endpoint-not-available",
    };
  }
  if (!sameGeography) {
    return {
      ...base,
      status: "different-geography",
      reason: "geography-mismatch",
    };
  }
  if (!isConsecutive(earlier.dataMonth, later.dataMonth)) {
    return {
      ...base,
      status: "non-adjacent-months",
      reason: "months-not-consecutive",
    };
  }
  if (spatialSupport.comparability !== "within-convention") {
    return {
      ...base,
      status: "incomparable-coverage",
      reason:
        spatialSupport.comparability === "gross-disparity"
          ? "coverage-disparity"
          : "coverage-not-supplied",
    };
  }

  // Two endpoints censored in opposing directions leave the true change
  // unbounded both ways. Reporting the arithmetic difference — which for a
  // doubly saturated pair is typically 0.0 °C — would state "little change"
  // about water whose change is entirely unknown.
  if (censoring.bound === "indeterminate") {
    return {
      ...base,
      status: "incomparable-censoring",
      reason: "both-endpoints-censored",
    };
  }

  const change = later.observedValue - earlier.observedValue;
  return {
    ...base,
    status: "available",
    changeValue: change,
    trend: trendFor(change, threshold, censoring.bound),
    reason: null,
  };
}

/**
 * Bin a change into a direction, honouring what a censored endpoint actually
 * permits. With no censoring the difference is a point value and every bin is
 * available. With a one-sided bound only the direction the bound already proves
 * may be claimed: if the true change is at least +0.9 °C it is certainly warmer,
 * but a bound of −0.2 °C proves nothing, and `little-change` — which asserts
 * BOTH sides — can never be claimed from a one-sided bound.
 */
function trendFor(
  change: number,
  threshold: number,
  bound: SstDifferenceCensoring["bound"]
): MarineBoundarySstTrend | null {
  if (bound === "none") {
    return Math.abs(change) < threshold
      ? "little-change"
      : change > 0
        ? "warmer"
        : "cooler";
  }
  if (bound === "lower") return change >= threshold ? "warmer" : null;
  if (bound === "upper") return change <= -threshold ? "cooler" : null;
  return null;
}

/**
 * A compact, honest one-line readout of the change, matching the place panel's
 * cited-readout style. Non-`available` results are reported plainly rather than
 * dressed up as a number.
 *
 * Every stated change carries the averaged-footprint qualification, because both
 * endpoints are area-weighted boundary means and `describeSstDifferenceCensoring`
 * screens the pair by reading those means. A mean of capped and resolved pixels
 * lands inside the finite ramp, so the whole apparatus the reader can see here —
 * the `≥`/`≤` prefix, the suppressed direction — fires only when a mean itself
 * reached a terminal bin, which averaging is what prevents. The withheld branches
 * take no clause: they state no change, so there is nothing to qualify.
 */
export function formatMarineBoundarySstChange(
  change: MarineBoundarySstChange
): string {
  const earlierLabel = formatYm(change.earlierMonth);
  const laterLabel = formatYm(change.laterMonth);

  if (change.status !== "available" || change.changeValue === null) {
    return `no month-over-month SST change stated for ${laterLabel} vs ${earlierLabel} — ${withholdingReason(change)}`;
  }

  const magnitude = `${change.censoring.boundPrefix}${formatSigned(change.changeValue)} °C`;
  const censoringNote = averagedCensoringSuffix(change);
  if (change.trend === null) {
    // A censored endpoint bounded the change on one side only, and that bound
    // does not reach the direction threshold. Say the direction is unestablished
    // rather than borrowing "little change", which would claim the opposite side.
    return `${laterLabel} vs ${earlierLabel}: direction not established (${magnitude}, censored endpoint)${censoringNote}`;
  }
  if (change.trend === "little-change") {
    return `${laterLabel} vs ${earlierLabel}: little change (${magnitude})${censoringNote}`;
  }
  return `${laterLabel} vs ${earlierLabel}: ${change.trend} (${magnitude})${censoringNote}`;
}

/**
 * The trailing clause saying what the end-cap screen on this difference could not
 * see, or "" when there is nothing to add.
 *
 * The place card's year-over-year difference already carries this qualification;
 * this line reached the same card, built from the same two averaged means by the
 * same screen, and printed bare. Worse than bare: the sibling's caveat names "the
 * year-over-year difference above", so the reader met one difference qualified by
 * name and a second, of identical construction, not mentioned.
 */
function averagedCensoringSuffix(change: MarineBoundarySstChange): string {
  const note = marineBoundaryMeanSstDifferenceCensoringNote(
    change.censoring.bound
  );
  return note === null ? "" : ` — ${note}`;
}

/**
 * Say in words why no change is stated, rather than emitting the machine
 * `reason` slug to the reader.
 *
 * The place card already carries a year-over-year difference for the same
 * boundary, and that sibling spells its withholdings out — "both months land in
 * the published colormap's open end caps", or the two sampled shares and the gap
 * between them. This line reached the same card with the same conditions and
 * printed "(both-endpoints-censored)" or "(coverage-disparity)". Two readouts of
 * the same kind, on one card, for the identical condition, and only one of them
 * told the reader what happened.
 *
 * The distinction matters most for censoring, where the slug reads like a
 * missing-data notice and the truth is the opposite: the months WERE observed,
 * and the published colormap collapsed both into open end caps that bound them
 * in opposing directions, so the true change is unbounded both ways. Nothing
 * here claims a change, a direction, or a magnitude; each branch says only which
 * rule the pair failed. The structured `reason` field is unchanged for
 * machine consumers.
 */
function withholdingReason(change: MarineBoundarySstChange): string {
  if (change.status === "incomparable-censoring") {
    return "both months land in the published colormap's open end caps, which bound them in opposing directions, so the true change is unbounded both ways";
  }
  if (change.status === "different-geography") {
    return "the two means were sampled for different geographies";
  }
  if (change.status === "non-adjacent-months") {
    return "the two months are not consecutive, so their difference would not be a month-over-month one";
  }
  if (change.status === "incomparable-coverage") {
    const { earlierValidFraction, laterValidFraction, disparity } =
      change.spatialSupport;
    if (
      earlierValidFraction === null ||
      laterValidFraction === null ||
      disparity === null
    ) {
      return "the usable boundary share was not reported for both months, so the two means cannot be checked for like-for-like spatial support";
    }
    // Mirrors the year-over-year sibling: name both shares and the gap, so the
    // reader can see how far apart the supports were rather than being told
    // only that some threshold was crossed.
    return `${formatYm(change.earlierMonth)} sampled ${sharePercent(
      earlierValidFraction
    )} of the boundary and ${formatYm(change.laterMonth)} sampled ${sharePercent(
      laterValidFraction
    )}, ${Math.round(
      disparity * 100
    )} points apart, so the two means may differ in which water was sampled rather than in temperature`;
  }
  if (change.reason === "invalid-convention") {
    return "the reporting conventions supplied for this comparison were not usable numbers";
  }
  return "one of the two months carries no usable boundary-mean SST observation";
}

function sharePercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

function spatialSupportFor(
  earlier: MarinePlaceInsightReading,
  later: MarinePlaceInsightReading,
  disparityLimit: number
): MarineBoundarySstChangeSpatialSupport {
  const earlierValidFraction = earlier.validFraction;
  const laterValidFraction = later.validFraction;
  if (earlierValidFraction === null || laterValidFraction === null) {
    return {
      earlierValidFraction,
      laterValidFraction,
      disparity: null,
      comparability: "unavailable",
    };
  }
  const disparity = Math.abs(laterValidFraction - earlierValidFraction);
  return {
    earlierValidFraction,
    laterValidFraction,
    disparity,
    comparability:
      validConvention(disparityLimit) && disparity <= disparityLimit
        ? "within-convention"
        : "gross-disparity",
  };
}

function isConsecutive(
  earlier: MarinePlaceInsightReading["dataMonth"],
  later: MarinePlaceInsightReading["dataMonth"]
): boolean {
  return ymToIndex(later) - ymToIndex(earlier) === 1;
}

function validConvention(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? "+" : "-"}${Math.abs(value).toFixed(1)}`;
}
