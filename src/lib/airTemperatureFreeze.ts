import type { MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Freeze-threshold context for a monthly-mean 2 m air-temperature observation.
 *
 * Water's freezing point is a hard, exact physical threshold (273.15 K at
 * standard pressure), so classifying a usable monthly-mean 2 m air temperature
 * as at, above, or below it is a factual categorical descriptor of that mean —
 * not an estimate, anomaly, forecast, or diagnosis. The classification derives
 * from the value the source product already reports; it invents nothing.
 *
 * The honesty limits are explicit and never dropped:
 * - It describes the MONTHLY MEAN only. A mean above freezing does not rule out
 *   sub-freezing days, and a mean below freezing does not rule out thaw days;
 *   daily highs and lows cannot be recovered from a monthly mean.
 * - The value is an area-mean of a reanalysis product (MERRA-2), not a station
 *   measurement, so the cited provenance travels with the classification.
 * - Only the 2 m air-temperature metric is classified. Other metrics return
 *   null so no caller mistakes an absent classification for a claim about them.
 */

/** Freezing point of water at standard sea-level pressure, in kelvin (exact). */
export const FREEZING_POINT_K = 273.15;

export type FreezeThresholdCategory =
  "below-freezing" | "at-freezing" | "above-freezing";

export type FreezeThresholdStatus = "classified" | "unavailable";

export interface AirTemperatureFreezeContext {
  kind: "air-temperature-freeze-threshold";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  dataMonth: YearMonth;
  source: DatasetRef;
  status: FreezeThresholdStatus;
  /** Usable monthly-mean value in kelvin, unchanged; null when unavailable. */
  observedKelvin: number | null;
  /**
   * Signed distance from {@link FREEZING_POINT_K} in kelvin (positive above
   * freezing). This equals the temperature in degrees Celsius, since °C is an
   * exact −273.15 offset from kelvin. Null when unavailable.
   */
  marginKelvin: number | null;
  category: FreezeThresholdCategory | null;
  /** Why a classification could not be made; null when classified. */
  reason: string | null;
  /** Honest, provenance-tagged descriptor of the monthly mean only. */
  statement: string;
}

/**
 * Classify one monthly-mean 2 m air-temperature summary against the freezing
 * point. Returns null for any non-air-temperature metric (out of scope). For
 * the air-temperature metric it always returns a context object: `classified`
 * when the summary carries a usable published observation, otherwise
 * `unavailable` with the cited provenance still attached.
 */
export function describeAirTemperatureFreezeThreshold(
  summary: MonthlyClimateSummary
): AirTemperatureFreezeContext | null {
  if (summary.metric.id !== "air-temperature-2m") {
    return null;
  }

  const source = summary.metric.source;
  const usable =
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.observedValue !== null;

  if (!usable || summary.observedValue === null) {
    const reason = unavailableReason(summary);
    return {
      kind: "air-temperature-freeze-threshold",
      isForecast: false,
      dataMonth: summary.dataMonth,
      source,
      status: "unavailable",
      observedKelvin: null,
      marginKelvin: null,
      category: null,
      reason,
      statement: `No usable 2 m air-temperature observation for ${formatMonth(
        summary.dataMonth
      )} (${reason}); freeze-threshold classification withheld; source ${sourceLabel(
        source
      )}.`,
    };
  }

  const observedKelvin = summary.observedValue;
  const marginKelvin = observedKelvin - FREEZING_POINT_K;
  const category = categoryFor(marginKelvin);

  return {
    kind: "air-temperature-freeze-threshold",
    isForecast: false,
    dataMonth: summary.dataMonth,
    source,
    status: "classified",
    observedKelvin,
    marginKelvin,
    category,
    reason: null,
    statement: classifiedStatement(
      summary.dataMonth,
      observedKelvin,
      marginKelvin,
      category,
      source
    ),
  };
}

function categoryFor(marginKelvin: number): FreezeThresholdCategory {
  if (marginKelvin > 0) return "above-freezing";
  if (marginKelvin < 0) return "below-freezing";
  return "at-freezing";
}

function classifiedStatement(
  dataMonth: YearMonth,
  observedKelvin: number,
  marginKelvin: number,
  category: FreezeThresholdCategory,
  source: DatasetRef
): string {
  const month = formatMonth(dataMonth);
  const value = formatNumber(observedKelvin);
  const relation =
    category === "at-freezing"
      ? `at the ${FREEZING_POINT_K} K freezing point`
      : `${category === "above-freezing" ? "above" : "below"} the ${
          FREEZING_POINT_K
        } K freezing point by ${formatNumber(Math.abs(marginKelvin))} K`;
  return `Monthly-mean 2 m air temperature ${value} K is ${relation} for ${month}; monthly mean only — does not describe daily highs or lows; source ${sourceLabel(
    source
  )}.`;
}

function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

function sourceLabel(source: DatasetRef): string {
  return `${source.shortName} v${source.version}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(6)).toString();
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
