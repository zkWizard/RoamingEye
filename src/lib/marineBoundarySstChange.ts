import type { MarinePlaceInsightReading } from "./marinePlaceInsight";
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
  | "incomparable-coverage";

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
  /** Later observed value minus earlier, in °C; null when not computable. */
  changeValue: number | null;
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

  const change = later.observedValue - earlier.observedValue;
  return {
    ...base,
    status: "available",
    changeValue: change,
    trend:
      Math.abs(change) < threshold
        ? "little-change"
        : change > 0
          ? "warmer"
          : "cooler",
    reason: null,
  };
}

/**
 * A compact, honest one-line readout of the change, matching the place panel's
 * cited-readout style. Non-`available` results are reported plainly rather than
 * dressed up as a number.
 */
export function formatMarineBoundarySstChange(
  change: MarineBoundarySstChange
): string {
  const earlierLabel = formatYm(change.earlierMonth);
  const laterLabel = formatYm(change.laterMonth);

  if (change.status !== "available" || change.changeValue === null) {
    return `no month-over-month SST change stated for ${laterLabel} vs ${earlierLabel} (${change.reason ?? change.status})`;
  }

  const magnitude = `${formatSigned(change.changeValue)} °C`;
  if (change.trend === "little-change") {
    return `${laterLabel} vs ${earlierLabel}: little change (${magnitude})`;
  }
  return `${laterLabel} vs ${earlierLabel}: ${change.trend} (${magnitude})`;
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
