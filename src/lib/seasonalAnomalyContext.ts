import type { ClimateMetric } from "./climate";
import type { DatasetRef } from "./timeline";
import type { SeasonalBaselineComparison } from "./seasonalBaseline";

/**
 * Express a same-calendar-month climate anomaly relative to the baseline's own
 * year-to-year spread (a "standardized anomaly").
 *
 * `compareMonthlyClimateToSeasonalBaseline` already reports the raw anomaly in
 * native units together with the baseline sample standard deviation. On its own
 * a raw anomaly is hard to read: is +0.001 kg/m²/s large? This helper divides
 * the anomaly by the baseline's sample standard deviation so the departure is
 * stated in multiples of the typical same-calendar-month year-to-year spread.
 *
 * This is a descriptive standardized departure, NOT a probability, p-value,
 * exceedance likelihood, significance test, forecast, or distributional claim.
 * The standard deviation is a *sample* SD from a limited number of years and
 * assumes no particular distribution; the band labels below are defined purely
 * as ranges of |z| (standard-deviation multiples) and add no inference beyond
 * that arithmetic. Provenance from the underlying comparison is retained.
 */

export type StandardizedAnomalyStatus = "available" | "unavailable";

/** Direction of the target month relative to the same-calendar-month baseline mean. */
export type AnomalyDirection = "above" | "below" | "at";

/**
 * Descriptive magnitude band, defined strictly as ranges of |z| (the number of
 * baseline sample standard deviations). These are NOT probability statements.
 * - `within-typical-spread`  — |z| < 1 (inside one sample SD of the baseline mean)
 * - `beyond-typical-spread`  — 1 ≤ |z| < 2
 * - `well-beyond-typical-spread` — |z| ≥ 2
 */
export type AnomalyMagnitudeBand =
  | "within-typical-spread"
  | "beyond-typical-spread"
  | "well-beyond-typical-spread";

export interface StandardizedSeasonalAnomaly {
  kind: "standardized-seasonal-climate-anomaly";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: StandardizedAnomalyStatus;
  metric: ClimateMetric;
  /** Cited source of the underlying observations; never dropped. */
  source: DatasetRef;
  /** Raw anomaly in native units (target minus baseline mean), echoed for audit. */
  anomaly: number | null;
  /** Native unit of `anomaly`; the standardized value itself is dimensionless. */
  anomalyUnit: string;
  /** Baseline sample standard deviation used as the divisor, in native units. */
  baselineStandardDeviation: number | null;
  /** Number of same-calendar-month years behind the standard deviation. */
  baselineSampleCount: number;
  /** anomaly / baselineStandardDeviation, in multiples of the baseline SD. */
  standardizedAnomaly: number | null;
  direction: AnomalyDirection | null;
  magnitudeBand: AnomalyMagnitudeBand | null;
  /** Short machine-readable reason when a standardized anomaly is withheld. */
  reason: string | null;
}

/**
 * Derive a standardized anomaly from a completed seasonal-baseline comparison.
 *
 * A standardized value is only produced when the comparison itself succeeded
 * (`status: "available"`, a finite anomaly) AND the baseline has a usable,
 * strictly positive sample standard deviation. A single-year baseline (no SD)
 * or a perfectly flat baseline (zero SD) cannot be standardized without
 * dividing by zero or inventing spread, so those withhold with a reason rather
 * than returning a fabricated number.
 */
export function standardizeSeasonalAnomaly(
  comparison: SeasonalBaselineComparison
): StandardizedSeasonalAnomaly {
  const { metric, anomaly, anomalyUnit } = comparison;
  const standardDeviation = comparison.baseline.sampleStandardDeviation;
  const sampleCount = comparison.baseline.sampleCount;
  const base = {
    kind: "standardized-seasonal-climate-anomaly" as const,
    isForecast: false as const,
    metric,
    source: metric.source,
    anomaly: null,
    anomalyUnit,
    baselineStandardDeviation: null,
    baselineSampleCount: sampleCount,
    standardizedAnomaly: null,
    direction: null,
    magnitudeBand: null,
  };

  if (comparison.status !== "available" || anomaly === null) {
    return {
      ...base,
      status: "unavailable",
      reason: comparison.reason ?? `baseline-${comparison.status}`,
    };
  }
  if (
    standardDeviation === null ||
    !Number.isFinite(standardDeviation) ||
    standardDeviation <= 0
  ) {
    return {
      ...base,
      status: "unavailable",
      anomaly,
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
  if (!Number.isFinite(anomaly)) {
    return { ...base, status: "unavailable", reason: "invalid-anomaly" };
  }

  const standardizedAnomaly = anomaly / standardDeviation;
  return {
    ...base,
    status: "available",
    anomaly,
    baselineStandardDeviation: standardDeviation,
    standardizedAnomaly,
    direction: directionOf(anomaly),
    magnitudeBand: magnitudeBandOf(standardizedAnomaly),
    reason: null,
  };
}

function directionOf(anomaly: number): AnomalyDirection {
  if (anomaly > 0) return "above";
  if (anomaly < 0) return "below";
  return "at";
}

function magnitudeBandOf(standardizedAnomaly: number): AnomalyMagnitudeBand {
  const magnitude = Math.abs(standardizedAnomaly);
  if (magnitude < 1) return "within-typical-spread";
  if (magnitude < 2) return "beyond-typical-spread";
  return "well-beyond-typical-spread";
}
