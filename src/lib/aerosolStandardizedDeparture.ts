import type { DatasetRef } from "./timeline";
import type {
  AnomalyDirection,
  AnomalyMagnitudeBand,
} from "./seasonalAnomalyContext";
import type { AerosolSeasonalBaselineComparison } from "./aerosolSeasonalBaseline";

/**
 * Express a same-calendar-month column aerosol optical depth (AOD) anomaly
 * relative to the baseline's own year-to-year spread (a "standardized
 * departure").
 *
 * {@link compareAerosolToSeasonalBaseline} already reports the raw `anomaly`
 * (target AOD minus the same-calendar-month baseline mean) together with the
 * baseline sample standard deviation, and even carries a `standardizedAnomaly`.
 * On its own a raw AOD anomaly is hard to read: is +0.05 large? Where the
 * same-month spread is 0.01 it is enormous; where the spread is 0.15 it is
 * unremarkable. This helper restates the departure in multiples of the typical
 * same-calendar-month year-to-year spread and attaches a direction and a
 * descriptive magnitude band, so a reader can tell an unremarkable hazy month
 * from a genuinely unusual one — mirroring the audited climate and NDVI
 * standardized-departure helpers (see seasonalAnomalyContext.ts and
 * phenologyStandardizedDeparture.ts).
 *
 * Scientific honesty (kept in the code because callers surface it):
 *  - AOD at 550 nm is a whole-column optical thickness, NOT a surface
 *    concentration and NOT a regulatory air-quality or health index.
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so a value is a modelled monthly mean, not a direct pixel measurement.
 *  - This is a descriptive standardized departure, NOT a probability, p-value,
 *    exceedance likelihood, significance test, forecast, or distributional
 *    claim. The divisor is a *sample* standard deviation from a limited number
 *    of years and assumes no particular distribution; the band labels are
 *    defined purely as ranges of |z| and add no inference beyond that
 *    arithmetic. Provenance from the underlying comparison is retained.
 *
 * Pure, render-free logic (see aerosolStandardizedDeparture.test.ts).
 */

export type AerosolStandardizedDepartureStatus = "available" | "unavailable";

/** Honest scope limits shared by the standardized-departure descriptor. */
export const AEROSOL_STANDARDIZED_DEPARTURE_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so a value is a modelled monthly mean, not a direct pixel measurement.",
  "The standardized departure is a descriptive value in baseline standard-deviation multiples, not a probability, p-value, exceedance likelihood, or forecast.",
  "The divisor is a sample standard deviation from a limited number of same-calendar-month years and assumes no particular distribution.",
] as const;

export interface AerosolStandardizedDeparture {
  kind: "standardized-aerosol-seasonal-departure";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AerosolStandardizedDepartureStatus;
  /** Cited source of the underlying observations (MERRA-2); never dropped. */
  source: DatasetRef;
  /** Wavelength of the aerosol optical thickness product, in nm. */
  wavelengthNm: number;
  /** Unit of the raw departure (dimensionless); the standardized value is too. */
  unit: string;
  /**
   * Raw same-calendar-month departure (target AOD minus baseline mean),
   * echoed from the comparison for auditability. Dimensionless AOD.
   */
  differenceFromBaseline: number | null;
  /** Baseline sample standard deviation used as the divisor (dimensionless AOD). */
  baselineStandardDeviation: number | null;
  /** Number of same-calendar-month years behind the standard deviation. */
  baselineSampleCount: number;
  /** differenceFromBaseline / baselineStandardDeviation, in multiples of the SD. */
  standardizedDeparture: number | null;
  direction: AnomalyDirection | null;
  magnitudeBand: AnomalyMagnitudeBand | null;
  /** Short machine-readable reason when a standardized departure is withheld. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Derive a standardized departure from a completed aerosol seasonal-baseline
 * comparison.
 *
 * A standardized value is only produced when the comparison itself succeeded
 * (`status: "available"`, a finite `anomaly`) AND the baseline has a usable,
 * strictly positive sample standard deviation. A single-year baseline (no SD)
 * or a perfectly flat baseline (zero SD) cannot be standardized without
 * dividing by zero or inventing spread, so those withhold with a reason rather
 * than returning a fabricated number.
 */
export function standardizeAerosolSeasonalDeparture(
  comparison: AerosolSeasonalBaselineComparison
): AerosolStandardizedDeparture {
  const difference = comparison.anomaly;
  const standardDeviation = comparison.baseline.sampleStandardDeviation;
  const sampleCount = comparison.baseline.sampleCount;
  const base = {
    kind: "standardized-aerosol-seasonal-departure" as const,
    isForecast: false as const,
    source: comparison.source,
    wavelengthNm: comparison.wavelengthNm,
    unit: comparison.anomalyUnit,
    differenceFromBaseline: null,
    baselineStandardDeviation: null,
    baselineSampleCount: sampleCount,
    standardizedDeparture: null,
    direction: null,
    magnitudeBand: null,
    limitations: AEROSOL_STANDARDIZED_DEPARTURE_LIMITATIONS,
  };

  if (comparison.status !== "available" || difference === null) {
    return {
      ...base,
      status: "unavailable",
      reason: comparison.reason ?? `baseline-${comparison.status}`,
    };
  }
  if (!Number.isFinite(difference)) {
    return { ...base, status: "unavailable", reason: "invalid-anomaly" };
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

function directionOf(difference: number): AnomalyDirection {
  if (difference > 0) return "above";
  if (difference < 0) return "below";
  return "at";
}

function magnitudeBandOf(standardizedDeparture: number): AnomalyMagnitudeBand {
  const magnitude = Math.abs(standardizedDeparture);
  if (magnitude < 1) return "within-typical-spread";
  if (magnitude < 2) return "beyond-typical-spread";
  return "well-beyond-typical-spread";
}
