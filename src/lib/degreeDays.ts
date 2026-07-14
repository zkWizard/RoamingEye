import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Approximate monthly heating and cooling degree-days from a supplied
 * monthly-mean 2 m air-temperature observation.
 *
 * Heating degree-days (HDD) and cooling degree-days (CDD) are among the most
 * widely used derived climate quantities: they accumulate how far, and for how
 * long, temperature sits below (heating) or above (cooling) a fixed base. The
 * textbook definition integrates *daily* means:
 *   HDD = Σ over days of max(0, base − T_day)
 *   CDD = Σ over days of max(0, T_day − base)
 *
 * The climate summary path only carries a monthly *mean* temperature, so this
 * helper computes the *monthly-mean approximation* of those sums — the mean
 * excess/deficit against the base, multiplied by the month's actual day count:
 *   HDD ≈ monthDays × max(0, base − T_mean)
 *   CDD ≈ monthDays × max(0, T_mean − base)
 *
 * That approximation is exact only when every day equals the monthly mean. When
 * daily temperatures straddle the base within the month, it SYSTEMATICALLY
 * UNDERESTIMATES both HDD and CDD, because max(0, ·) is convex (Jensen's
 * inequality): the mean of the clipped deficits is at least the clipped mean.
 * The bias is largest in transition seasons when the monthly mean sits near the
 * base. This is a well-known limitation of monthly-mean degree-day estimates
 * and is stated plainly in {@link DEGREE_DAYS_LIMITATIONS}; the result is never
 * presented as a daily-resolved, station, or forecast quantity.
 *
 * Only the 2 m air-temperature metric is derived. Other metrics return null so
 * no caller mistakes an absent derivation for a claim about them.
 */

/** Kelvin → Celsius offset (exact, standard-pressure freezing point of water). */
export const KELVIN_TO_CELSIUS_OFFSET = 273.15;

/**
 * Conventional base temperature for heating/cooling degree-days, in °C. 18 °C
 * (≈64.4 °F) is the WMO/metric-standard balance point; national conventions
 * differ (US 18.3 °C / 65 °F, UK 15.5 °C), so the base is configurable and is
 * always reported alongside the result.
 */
export const DEFAULT_DEGREE_DAY_BASE_C = 18;

/** Honest scope limits for the monthly-mean degree-day approximation. */
export const DEGREE_DAYS_LIMITATIONS =
  "Heating and cooling degree-days here are the monthly-mean approximation: " +
  "the mean excess or deficit of the MERRA-2 monthly-mean 2 m air temperature " +
  "against the base, times the month's actual day count. True degree-days sum " +
  "daily means; because the deficit is clipped at zero (a convex function), " +
  "the monthly-mean method systematically UNDERESTIMATES both totals when daily " +
  "temperatures cross the base within the month, most in transition seasons " +
  "when the mean sits near the base. Values are area-mean reanalysis, not " +
  "station data, and carry the source product's resolution and biases. This is " +
  "a plain derivation from one observation, not a daily-resolved total, energy " +
  "estimate, anomaly, or forecast.";

export interface MonthlyDegreeDays {
  kind: "derived-monthly-degree-days";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Base temperature the excess/deficit is measured against, in °C. */
  baseC: number;
  /** Month the degree-day totals cover. */
  dataMonth: YearMonth;
  /** Days in the data month used to scale the mean deficit/excess. */
  monthDays: number;
  /** Monthly-mean 2 m air temperature in °C the derivation used. */
  meanTemperatureC: number;
  /** Heating degree-days (°C·day); 0 when the mean is at or above the base. */
  heatingDegreeDays: number;
  /** Cooling degree-days (°C·day); 0 when the mean is at or below the base. */
  coolingDegreeDays: number;
  /** Same cited product as the source observation; provenance is preserved. */
  source: DatasetRef;
}

export interface DegreeDayOptions {
  /** Base temperature in °C; defaults to {@link DEFAULT_DEGREE_DAY_BASE_C}. */
  baseC?: number;
}

/**
 * Approximate a published, usable monthly-mean 2 m air-temperature observation's
 * heating and cooling degree-days for its month.
 *
 * Returns `null` — never fabricated totals — for any summary that is not a
 * usable air-temperature observation (a different metric, a not-yet-published or
 * invalid-reference month, absent/invalid coverage, a non-finite value) or when
 * a non-finite base is supplied. For a given month at most one of HDD/CDD is
 * non-zero; both are zero only when the mean sits exactly on the base. A `null`
 * therefore means "no degree-days can be stated", never "zero heating demand".
 */
export function monthlyDegreeDays(
  summary: MonthlyClimateSummary,
  options: DegreeDayOptions = {}
): MonthlyDegreeDays | null {
  if (summary.metric.id !== "air-temperature-2m") return null;
  if (summary.publicationStatus !== "published") return null;
  if (summary.coverage.status !== "available") return null;

  const kelvin = summary.observedValue;
  if (kelvin === null || !Number.isFinite(kelvin) || kelvin <= 0) return null;

  const baseC = options.baseC ?? DEFAULT_DEGREE_DAY_BASE_C;
  if (!Number.isFinite(baseC)) return null;

  const monthDays = daysInMonth(summary.dataMonth);
  if (monthDays === null) return null;

  const meanTemperatureC = kelvin - KELVIN_TO_CELSIUS_OFFSET;
  const heatingDeficit = Math.max(0, baseC - meanTemperatureC);
  const coolingExcess = Math.max(0, meanTemperatureC - baseC);

  return {
    kind: "derived-monthly-degree-days",
    isForecast: false,
    baseC,
    dataMonth: summary.dataMonth,
    monthDays,
    meanTemperatureC,
    heatingDegreeDays: monthDays * heatingDeficit,
    coolingDegreeDays: monthDays * coolingExcess,
    source: summary.metric.source,
  };
}

/**
 * Calendar days in a `YearMonth`, honouring leap Februaries, or `null` for a
 * malformed month. A published summary always carries a valid month, but the
 * guard keeps this helper safe for any caller.
 */
function daysInMonth(month: YearMonth): number | null {
  if (
    !Number.isInteger(month.year) ||
    !Number.isInteger(month.month) ||
    month.month < 1 ||
    month.month > 12
  ) {
    return null;
  }
  // Day 0 of the following month (month is 1-based here) is the last day of
  // the intended month; matches the convention in precipitationAccumulation.ts.
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
