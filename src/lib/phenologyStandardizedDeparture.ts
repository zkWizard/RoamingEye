import type { DatasetRef } from "./timeline";
import { NDVI_UNIT } from "./phenology";
import {
  type NdviMetric,
  type NdviSeasonalBaselineComparison,
} from "./phenologyBaseline";

/**
 * Express a same-calendar-month NDVI departure relative to the baseline's own
 * year-to-year spread (a "standardized departure").
 *
 * {@link compareMonthlyNdviToSeasonalBaseline} already reports the raw
 * `differenceFromBaseline` (target NDVI minus the same-calendar-month baseline
 * mean) together with the baseline sample standard deviation. On its own a raw
 * NDVI difference is hard to read: is +0.05 large? Where the same-month spread
 * is 0.01 it is enormous; where the spread is 0.12 it is unremarkable. This
 * helper divides the difference by the baseline's sample standard deviation so
 * the departure is stated in multiples of the typical same-calendar-month
 * year-to-year spread.
 *
 * This is a descriptive standardized departure of a unitless vegetation index,
 * NOT a probability, p-value, exceedance likelihood, significance test, or
 * distributional claim, and it infers no plant phenology, biomass, habitat
 * quality, ecosystem health, causes, or forecasts. The standard deviation is a
 * *sample* SD from a limited number of years and assumes no particular
 * distribution; the band labels below are defined purely as ranges of |z|
 * (standard-deviation multiples) and add no inference beyond that arithmetic.
 * Provenance from the underlying comparison is retained.
 */

export type NdviStandardizedDepartureStatus = "available" | "unavailable";

/** Direction of the target month relative to the same-calendar-month baseline mean. */
export type NdviDepartureDirection = "above" | "below" | "at";

/**
 * Descriptive magnitude band, defined strictly as ranges of |z| (the number of
 * baseline sample standard deviations). These are NOT probability statements.
 * - `within-typical-spread`      — |z| < 1 (inside one sample SD of the mean)
 * - `beyond-typical-spread`      — 1 ≤ |z| < 2
 * - `well-beyond-typical-spread` — |z| ≥ 2
 */
export type NdviDepartureMagnitudeBand =
  | "within-typical-spread"
  | "beyond-typical-spread"
  | "well-beyond-typical-spread";

export interface NdviStandardizedDeparture {
  kind: "standardized-ndvi-seasonal-departure";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: NdviStandardizedDepartureStatus;
  metric: NdviMetric;
  /** Cited source of the underlying observations; never dropped. */
  source: DatasetRef;
  /**
   * Raw same-calendar-month difference in native NDVI units (target minus
   * baseline mean), echoed from the comparison for auditability.
   */
  differenceFromBaseline: number | null;
  /** Native unit of `differenceFromBaseline`; the standardized value is dimensionless. */
  differenceUnit: typeof NDVI_UNIT;
  /** Baseline sample standard deviation used as the divisor, in native NDVI units. */
  baselineStandardDeviation: number | null;
  /** Number of same-calendar-month years behind the standard deviation. */
  baselineSampleCount: number;
  /** differenceFromBaseline / baselineStandardDeviation, in multiples of the SD. */
  standardizedDeparture: number | null;
  direction: NdviDepartureDirection | null;
  magnitudeBand: NdviDepartureMagnitudeBand | null;
  /** Short machine-readable reason when a standardized departure is withheld. */
  reason: string | null;
}

/**
 * Derive a standardized departure from a completed NDVI seasonal-baseline
 * comparison.
 *
 * A standardized value is only produced when the comparison itself succeeded
 * (`status: "available"`, a finite `differenceFromBaseline`) AND the baseline
 * has a usable, strictly positive sample standard deviation. A single-year
 * baseline (no SD) or a perfectly flat baseline (zero SD) cannot be
 * standardized without dividing by zero or inventing spread, so those withhold
 * with a reason rather than returning a fabricated number.
 */
export function standardizeNdviSeasonalDeparture(
  comparison: NdviSeasonalBaselineComparison
): NdviStandardizedDeparture {
  const { metric } = comparison;
  const difference = comparison.differenceFromBaseline;
  const standardDeviation = comparison.baseline.sampleStandardDeviation;
  const sampleCount = comparison.baseline.sampleCount;
  const base = {
    kind: "standardized-ndvi-seasonal-departure" as const,
    isForecast: false as const,
    metric,
    source: metric.source,
    differenceFromBaseline: null,
    differenceUnit: NDVI_UNIT as typeof NDVI_UNIT,
    baselineStandardDeviation: null,
    baselineSampleCount: sampleCount,
    standardizedDeparture: null,
    direction: null,
    magnitudeBand: null,
  };

  if (comparison.status !== "available" || difference === null) {
    return {
      ...base,
      status: "unavailable",
      reason: comparison.reason ?? `baseline-${comparison.status}`,
    };
  }
  if (!Number.isFinite(difference)) {
    return { ...base, status: "unavailable", reason: "invalid-difference" };
  }
  if (
    standardDeviation === null ||
    !Number.isFinite(standardDeviation) ||
    standardDeviation <= 0
  ) {
    return {
      ...base,
      status: "unavailable",
      differenceFromBaseline: difference,
      baselineStandardDeviation:
        standardDeviation !== null && Number.isFinite(standardDeviation)
          ? standardDeviation
          : null,
      reason:
        standardDeviation === 0
          ? "no-baseline-variability"
          : "insufficient-baseline-spread",
    };
  }

  const standardizedDeparture = difference / standardDeviation;
  return {
    ...base,
    status: "available",
    differenceFromBaseline: difference,
    baselineStandardDeviation: standardDeviation,
    standardizedDeparture,
    direction: directionOf(difference),
    magnitudeBand: magnitudeBandOf(standardizedDeparture),
    reason: null,
  };
}

function directionOf(difference: number): NdviDepartureDirection {
  if (difference > 0) return "above";
  if (difference < 0) return "below";
  return "at";
}

function magnitudeBandOf(
  standardizedDeparture: number
): NdviDepartureMagnitudeBand {
  const magnitude = Math.abs(standardizedDeparture);
  if (magnitude < 1) return "within-typical-spread";
  if (magnitude < 2) return "beyond-typical-spread";
  return "well-beyond-typical-spread";
}
