import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import type { YearMonth } from "./timeline";

/**
 * Month-over-month change between two supplied MODIS/Aqua SST observations.
 *
 * This describes only the arithmetic difference between two directly supplied
 * monthly sea-surface-temperature observations for the same place. Two points
 * are a difference, not a trend, rate, or climatology: this model never fits a
 * trend, never estimates a warming rate, never fills the months in between, and
 * never infers biological abundance, habitat, ecosystem condition, marine
 * heat-wave status, causal drivers, risk, or future conditions. For an anomaly
 * against a multi-year same-calendar-month baseline, see seasonalBaseline.ts.
 */

export type OceanConditionChangeStatus =
  | "available"
  | "earlier-not-usable"
  | "later-not-usable"
  | "both-not-usable"
  | "non-chronological"
  | "invalid";

export type OceanConditionChangeDirection = "warmer" | "cooler" | "unchanged";

export interface OceanConditionChangeInput {
  /** The earlier of the two supplied monthly SST observations. */
  earlier: SeaSurfaceTemperatureObservation;
  /** The later of the two supplied monthly SST observations. */
  later: SeaSurfaceTemperatureObservation;
}

export interface OceanConditionChangeSummary {
  kind: "observed-sea-surface-temperature-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents two observations from being read as a trend. */
  isTrend: false;
  claimScope: "descriptive-difference-between-two-observations-only";
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  status: OceanConditionChangeStatus;
  /** Per-month condition summaries, retained verbatim for auditability. */
  earlier: OceanConditionSummary;
  later: OceanConditionSummary;
  /** Calendar-month gap from earlier to later; null when a month is invalid. */
  monthSpan: number | null;
  /**
   * `later.observedValue - earlier.observedValue` in `metric.sourceUnit`.
   * Null unless both months are usable water/coastal SST observations.
   */
  change: number | null;
  /** Same unit as `metric.sourceUnit`; no display conversion is applied. */
  changeUnit: string;
  /** Sign-only descriptor of the difference, never a rate or trend. */
  direction: OceanConditionChangeDirection | null;
  /**
   * Weakest usable spatial coverage across the two months, when both months
   * supplied spatial coverage. Null when either month omitted coverage, so a
   * partial sample is never presented as fuller than it is.
   */
  minValidFraction: number | null;
  /** Short machine-readable reason when no change is reported. */
  reason: string | null;
}

/**
 * Compare two supplied monthly SST observations for the same place. Each month
 * is validated independently through `summarizeOceanConditions`, so land,
 * missing, and invalid months are surfaced honestly rather than differenced.
 * The later month must be strictly after the earlier month; equal or reversed
 * months yield a non-chronological status instead of a misleading direction.
 */
export function summarizeOceanConditionChange(
  input: OceanConditionChangeInput
): OceanConditionChangeSummary {
  const earlier = summarizeOceanConditions(input.earlier);
  const later = summarizeOceanConditions(input.later);
  const base = {
    kind: "observed-sea-surface-temperature-change",
    isForecast: false,
    isTrend: false,
    claimScope: "descriptive-difference-between-two-observations-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    earlier,
    later,
    changeUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
  } as const;

  const validMonths =
    isYearMonth(input.earlier.dataMonth) && isYearMonth(input.later.dataMonth);
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

  const earlierUsable = earlier.observedValue !== null;
  const laterUsable = later.observedValue !== null;
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
      reason: earlier.coverage.reason ?? "earlier-month-not-usable",
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
      reason: later.coverage.reason ?? "later-month-not-usable",
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

function directionFor(change: number): OceanConditionChangeDirection {
  if (change > 0) return "warmer";
  if (change < 0) return "cooler";
  return "unchanged";
}

/**
 * Report the lower of the two supplied valid fractions so callers see the
 * weakest month. Returns null when either month omitted coverage, because the
 * true minimum is then unknown and must not be understated.
 */
function weakestCoverage(
  earlier: OceanConditionSummary,
  later: OceanConditionSummary
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
