import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Derive a monthly precipitation *accumulation* (a total depth) from a supplied
 * GLDAS monthly-mean precipitation-rate observation.
 *
 * The climate summary path reports precipitation as a monthly-mean *rate*
 * (kg/m²/s). A conventional-unit companion (see climateConventionalUnits.ts)
 * re-expresses that rate as mm/day. Neither answers the plainest hydrologic
 * question about a month — *how much water fell?* — because that is the rate
 * integrated over the month's actual length, and month length varies (28–31
 * days, leap Februaries included).
 *
 * This helper performs only that integration: it multiplies the reported
 * monthly-mean rate by the number of seconds in the data month to yield a
 * total accumulated depth in mm water-equivalent. It adds no anomaly, regime
 * classification, drought signal, causation, or forecast — just a dimensional
 * re-expression of one already-usable observation onto a hydrologically legible
 * scale, carrying the same cited provenance.
 */

/** Seconds in a 24-hour day; the rate → accumulation integration factor. */
export const SECONDS_PER_DAY = 86_400;

/** Honest scope limits for the derived accumulation total. */
export const PRECIP_ACCUMULATION_LIMITATIONS =
  "Total accumulated depth is the GLDAS monthly-mean precipitation rate " +
  "integrated over the calendar month (rate × seconds in month). It assumes " +
  "the reported value is a monthly-mean rate and inherits the land-model " +
  "product's resolution and biases. 1 kg/m² of water equals 1 mm of depth. " +
  "It is a plain re-expression of one observation, not a rain-gauge total, " +
  "anomaly, regime class, drought signal, or forecast.";

export interface PrecipitationAccumulation {
  kind: "derived-monthly-precip-accumulation";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Total accumulated depth over the data month, in mm water-equivalent. */
  totalMm: number;
  /** Month the accumulation total covers. */
  dataMonth: YearMonth;
  /** Days in the data month used to integrate the mean rate. */
  monthDays: number;
  /** Seconds in the data month used to integrate the mean rate. */
  monthSeconds: number;
  /** Same cited product as the source observation; provenance is preserved. */
  source: DatasetRef;
}

/**
 * Integrate a published, usable monthly-mean precipitation-rate observation
 * into a total accumulated depth for its month.
 *
 * Returns `null` — never a fabricated total — for any summary that is not a
 * usable precipitation-rate observation: a different metric, a not-yet-published
 * or invalid-reference month, absent/invalid coverage, or a non-finite value.
 * A `null` therefore means "no total can be stated", never "zero fell".
 */
export function precipitationAccumulation(
  summary: MonthlyClimateSummary
): PrecipitationAccumulation | null {
  if (summary.metric.id !== "precipitation-rate") return null;
  if (summary.publicationStatus !== "published") return null;
  if (summary.coverage.status !== "available") return null;

  const rate = summary.observedValue;
  if (rate === null || !Number.isFinite(rate) || rate < 0) return null;

  const monthDays = daysInMonth(summary.dataMonth);
  if (monthDays === null) return null;

  const monthSeconds = monthDays * SECONDS_PER_DAY;
  return {
    kind: "derived-monthly-precip-accumulation",
    isForecast: false,
    totalMm: rate * monthSeconds,
    dataMonth: summary.dataMonth,
    monthDays,
    monthSeconds,
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
  // the intended month; matches the convention in placeInsights.ts.
  return new Date(Date.UTC(month.year, month.month, 0)).getUTCDate();
}
