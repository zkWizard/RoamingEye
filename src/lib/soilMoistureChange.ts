import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetric,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import type { YearMonth } from "./timeline";

/**
 * Month-over-month change between two supplied GLDAS soil-moisture observations.
 *
 * The soil layer renders GLDAS-Noah underground (root-zone) soil moisture as a
 * modeled column water content in kg/m². This helper describes only the
 * arithmetic difference between two directly supplied monthly values for the
 * *same place*: whether the modeled column got wetter or drier, and by how much
 * in native units. Two points are a difference, not a trend, rate, or anomaly.
 *
 * Column water content scales with the model's soil-column depth, so a raw
 * value is only comparable to another value for the same location. Restricting
 * this helper to a same-place difference is what keeps it honest — a difference
 * between two other places would conflate column depth with wetness. It never
 * fits a trend, estimates a drying rate, fills the months in between, computes a
 * climatological anomaly (see seasonalBaseline.ts for that), or infers drought
 * category, recharge, runoff, evapotranspiration, water-balance closure, cause,
 * or any future value.
 *
 * Each month is validated independently through `summarizeMonthlyClimate`, and
 * a change is reported only when both months are published with usable
 * coverage, so an unpublished future month is never differenced into a signal.
 *
 * Pure, render-free logic (see soilMoistureChange.test.ts).
 */

/** Cited GLDAS soil-moisture metric backing every change description. */
export const SOIL_MOISTURE_CHANGE_METRIC: ClimateMetric =
  CLIMATE_METRICS["soil-moisture"];

/**
 * A supplied monthly soil-moisture observation. The metric is fixed, so callers
 * cannot accidentally difference a non–soil-moisture layer through this helper.
 */
export type SoilMoistureObservation = Omit<
  MonthlyClimateObservation,
  "metricId"
>;

export type SoilMoistureChangeStatus =
  | "available"
  | "earlier-not-usable"
  | "later-not-usable"
  | "both-not-usable"
  | "non-chronological"
  | "invalid";

export type SoilMoistureChangeDirection = "wetter" | "drier" | "unchanged";

export interface SoilMoistureChangeInput {
  /** The earlier of the two supplied monthly soil-moisture observations. */
  earlier: SoilMoistureObservation;
  /** The later of the two supplied monthly soil-moisture observations. */
  later: SoilMoistureObservation;
  /** Month through which the caller had confirmed source availability. */
  availableThrough: YearMonth;
}

export const SOIL_MOISTURE_CHANGE_LIMITATIONS = [
  "Values are GLDAS-Noah modeled column soil-water content in kg/m², not a direct in-situ measurement.",
  "A change is the arithmetic difference between two supplied months; it is not a trend, rate, or climatological anomaly.",
  "Column water content scales with the model's soil-column depth, so only same-place differences are meaningful — never a comparison between two different locations.",
  "This description never infers drought category, recharge, runoff, evapotranspiration, water-balance closure, cause, or any future value.",
] as const;

export interface SoilMoistureChangeSummary {
  kind: "observed-soil-moisture-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents two observations from being read as a trend. */
  isTrend: false;
  claimScope: "descriptive-difference-between-two-observations-only";
  metric: ClimateMetric;
  status: SoilMoistureChangeStatus;
  /** Per-month climate summaries, retained verbatim for auditability. */
  earlier: MonthlyClimateSummary;
  later: MonthlyClimateSummary;
  /** Calendar-month gap from earlier to later; null when a month is invalid. */
  monthSpan: number | null;
  /**
   * `later.observedValue - earlier.observedValue` in `metric.nativeUnit`.
   * Null unless both months are published, usable soil-moisture observations.
   */
  change: number | null;
  /** Same unit as `metric.nativeUnit`; no display conversion is applied. */
  changeUnit: string;
  /** Sign-only descriptor of the difference, never a rate or trend. */
  direction: SoilMoistureChangeDirection | null;
  /**
   * Weakest usable spatial coverage across the two months, when both months
   * supplied spatial coverage. Null when either month omitted coverage, so a
   * partial sample is never presented as fuller than it is.
   */
  minValidFraction: number | null;
  /** Short machine-readable reason when no change is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Compare two supplied monthly soil-moisture observations for the same place.
 * Each month is validated independently, so missing, invalid, and not-yet-
 * published months are surfaced honestly rather than differenced. The later
 * month must be strictly after the earlier month; equal or reversed months
 * yield a non-chronological status instead of a misleading direction.
 */
export function summarizeSoilMoistureChange(
  input: SoilMoistureChangeInput
): SoilMoistureChangeSummary {
  const earlier = summarizeMonthlyClimate(
    { ...input.earlier, metricId: "soil-moisture" },
    input.availableThrough
  );
  const later = summarizeMonthlyClimate(
    { ...input.later, metricId: "soil-moisture" },
    input.availableThrough
  );
  const base = {
    kind: "observed-soil-moisture-change",
    isForecast: false,
    isTrend: false,
    claimScope: "descriptive-difference-between-two-observations-only",
    metric: SOIL_MOISTURE_CHANGE_METRIC,
    earlier,
    later,
    changeUnit: SOIL_MOISTURE_CHANGE_METRIC.nativeUnit,
    limitations: SOIL_MOISTURE_CHANGE_LIMITATIONS,
  } as const;

  const validMonths =
    isYearMonth(input.earlier.dataMonth) &&
    isYearMonth(input.later.dataMonth) &&
    isYearMonth(input.availableThrough);
  if (!validMonths) {
    return {
      ...base,
      status: "invalid",
      monthSpan: null,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: "invalid-month",
    };
  }

  const monthSpan = monthDistance(
    input.earlier.dataMonth,
    input.later.dataMonth
  );
  if (monthSpan <= 0) {
    return {
      ...base,
      status: "non-chronological",
      monthSpan,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: monthSpan === 0 ? "same-month" : "reversed-order",
    };
  }

  const earlierUsable = isUsable(earlier);
  const laterUsable = isUsable(later);
  if (!earlierUsable && !laterUsable) {
    return {
      ...base,
      status: "both-not-usable",
      monthSpan,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: "both-months-not-usable",
    };
  }
  if (!earlierUsable) {
    return {
      ...base,
      status: "earlier-not-usable",
      monthSpan,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: unusableReason(earlier),
    };
  }
  if (!laterUsable) {
    return {
      ...base,
      status: "later-not-usable",
      monthSpan,
      change: null,
      direction: null,
      minValidFraction: null,
      reason: unusableReason(later),
    };
  }

  const change = later.observedValue! - earlier.observedValue!;
  return {
    ...base,
    status: "available",
    monthSpan,
    change,
    direction: directionFor(change),
    minValidFraction: weakestCoverage(earlier, later),
    reason: null,
  };
}

/**
 * A month is usable for differencing only when it is published within the
 * caller's confirmed availability and carries a usable observed value. Treating
 * an unpublished month as usable would dress a future placeholder up as data.
 */
function isUsable(summary: MonthlyClimateSummary): boolean {
  return (
    summary.publicationStatus === "published" && summary.observedValue !== null
  );
}

function unusableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return "not-yet-published";
  }
  return summary.coverage.reason ?? "not-usable";
}

function directionFor(change: number): SoilMoistureChangeDirection {
  if (change > 0) return "wetter";
  if (change < 0) return "drier";
  return "unchanged";
}

/**
 * Report the lower of the two supplied valid fractions so callers see the
 * weakest month. Returns null when either month omitted coverage, because the
 * true minimum is then unknown and must not be understated.
 */
function weakestCoverage(
  earlier: MonthlyClimateSummary,
  later: MonthlyClimateSummary
): number | null {
  const a = earlier.coverage.validFraction;
  const b = later.coverage.validFraction;
  if (a === null || b === null) return null;
  return Math.min(a, b);
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
