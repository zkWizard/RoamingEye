import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  summarizeOceanConditions,
  type OceanConditionSummary,
  type OceanCoverageStatus,
  type SeaSurfaceTemperatureBand,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import { compareYm, type YearMonth } from "./timeline";

/**
 * Descriptive extent of a supplied set of monthly MODIS/Aqua SST observations.
 *
 * This reduces several monthly SST observations to an honest coverage tally and
 * the observed warmest/coolest months within the supplied set. It intentionally
 * derives no central tendency, trend, rate, anomaly, or forecast: an unweighted
 * statistic across an arbitrary mix of months and boundaries could imply a
 * climatology the source does not support. It never infers marine-biological
 * abundance, habitat, ecosystem condition, causation, or future conditions.
 *
 * Same-calendar-month baselines (see oceanSeasonalBaseline) and pairwise
 * month-over-month change (see oceanConditionChange) remain separate concerns.
 */

/** A usable monthly reading kept for the extent/extremes description. */
export interface OceanConditionSeriesReading {
  dataMonth: YearMonth;
  /** Retained in `metric.sourceUnit`; only present when the month is usable. */
  observedValue: number;
  temperatureBand: SeaSurfaceTemperatureBand;
}

export type OceanCoverageTally = Record<OceanCoverageStatus, number>;

export type OceanConditionSeriesStatus = "available" | "duplicate-months";

export interface OceanConditionSeriesSummary {
  kind: "observed-sea-surface-temperature-series";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-extent-only";
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** Duplicate calendar months make cross-month extremes ambiguous. */
  status: OceanConditionSeriesStatus;
  /** Total supplied observations, including unusable months. */
  monthCount: number;
  /** Number of distinct valid calendar months represented by the inputs. */
  distinctMonthCount: number;
  /** Repeated valid calendar months, sorted chronologically and listed once. */
  duplicateMonths: YearMonth[];
  /** Months carrying a usable SST value (water or coastal/land-mixed footprint). */
  usableMonthCount: number;
  /** Supplied months without a usable SST value (land, missing, or invalid). */
  unusableMonthCount: number;
  /** Count of supplied months by their per-month coverage status. */
  coverageTally: OceanCoverageTally;
  /** Per-month summaries in supplied order; provenance is preserved per month. */
  months: OceanConditionSummary[];
  /**
   * Warmest and coolest usable months in the supplied set. Ties resolve to the
   * earliest month. Both are null when no month is usable.
   */
  extremes: {
    warmest: OceanConditionSeriesReading | null;
    coolest: OceanConditionSeriesReading | null;
  };
  /**
   * Observed spread (warmest − coolest) across usable months in the source
   * unit, or null when fewer than two months are usable. This is a range of the
   * supplied observations, not a variability estimate or a trend.
   */
  observedValueRange: number | null;
  limitations: typeof OCEAN_CONDITION_SERIES_LIMITATIONS;
}

export const OCEAN_CONDITION_SERIES_LIMITATIONS = [
  "This is a descriptive summary of the supplied months only; it is not a climatology.",
  "No mean, trend, rate, anomaly, or forecast is derived; warmest and coolest describe the supplied set.",
  "Per-month coverage varies, so the extremes are not guaranteed to share sampling completeness.",
  "Repeated records for one calendar month are retained but cross-month extremes are withheld because the series is temporally ambiguous.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

const EMPTY_COVERAGE_TALLY: OceanCoverageTally = {
  water: 0,
  "land-mixed-coastal": 0,
  land: 0,
  missing: 0,
  invalid: 0,
};

/**
 * Summarize the extent of a supplied SST observation series without merging the
 * months into a single value or implying a temporal relationship between them.
 */
export function summarizeOceanConditionSeries(
  observations: readonly SeaSurfaceTemperatureObservation[]
): OceanConditionSeriesSummary {
  const months = observations.map(summarizeOceanConditions);
  const { distinctMonthCount, duplicateMonths } = calendarMonthCoverage(months);
  const hasDuplicateMonths = duplicateMonths.length > 0;

  const coverageTally: OceanCoverageTally = { ...EMPTY_COVERAGE_TALLY };
  for (const month of months) {
    coverageTally[month.coverage.status] += 1;
  }

  const usable = months.filter(
    (month): month is OceanConditionSummary & { observedValue: number } =>
      month.observedValue !== null && month.temperatureBand !== null
  );

  const warmest = hasDuplicateMonths ? null : pickExtreme(usable, "warmest");
  const coolest = hasDuplicateMonths ? null : pickExtreme(usable, "coolest");

  return {
    kind: "observed-sea-surface-temperature-series",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-extent-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    status: hasDuplicateMonths ? "duplicate-months" : "available",
    monthCount: months.length,
    distinctMonthCount,
    duplicateMonths,
    usableMonthCount: usable.length,
    unusableMonthCount: months.length - usable.length,
    coverageTally,
    months,
    extremes: { warmest, coolest },
    observedValueRange:
      warmest && coolest ? warmest.observedValue - coolest.observedValue : null,
    limitations: OCEAN_CONDITION_SERIES_LIMITATIONS,
  };
}

function calendarMonthCoverage(months: readonly OceanConditionSummary[]): {
  distinctMonthCount: number;
  duplicateMonths: YearMonth[];
} {
  const counts = new Map<string, { dataMonth: YearMonth; count: number }>();
  for (const month of months) {
    if (month.coverage.reason === "invalid-month") continue;
    const key = `${month.dataMonth.year}-${month.dataMonth.month}`;
    const existing = counts.get(key);
    if (existing) existing.count += 1;
    else counts.set(key, { dataMonth: month.dataMonth, count: 1 });
  }

  return {
    distinctMonthCount: counts.size,
    duplicateMonths: [...counts.values()]
      .filter(({ count }) => count > 1)
      .map(({ dataMonth }) => dataMonth)
      .sort(compareYm),
  };
}

/**
 * Choose the warmest or coolest usable month, breaking value ties toward the
 * earliest calendar month so the result is deterministic and order-independent.
 */
function pickExtreme(
  usable: readonly (OceanConditionSummary & { observedValue: number })[],
  which: "warmest" | "coolest"
): OceanConditionSeriesReading | null {
  let best: (OceanConditionSummary & { observedValue: number }) | null = null;
  for (const month of usable) {
    if (best === null) {
      best = month;
      continue;
    }
    if (month.observedValue === best.observedValue) {
      if (compareYm(month.dataMonth, best.dataMonth) < 0) best = month;
      continue;
    }
    const isMoreExtreme =
      which === "warmest"
        ? month.observedValue > best.observedValue
        : month.observedValue < best.observedValue;
    if (isMoreExtreme) best = month;
  }

  if (best === null) return null;
  return {
    dataMonth: best.dataMonth,
    observedValue: best.observedValue,
    // Usable months always carry a band; this narrows the null away for callers.
    temperatureBand: best.temperatureBand as SeaSurfaceTemperatureBand,
  };
}
