import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetric,
  type MonthlyClimateObservation,
} from "./climate";
import { neumaierSum } from "./numerics";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Source-aware calendar-month climatology of *interannual* 2 m air-temperature
 * variability.
 *
 * `describeAirTemperatureAnnualCycle` reduces a supplied MERRA-2 record to the
 * mean annual march (each calendar month's cross-year mean) and reports the
 * warmest and coldest months. That mean march says nothing about how
 * *repeatable* each month is: two sites with an identical mean seasonal cycle
 * can differ sharply in how much, say, every January departs from its own
 * long-run mean. `describeAirTemperatureRecordMargin` and the standardized-
 * departure descriptors do use that spread, but only for a single target
 * calendar month (the divisor behind one standardized anomaly).
 *
 * This helper fills the gap between them: for every calendar month it computes
 * the *sample standard deviation of the 2 m air temperature across its supplied
 * years* at a single sampled footprint, yielding the seasonal march of
 * interannual variability — which months of the year are least and most
 * reproducible. That per-month spread is exactly what a same-month anomaly is
 * normalized against, so reporting the whole march keeps an anomaly's magnitude
 * interpretable.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - Per-month spreads are sample (n-1) standard deviations over the SUPPLIED
 *    years only — a short-record interannual spread, not a 30-year climate-
 *    normal variance. A short record shifts with the years it happens to hold.
 *  - The spread is between-year for one calendar month; it is not an intra-
 *    monthly range, a spatial spread over the footprint, or a measurement
 *    uncertainty.
 *  - Calendar months may rest on different numbers of years, so their spreads
 *    need not share sampling depth.
 *  - A kelvin standard deviation is numerically the same figure in °C, so a
 *    spread of temperatures needs no unit conversion.
 *  - Values are approximate regional statistics at the sampled footprint and
 *    inherit the MERRA-2 reanalysis product's resolution and biases. Nothing
 *    here is a forecast, a trend in variability, an external-baseline anomaly,
 *    attribution, or a diagnosis.
 */

/** The metric this descriptor is defined for; it is temperature-only. */
const AIR_TEMPERATURE_METRIC: ClimateMetric =
  CLIMATE_METRICS["air-temperature-2m"];

/**
 * A sample standard deviation is only meaningful over a handful of years; five
 * distinct years is a conservative floor for a per-month interannual spread
 * (thinner than this and the estimate is dominated by sampling noise). The mean
 * annual cycle needs only a mean, so its floor is lower; here we ask for more.
 */
export const MINIMUM_YEARS_PER_VARIABILITY_MONTH = 5;

/** Two qualifying calendar months are needed for a most-vs-least comparison. */
export const MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY = 2;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_VARIABILITY_VALID_FRACTION = 0.6;

/** Honest scope limits shared by the interannual-variability descriptor. */
export const AIR_TEMPERATURE_SEASONAL_VARIABILITY_LIMITATIONS = [
  "Per-month spreads are sample (n-1) standard deviations over the supplied years; they are a short-record interannual spread, not a 30-year climate-normal variance.",
  "The spread is between-year for one calendar month; it is not an intramonthly range, a spatial spread over the footprint, or a measurement uncertainty.",
  "Calendar months may rest on different numbers of years, so their spreads need not share sampling depth.",
  "A kelvin standard deviation is the same figure in °C, so a spread of temperatures needs no unit conversion.",
  "Values are approximate regional statistics at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, a trend in variability, an external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureSeasonalVariabilityStatus =
  | "available"
  | "no-usable-observations"
  | "insufficient-qualified-months"
  | "invalid";

export interface AirTemperatureSeasonalVariabilityOptions {
  /** Minimum distinct years required for a calendar month to qualify. */
  minimumYearsPerMonth?: number;
  /** Minimum usable spatial fraction for a contributing observation. */
  minimumValidFraction?: number;
}

export interface AirTemperatureVariabilityMonth {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Mean of the per-year values for this calendar month, in kelvin. */
  meanKelvin: number;
  /** Distinct years contributing to the statistics. */
  yearCount: number;
  /**
   * Sample (n-1) standard deviation of the per-year values, in kelvin; null
   * when fewer than two distinct years contribute. This is an interannual
   * spread, not an intramonthly range or a measurement uncertainty.
   */
  sampleStandardDeviationKelvin: number | null;
  /** Whether the month met the minimum-years threshold to be comparable. */
  qualified: boolean;
}

export interface AirTemperatureVariabilityExtreme {
  calendarMonth: number;
  /** Sample interannual standard deviation for the month, in kelvin. */
  sampleStandardDeviationKelvin: number;
  /** Distinct years behind the spread. */
  yearCount: number;
}

export interface AirTemperatureSeasonalVariabilityExclusions {
  /** Observation is not the 2 m air-temperature metric. */
  wrongMetric: number;
  /** Data month is not a valid calendar month. */
  notCalendarMonth: number;
  /** Data month is not yet published against `availableThrough`. */
  notYetPublished: number;
  /** Published month carried no usable value (no-data coverage). */
  missing: number;
  /** Coverage or value was invalid. */
  invalid: number;
  /** A (calendar month, year) pair already seen; only the first is kept. */
  duplicateYearMonth: number;
  /** Coverage was below the required valid fraction. */
  insufficientCoverage: number;
}

export interface AirTemperatureSeasonalVariability {
  kind: "air-temperature-seasonal-variability";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureSeasonalVariabilityStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of every value reported here. */
  nativeUnit: string;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  requiredQualifiedMonths: number;
  /** Count of observations supplied, usable or not. */
  observationsSupplied: number;
  /** Count of observations that contributed to a monthly statistic. */
  observationsUsed: number;
  /** Every calendar month with at least one contributing year, ordered 1-12. */
  months: AirTemperatureVariabilityMonth[];
  /** Distinct calendar months that met the minimum-years threshold. */
  qualifiedMonthCount: number;
  /** Most interannually variable qualifying month; null when unavailable. */
  mostVariableMonth: AirTemperatureVariabilityExtreme | null;
  /** Least interannually variable qualifying month; null when unavailable. */
  leastVariableMonth: AirTemperatureVariabilityExtreme | null;
  /**
   * Most-minus-least qualifying monthly standard deviation (>= 0), in kelvin.
   * How much the interannual spread itself varies across the seasons; not a
   * variance, a trend, or a forecast.
   */
  variabilitySpreadKelvin: number | null;
  /**
   * Unweighted mean of the qualifying months' sample standard deviations, in
   * kelvin — a single typical interannual spread across the year. Null when no
   * month qualifies.
   */
  meanSampleStandardDeviationKelvin: number | null;
  exclusions: AirTemperatureSeasonalVariabilityExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no comparison is reported. */
  reason: string | null;
}

/**
 * Build a calendar-month climatology from supplied monthly observations and
 * reduce it to the interannual sample standard deviation of each calendar
 * month, then to the most and least variable months and their difference.
 * Observations for any other metric are counted as exclusions rather than mixed
 * in, so a precipitation or soil-moisture value can never leak into a
 * temperature spread. A calendar month must gather at least
 * `minimumYearsPerMonth` distinct usable years to qualify, and at least two
 * calendar months must qualify before a most-vs-least comparison is reported,
 * so a sparse record yields an honest `insufficient-qualified-months` rather
 * than a one-month "march". Duplicate (calendar month, year) inputs keep only
 * the first so a re-supplied month cannot inflate a spread.
 */
export function describeAirTemperatureSeasonalVariability(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureSeasonalVariabilityOptions = {}
): AirTemperatureSeasonalVariability {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_YEARS_PER_VARIABILITY_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_VARIABILITY_VALID_FRACTION;
  const exclusions = emptyExclusions();

  const base = {
    kind: "air-temperature-seasonal-variability" as const,
    isForecast: false as const,
    metric: AIR_TEMPERATURE_METRIC,
    source: AIR_TEMPERATURE_METRIC.source,
    nativeUnit: AIR_TEMPERATURE_METRIC.nativeUnit,
    requiredYearsPerMonth,
    requiredValidFraction,
    requiredQualifiedMonths: MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY,
    observationsSupplied: observations.length,
    limitations: AIR_TEMPERATURE_SEASONAL_VARIABILITY_LIMITATIONS,
  };

  if (
    !Number.isInteger(requiredYearsPerMonth) ||
    // Two distinct years is the arithmetic floor for a sample standard
    // deviation; anything the caller lowers to must still respect it.
    requiredYearsPerMonth < 2 ||
    !Number.isFinite(requiredValidFraction) ||
    requiredValidFraction < 0 ||
    requiredValidFraction > 1
  ) {
    return {
      ...base,
      status: "invalid",
      observationsUsed: 0,
      months: [],
      qualifiedMonthCount: 0,
      mostVariableMonth: null,
      leastVariableMonth: null,
      variabilitySpreadKelvin: null,
      meanSampleStandardDeviationKelvin: null,
      exclusions,
      reason: "invalid-configuration",
    };
  }

  // calendarMonth -> (year -> value), deduplicating repeated year-months.
  const byMonth = new Map<number, Map<number, number>>();
  for (const observation of observations) {
    if (observation.metricId !== "air-temperature-2m") {
      exclusions.wrongMetric += 1;
      continue;
    }
    if (!isCalendarMonth(observation.dataMonth)) {
      exclusions.notCalendarMonth += 1;
      continue;
    }
    const summary = summarizeMonthlyClimate(observation, availableThrough);
    if (summary.publicationStatus !== "published") {
      exclusions.notYetPublished += 1;
      continue;
    }
    if (summary.coverage.status === "no-data") {
      exclusions.missing += 1;
      continue;
    }
    if (
      summary.coverage.status === "invalid" ||
      summary.observedValue === null ||
      !Number.isFinite(summary.observedValue)
    ) {
      exclusions.invalid += 1;
      continue;
    }
    if (
      summary.coverage.validFraction !== null &&
      summary.coverage.validFraction < requiredValidFraction
    ) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    const { year, month } = observation.dataMonth;
    let years = byMonth.get(month);
    if (years === undefined) {
      years = new Map<number, number>();
      byMonth.set(month, years);
    }
    if (years.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    years.set(year, summary.observedValue);
  }

  const { months, observationsUsed } = buildVariabilityMonths(
    byMonth,
    requiredYearsPerMonth
  );
  const qualified = months.filter((month) => month.qualified);

  if (months.length === 0) {
    return {
      ...base,
      status: "no-usable-observations",
      observationsUsed,
      months,
      qualifiedMonthCount: 0,
      mostVariableMonth: null,
      leastVariableMonth: null,
      variabilitySpreadKelvin: null,
      meanSampleStandardDeviationKelvin: null,
      exclusions,
      reason: "no-usable-air-temperature-observations",
    };
  }

  if (qualified.length < MINIMUM_QUALIFIED_MONTHS_FOR_VARIABILITY) {
    return {
      ...base,
      status: "insufficient-qualified-months",
      observationsUsed,
      months,
      qualifiedMonthCount: qualified.length,
      mostVariableMonth: null,
      leastVariableMonth: null,
      variabilitySpreadKelvin: null,
      meanSampleStandardDeviationKelvin: meanQualifiedSpread(qualified),
      exclusions,
      reason: "too-few-qualified-calendar-months",
    };
  }

  const most = pickExtreme(qualified, "most");
  const least = pickExtreme(qualified, "least");

  return {
    ...base,
    status: "available",
    observationsUsed,
    months,
    qualifiedMonthCount: qualified.length,
    mostVariableMonth: most,
    leastVariableMonth: least,
    variabilitySpreadKelvin:
      most.sampleStandardDeviationKelvin - least.sampleStandardDeviationKelvin,
    meanSampleStandardDeviationKelvin: meanQualifiedSpread(qualified),
    exclusions,
    reason: null,
  };
}

/**
 * A compact, honest readout of the interannual-variability march. Emphasizes
 * that per-month spreads are sample standard deviations over a short record,
 * not a climate-normal variance or an intramonthly range.
 */
export function formatAirTemperatureSeasonalVariability(
  variability: AirTemperatureSeasonalVariability
): string {
  const source = `${variability.source.shortName} v${variability.source.version}`;
  if (
    variability.status !== "available" ||
    variability.mostVariableMonth === null ||
    variability.leastVariableMonth === null ||
    variability.variabilitySpreadKelvin === null
  ) {
    return `No 2 m air-temperature interannual-variability march (${variability.reason ?? "unavailable"}; ${variability.qualifiedMonthCount} qualifying calendar month(s)); source ${source}`;
  }
  const most = variability.mostVariableMonth;
  const least = variability.leastVariableMonth;
  const mostName = MONTH_ABBREVIATIONS[most.calendarMonth - 1];
  const leastName = MONTH_ABBREVIATIONS[least.calendarMonth - 1];
  return `2 m air-temperature interannual spread ranges ${formatNumber(least.sampleStandardDeviationKelvin)}–${formatNumber(most.sampleStandardDeviationKelvin)} K (${leastName} least to ${mostName} most variable; Δ ${formatNumber(variability.variabilitySpreadKelvin)} K) across ${variability.qualifiedMonthCount} qualifying months; sample standard deviations over the supplied years, not a climate-normal variance; source ${source}`;
}

const MONTH_ABBREVIATIONS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

function buildVariabilityMonths(
  byMonth: ReadonlyMap<number, ReadonlyMap<number, number>>,
  requiredYearsPerMonth: number
): { months: AirTemperatureVariabilityMonth[]; observationsUsed: number } {
  const months: AirTemperatureVariabilityMonth[] = [];
  let observationsUsed = 0;
  for (const [calendarMonth, years] of byMonth) {
    const values = [...years.values()];
    observationsUsed += values.length;
    const mean = neumaierSum(values) / values.length;
    months.push({
      calendarMonth,
      meanKelvin: mean,
      yearCount: values.length,
      sampleStandardDeviationKelvin: sampleStandardDeviation(values, mean),
      qualified: values.length >= requiredYearsPerMonth,
    });
  }
  months.sort((a, b) => a.calendarMonth - b.calendarMonth);
  return { months, observationsUsed };
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
  qualified: readonly AirTemperatureVariabilityMonth[],
  which: "most" | "least"
): AirTemperatureVariabilityExtreme {
  let best = qualified[0];
  for (const month of qualified) {
    const monthSpread = month.sampleStandardDeviationKelvin as number;
    const bestSpread = best.sampleStandardDeviationKelvin as number;
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
    sampleStandardDeviationKelvin: best.sampleStandardDeviationKelvin as number,
    yearCount: best.yearCount,
  };
}

/**
 * Unweighted mean of the qualifying months' sample standard deviations, or null
 * when no month qualifies. A single typical interannual spread across the year.
 */
function meanQualifiedSpread(
  qualified: readonly AirTemperatureVariabilityMonth[]
): number | null {
  if (qualified.length === 0) return null;
  const spreads = qualified.map(
    (month) => month.sampleStandardDeviationKelvin as number
  );
  return neumaierSum(spreads) / spreads.length;
}

function emptyExclusions(): AirTemperatureSeasonalVariabilityExclusions {
  return {
    wrongMetric: 0,
    notCalendarMonth: 0,
    notYetPublished: 0,
    missing: 0,
    invalid: 0,
    duplicateYearMonth: 0,
    insufficientCoverage: 0,
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

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
