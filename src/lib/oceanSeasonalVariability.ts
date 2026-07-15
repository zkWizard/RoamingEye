import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import { neumaierSum } from "./numerics";
import type { UsableSstFootprint } from "./oceanSeasonalBaseline";
import type { YearMonth } from "./timeline";

/**
 * Source-aware calendar-month climatology of *interannual* SST variability.
 *
 * {@link summarizeSstSeasonalCycle} reduces a supplied MODIS/Aqua SST record to
 * the mean annual march (each calendar month's cross-year mean) and reports the
 * warmest and coldest months. That mean march says nothing about how *repeatable*
 * each month is: two footprints with an identical seasonal cycle can differ
 * sharply in how much, say, every August departs from its own long-run mean.
 * {@link compareSstToSeasonalBaseline} does quantify that spread, but only for a
 * single target calendar month (the divisor behind one standardized anomaly).
 *
 * This helper fills the gap between them: for every calendar month it computes
 * the *sample standard deviation of the SST across its supplied years* at a
 * single surface footprint, yielding the seasonal march of interannual
 * variability — which months of the year are most and least reproducible. That
 * spread is exactly what a same-month anomaly is normalized against, so reporting
 * it alongside the cycle keeps an anomaly's magnitude interpretable.
 *
 * Everything stays in the source unit and honest about its record: the per-month
 * spreads are sample standard deviations over a short observed record, not a
 * climate-normal variance, an intramonthly/measurement spread, a trend, or a
 * forecast. Open-water and land-mixed coastal footprints are never combined.
 * Nothing here infers biological abundance, habitat quality, ecosystem health,
 * marine heat stress, causation, or future ocean conditions.
 */

/**
 * A sample standard deviation is only meaningful over a handful of years; five
 * distinct years is a conservative floor for a per-month interannual spread
 * (thinner than this and the estimate is dominated by sampling noise). The cycle
 * needs only a mean, so its floor is lower; here we ask for more.
 */
export const MINIMUM_YEARS_PER_VARIABILITY_MONTH = 5;

/** Two qualifying calendar months are needed for a most-vs-least comparison. */
export const MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY = 2;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_SST_VARIABILITY_VALID_FRACTION = 0.6;

export type SstSeasonalVariabilityStatus =
  | "available"
  | "no-usable-observations"
  | "insufficient-qualified-months"
  | "invalid";

export interface SstSeasonalVariabilityOptions {
  /**
   * Footprint to build the variability march for. Defaults to the footprint
   * carrying the most usable supplied observations (ties resolve to open water),
   * so a caller never has to know the split in advance.
   */
  footprint?: UsableSstFootprint;
  /** Minimum distinct years required for a calendar month to qualify. */
  minimumYearsPerMonth?: number;
  /** Minimum usable spatial fraction for a contributing observation. */
  minimumValidFraction?: number;
}

export interface SstVariabilityMonth {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Mean of the per-year SST values for this calendar month, in the source unit. */
  mean: number;
  /** Distinct years contributing to the statistics. */
  yearCount: number;
  /**
   * Sample (n-1) standard deviation of the per-year SST values, in the source
   * unit; null when fewer than two distinct years contribute. This is an
   * interannual spread, not an intramonthly range or a measurement uncertainty.
   */
  sampleStandardDeviation: number | null;
  /** Whether the month met the minimum-years threshold to be comparable. */
  qualified: boolean;
}

export interface SstVariabilityExtreme {
  calendarMonth: number;
  /** Sample interannual standard deviation for the month, in the source unit. */
  sampleStandardDeviation: number;
  /** Distinct years behind the spread. */
  yearCount: number;
}

export interface SstSeasonalVariabilityExclusions {
  /** Supplied observations without a usable calendar month. */
  invalidMonth: number;
  /** Land, missing, invalid, or a footprint other than the chosen one. */
  footprintMismatch: number;
  /** Right footprint but usable spatial fraction below the threshold. */
  insufficientCoverage: number;
  /** Same (calendar month, year) supplied more than once; only the first is kept. */
  duplicateYearMonth: number;
}

export interface SstSeasonalVariabilitySummary {
  kind: "observed-sst-seasonal-variability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: SstSeasonalVariabilityStatus;
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** Footprint the march was built for, or null when none was usable. */
  footprint: UsableSstFootprint | null;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  requiredQualifiedMonths: number;
  /** Every calendar month with at least one contributing year, ordered 1-12. */
  months: SstVariabilityMonth[];
  /** Distinct calendar months that met the minimum-years threshold. */
  qualifiedMonthCount: number;
  /** Most interannually variable qualifying month; null when unavailable. */
  mostVariableMonth: SstVariabilityExtreme | null;
  /** Least interannually variable qualifying month; null when unavailable. */
  leastVariableMonth: SstVariabilityExtreme | null;
  /**
   * Most-minus-least qualifying monthly standard deviation (>= 0), in
   * `spreadUnit`. How much the interannual spread itself varies across the
   * seasons; not a variance, trend, or forecast.
   */
  variabilitySpread: number | null;
  /**
   * Unweighted mean of the qualifying months' sample standard deviations, in
   * `spreadUnit` — a single typical interannual spread across the year. Null
   * when no month qualifies.
   */
  meanSampleStandardDeviation: number | null;
  spreadUnit: string;
  exclusions: SstSeasonalVariabilityExclusions;
  limitations: typeof SST_SEASONAL_VARIABILITY_LIMITATIONS;
  /** Short machine-readable reason when no comparison is reported. */
  reason: string | null;
}

export const SST_SEASONAL_VARIABILITY_LIMITATIONS = [
  "Per-month spreads are sample (n-1) standard deviations over the supplied years; they are a short-record interannual spread, not a climate-normal variance.",
  "The spread is between-year for one calendar month; it is not an intramonthly range, a spatial spread, or a measurement uncertainty.",
  "Calendar months may rest on different numbers of years, so their spreads need not share sampling depth.",
  "Open-water and land-mixed coastal footprints are never combined; the march describes one footprint only.",
  "Spreads are reported in the source unit; they are not a variance, trend, or forecast of future variability.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement.",
] as const;

/**
 * Build a same-footprint calendar-month SST climatology and reduce it to the
 * interannual sample standard deviation of each calendar month, then to the most
 * and least variable months and their difference. A calendar month must gather
 * at least `minimumYearsPerMonth` distinct years to qualify, and at least two
 * calendar months must qualify before a most-vs-least comparison is reported, so
 * a sparse record yields an honest `insufficient-qualified-months` rather than a
 * one-month "march". Duplicate (calendar month, year) inputs keep only the first
 * so a re-supplied month cannot inflate a spread.
 */
export function summarizeSstSeasonalVariability(
  observations: readonly SeaSurfaceTemperatureObservation[],
  options: SstSeasonalVariabilityOptions = {}
): SstSeasonalVariabilitySummary {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_YEARS_PER_VARIABILITY_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_SST_VARIABILITY_VALID_FRACTION;
  const validOptions =
    Number.isInteger(requiredYearsPerMonth) &&
    // Two distinct years is the arithmetic floor for a sample standard
    // deviation; anything the caller lowers to must still respect it.
    requiredYearsPerMonth >= 2 &&
    Number.isFinite(requiredValidFraction) &&
    requiredValidFraction >= 0 &&
    requiredValidFraction <= 1 &&
    (options.footprint === undefined ||
      options.footprint === "water" ||
      options.footprint === "land-mixed-coastal");

  const exclusions = emptyExclusions();

  if (!validOptions) {
    return emptySummary(
      "invalid",
      null,
      requiredYearsPerMonth,
      requiredValidFraction,
      exclusions,
      "invalid-variability-configuration"
    );
  }

  const summaries = observations.map((observation) => {
    const summary = summarizeOceanConditions(observation);
    return { summary, footprint: usableFootprint(summary) };
  });

  const footprint = options.footprint ?? dominantFootprint(summaries);
  if (footprint === null) {
    return emptySummary(
      "no-usable-observations",
      null,
      requiredYearsPerMonth,
      requiredValidFraction,
      exclusions,
      "no-usable-sst-observations"
    );
  }

  // calendarMonth -> (year -> value), deduplicating repeated year-months.
  const byMonth = new Map<number, Map<number, number>>();
  for (const { summary, footprint: obsFootprint } of summaries) {
    if (!isCalendarMonth(summary.dataMonth)) {
      exclusions.invalidMonth += 1;
      continue;
    }
    if (obsFootprint === null || obsFootprint !== footprint) {
      // Land, missing, invalid, or the other footprint: never mixed in.
      exclusions.footprintMismatch += 1;
      continue;
    }
    if (!meetsCoverage(summary, requiredValidFraction)) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    const calendarMonth = summary.dataMonth.month;
    const year = summary.dataMonth.year;
    let years = byMonth.get(calendarMonth);
    if (years === undefined) {
      years = new Map<number, number>();
      byMonth.set(calendarMonth, years);
    }
    if (years.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    years.set(year, summary.observedValue as number);
  }

  const months = buildVariabilityMonths(byMonth, requiredYearsPerMonth);
  const qualified = months.filter((month) => month.qualified);

  const base = {
    footprint,
    requiredYearsPerMonth,
    requiredValidFraction,
    months,
    qualifiedMonthCount: qualified.length,
    exclusions,
  };

  if (qualified.length < MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY) {
    return {
      ...variabilitySummary(base),
      status: "insufficient-qualified-months",
      mostVariableMonth: null,
      leastVariableMonth: null,
      variabilitySpread: null,
      meanSampleStandardDeviation: meanQualifiedSpread(qualified),
      reason: "too-few-qualified-calendar-months",
    };
  }

  const most = pickExtreme(qualified, "most");
  const least = pickExtreme(qualified, "least");

  return {
    ...variabilitySummary(base),
    status: "available",
    mostVariableMonth: most,
    leastVariableMonth: least,
    variabilitySpread:
      most.sampleStandardDeviation - least.sampleStandardDeviation,
    meanSampleStandardDeviation: meanQualifiedSpread(qualified),
    reason: null,
  };
}

/**
 * Choose the footprint (open water vs. land-mixed coastal) carrying the most
 * usable observations, so the caller need not know the split. Ties resolve to
 * open water; a set with no usable footprint returns null.
 */
function dominantFootprint(
  summaries: readonly { footprint: UsableSstFootprint | null }[]
): UsableSstFootprint | null {
  let water = 0;
  let coastal = 0;
  for (const { footprint } of summaries) {
    if (footprint === "water") water += 1;
    else if (footprint === "land-mixed-coastal") coastal += 1;
  }
  if (water === 0 && coastal === 0) return null;
  return coastal > water ? "land-mixed-coastal" : "water";
}

function buildVariabilityMonths(
  byMonth: ReadonlyMap<number, ReadonlyMap<number, number>>,
  requiredYearsPerMonth: number
): SstVariabilityMonth[] {
  const months: SstVariabilityMonth[] = [];
  for (const [calendarMonth, years] of byMonth) {
    const values = [...years.values()];
    const mean = neumaierSum(values) / values.length;
    months.push({
      calendarMonth,
      mean,
      yearCount: values.length,
      sampleStandardDeviation: sampleStandardDeviation(values, mean),
      qualified: values.length >= requiredYearsPerMonth,
    });
  }
  months.sort((a, b) => a.calendarMonth - b.calendarMonth);
  return months;
}

/**
 * Sample (n-1) standard deviation of `values`, or null when fewer than two
 * values are supplied. Uses the precomputed mean and a Neumaier-compensated sum
 * of squared deviations for numerical stability at the small counts involved.
 */
function sampleStandardDeviation(
  values: readonly number[],
  mean: number
): number | null {
  if (values.length < 2) return null;
  const squaredDeviations = values.map((value) => (value - mean) ** 2);
  const variance = neumaierSum(squaredDeviations) / (values.length - 1);
  // Clamp tiny negative round-off before the square root.
  return Math.sqrt(Math.max(variance, 0));
}

/**
 * Pick the most or least interannually variable qualifying month, breaking ties
 * toward the earliest calendar month so the result is deterministic and
 * order-independent. Every qualifying month has a defined spread (>= 2 years).
 */
function pickExtreme(
  qualified: readonly SstVariabilityMonth[],
  which: "most" | "least"
): SstVariabilityExtreme {
  let best = qualified[0];
  for (const month of qualified) {
    const monthSpread = month.sampleStandardDeviation as number;
    const bestSpread = best.sampleStandardDeviation as number;
    if (monthSpread === bestSpread) {
      if (month.calendarMonth < best.calendarMonth) best = month;
      continue;
    }
    const isMoreExtreme =
      which === "most" ? monthSpread > bestSpread : monthSpread < bestSpread;
    if (isMoreExtreme) best = month;
  }
  return {
    calendarMonth: best.calendarMonth,
    sampleStandardDeviation: best.sampleStandardDeviation as number,
    yearCount: best.yearCount,
  };
}

/**
 * Unweighted mean of the qualifying months' sample standard deviations, or null
 * when no month qualifies. A single typical interannual spread across the year.
 */
function meanQualifiedSpread(
  qualified: readonly SstVariabilityMonth[]
): number | null {
  if (qualified.length === 0) return null;
  const spreads = qualified.map(
    (month) => month.sampleStandardDeviation as number
  );
  return neumaierSum(spreads) / spreads.length;
}

/**
 * The footprint whose coverage yields a usable SST value, or null when the
 * summary is land, missing, or invalid. Coastal and open-water SST are kept
 * distinct so a march never averages across them.
 */
function usableFootprint(
  summary: OceanConditionSummary
): UsableSstFootprint | null {
  if (summary.observedValue === null) return null;
  if (
    summary.coverage.status === "water" ||
    summary.coverage.status === "land-mixed-coastal"
  ) {
    return summary.coverage.status;
  }
  return null;
}

function meetsCoverage(
  summary: OceanConditionSummary,
  minimumValidFraction: number
): summary is OceanConditionSummary & { coverage: { validFraction: number } } {
  return (
    summary.coverage.validFraction !== null &&
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function variabilitySummary(base: {
  footprint: UsableSstFootprint;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  months: SstVariabilityMonth[];
  qualifiedMonthCount: number;
  exclusions: SstSeasonalVariabilityExclusions;
}): Omit<
  SstSeasonalVariabilitySummary,
  | "status"
  | "mostVariableMonth"
  | "leastVariableMonth"
  | "variabilitySpread"
  | "meanSampleStandardDeviation"
  | "reason"
> {
  return {
    kind: "observed-sst-seasonal-variability",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint: base.footprint,
    requiredYearsPerMonth: base.requiredYearsPerMonth,
    requiredValidFraction: base.requiredValidFraction,
    requiredQualifiedMonths: MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY,
    months: base.months,
    qualifiedMonthCount: base.qualifiedMonthCount,
    spreadUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions: base.exclusions,
    limitations: SST_SEASONAL_VARIABILITY_LIMITATIONS,
  };
}

function emptySummary(
  status: SstSeasonalVariabilityStatus,
  footprint: UsableSstFootprint | null,
  requiredYearsPerMonth: number,
  requiredValidFraction: number,
  exclusions: SstSeasonalVariabilityExclusions,
  reason: string
): SstSeasonalVariabilitySummary {
  return {
    kind: "observed-sst-seasonal-variability",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status,
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint,
    requiredYearsPerMonth,
    requiredValidFraction,
    requiredQualifiedMonths: MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY,
    months: [],
    qualifiedMonthCount: 0,
    mostVariableMonth: null,
    leastVariableMonth: null,
    variabilitySpread: null,
    meanSampleStandardDeviation: null,
    spreadUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions,
    limitations: SST_SEASONAL_VARIABILITY_LIMITATIONS,
    reason,
  };
}

function emptyExclusions(): SstSeasonalVariabilityExclusions {
  return {
    invalidMonth: 0,
    footprintMismatch: 0,
    insufficientCoverage: 0,
    duplicateYearMonth: 0,
  };
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}
