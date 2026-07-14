import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetric,
  type MonthlyClimateObservation,
} from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Mean annual cycle and seasonal-cycle amplitude of 2 m air temperature.
 *
 * `climateSeriesExtremes` answers "which single month in this span was warmest
 * and which coldest". That is a within-sample reduction: one anomalously hot
 * July can be the warmest month, and a data gap can hide the true coldest. This
 * module answers a different, climatological question about a probed point:
 * averaging each calendar month across the years we actually have, what does the
 * mean annual temperature cycle look like, and how wide is it from its warmest
 * to its coldest calendar month?
 *
 * The peak-to-trough spread of that mean cycle is the *mean annual temperature
 * range* — the building block of continentality: interiors swing widely between
 * summer and winter, maritime and tropical sites far less. This helper derives
 * it and nothing more.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal. A short record shifts with the years it happens
 *    to contain.
 *  - The amplitude is the difference between two climatological monthly *means*
 *    (warmest-month mean minus coldest-month mean), NOT an extreme temperature
 *    range and NOT a record. A kelvin difference is numerically the same figure
 *    in °C, so the amplitude needs no unit conversion.
 *  - An amplitude is only reported when all twelve calendar months are covered.
 *    A partial cycle exposes the monthly means it does have but no amplitude, so
 *    a missing warmest or coldest month is never guessed at.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, anomaly against an external baseline, attribution, or
 *    diagnosis.
 */

/** The metric this descriptor is defined for; continentality is temperature-only. */
const AIR_TEMPERATURE_METRIC: ClimateMetric =
  CLIMATE_METRICS["air-temperature-2m"];

/** A conservative floor of distinct years per calendar month before it counts. */
export const MINIMUM_ANNUAL_CYCLE_YEARS_PER_MONTH = 3;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_ANNUAL_CYCLE_VALID_FRACTION = 0.6;

/** Every calendar month must be covered before a full-cycle amplitude is emitted. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the annual-cycle descriptor. */
export const AIR_TEMPERATURE_ANNUAL_CYCLE_LIMITATIONS = [
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal.",
  "The amplitude is the difference between two climatological monthly means (warmest-month mean minus coldest-month mean), not an extreme temperature range or a record; a kelvin difference is the same figure in °C.",
  "An amplitude is reported only when all twelve calendar months are covered; a partial cycle exposes its monthly means but no amplitude, so a missing warmest or coldest month is never guessed.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureAnnualCycleStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface AirTemperatureAnnualCycleOptions {
  /** Distinct years required per calendar month before it enters the cycle. */
  minimumYearsPerMonth?: number;
  /** Minimum valid spatial fraction for an observation to be usable. */
  minimumValidFraction?: number;
}

/** Climatological summary of one calendar month across the supplied years. */
export interface MonthlyClimatology {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Distinct years that contributed to this month's mean. */
  yearsUsed: number;
  /** Mean 2 m air temperature for this calendar month, in kelvin. */
  meanKelvin: number;
  /** Lowest contributing yearly value for this calendar month, in kelvin. */
  minKelvin: number;
  /** Highest contributing yearly value for this calendar month, in kelvin. */
  maxKelvin: number;
}

/** One extreme of the mean annual cycle: a calendar month and its mean. */
export interface AnnualCycleExtreme {
  calendarMonth: number;
  meanKelvin: number;
}

export interface AirTemperatureAnnualCycleExclusions {
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
  /** A (year, calendar-month) pair already seen; the first is kept. */
  duplicateYearMonth: number;
  /** Coverage was below the required valid fraction. */
  insufficientCoverage: number;
}

export interface AirTemperatureAnnualCycle {
  kind: "air-temperature-mean-annual-cycle";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureAnnualCycleStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of every value reported here. */
  nativeUnit: string;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  /** Count of observations supplied, usable or not. */
  observationsSupplied: number;
  /** Count of observations that contributed to a monthly mean. */
  observationsUsed: number;
  /** How many of the twelve calendar months met the years-per-month floor. */
  calendarMonthsCovered: number;
  /** Per-calendar-month climatology, sorted January→December; covered months only. */
  monthlyClimatology: MonthlyClimatology[];
  /** Warmest calendar month of the mean cycle, or null without a full cycle. */
  warmestMonth: AnnualCycleExtreme | null;
  /** Coldest calendar month of the mean cycle, or null without a full cycle. */
  coldestMonth: AnnualCycleExtreme | null;
  /**
   * Warmest-month mean minus coldest-month mean, in kelvin (equivalently °C for
   * a difference). Null unless all twelve calendar months are covered, so a
   * partial cycle never yields a range that omits an unseen month.
   */
  amplitudeKelvin: number | null;
  exclusions: AirTemperatureAnnualCycleExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no amplitude is reported. */
  reason: string | null;
}

/**
 * Derive the mean annual 2 m air-temperature cycle and its peak-to-trough
 * amplitude from a supplied set of monthly observations. Observations for any
 * other metric are counted as exclusions rather than mixed in, so a
 * precipitation or soil-moisture value can never leak into a temperature range.
 * Each calendar month is averaged over its distinct usable years; a month needs
 * `minimumYearsPerMonth` of them to count, and an amplitude is emitted only when
 * every calendar month qualifies.
 */
export function describeAirTemperatureAnnualCycle(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureAnnualCycleOptions = {}
): AirTemperatureAnnualCycle {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_ANNUAL_CYCLE_YEARS_PER_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_ANNUAL_CYCLE_VALID_FRACTION;
  const exclusions = emptyExclusions();

  const base = {
    kind: "air-temperature-mean-annual-cycle" as const,
    isForecast: false as const,
    metric: AIR_TEMPERATURE_METRIC,
    source: AIR_TEMPERATURE_METRIC.source,
    nativeUnit: AIR_TEMPERATURE_METRIC.nativeUnit,
    requiredYearsPerMonth,
    requiredValidFraction,
    observationsSupplied: observations.length,
    limitations: AIR_TEMPERATURE_ANNUAL_CYCLE_LIMITATIONS,
  };

  if (
    !Number.isInteger(requiredYearsPerMonth) ||
    requiredYearsPerMonth <= 0 ||
    !Number.isFinite(requiredValidFraction) ||
    requiredValidFraction < 0 ||
    requiredValidFraction > 1
  ) {
    return {
      ...base,
      status: "invalid",
      observationsUsed: 0,
      calendarMonthsCovered: 0,
      monthlyClimatology: [],
      warmestMonth: null,
      coldestMonth: null,
      amplitudeKelvin: null,
      exclusions,
      reason: "invalid-configuration",
    };
  }

  // Bucket usable values by calendar month, keeping one value per distinct year.
  const buckets = new Map<number, Map<number, number>>();
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
    const yearValues = buckets.get(month) ?? new Map<number, number>();
    if (yearValues.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    yearValues.set(year, summary.observedValue);
    buckets.set(month, yearValues);
  }

  const monthlyClimatology: MonthlyClimatology[] = [];
  let observationsUsed = 0;
  for (let calendarMonth = 1; calendarMonth <= CALENDAR_MONTHS_IN_YEAR;) {
    const yearValues = buckets.get(calendarMonth);
    if (yearValues && yearValues.size >= requiredYearsPerMonth) {
      const values = [...yearValues.values()];
      observationsUsed += values.length;
      monthlyClimatology.push({
        calendarMonth,
        yearsUsed: values.length,
        meanKelvin:
          values.reduce((sum, value) => sum + value, 0) / values.length,
        minKelvin: Math.min(...values),
        maxKelvin: Math.max(...values),
      });
    }
    calendarMonth += 1;
  }

  const calendarMonthsCovered = monthlyClimatology.length;
  if (calendarMonthsCovered === 0) {
    return {
      ...base,
      status: "no-usable-observations",
      observationsUsed,
      calendarMonthsCovered,
      monthlyClimatology,
      warmestMonth: null,
      coldestMonth: null,
      amplitudeKelvin: null,
      exclusions,
      reason: "no-calendar-month-met-year-floor",
    };
  }

  if (calendarMonthsCovered < CALENDAR_MONTHS_IN_YEAR) {
    return {
      ...base,
      status: "insufficient-monthly-coverage",
      observationsUsed,
      calendarMonthsCovered,
      monthlyClimatology,
      warmestMonth: null,
      coldestMonth: null,
      amplitudeKelvin: null,
      exclusions,
      reason: "not-all-calendar-months-covered",
    };
  }

  // Full cycle: the warmest and coldest calendar months of the mean annual
  // cycle. Ties resolve to the earlier calendar month so selection is
  // deterministic regardless of input order.
  let warmest = monthlyClimatology[0];
  let coldest = monthlyClimatology[0];
  for (const entry of monthlyClimatology) {
    if (entry.meanKelvin > warmest.meanKelvin) warmest = entry;
    if (entry.meanKelvin < coldest.meanKelvin) coldest = entry;
  }

  return {
    ...base,
    status: "available",
    observationsUsed,
    calendarMonthsCovered,
    monthlyClimatology,
    warmestMonth: {
      calendarMonth: warmest.calendarMonth,
      meanKelvin: warmest.meanKelvin,
    },
    coldestMonth: {
      calendarMonth: coldest.calendarMonth,
      meanKelvin: coldest.meanKelvin,
    },
    amplitudeKelvin: warmest.meanKelvin - coldest.meanKelvin,
    exclusions,
    reason: null,
  };
}

/**
 * A compact, honest readout of the mean annual cycle. Emphasizes that the
 * amplitude is a difference of climatological means over a short record, not an
 * extreme range or a climate normal.
 */
export function formatAirTemperatureAnnualCycle(
  cycle: AirTemperatureAnnualCycle
): string {
  const source = `${cycle.source.shortName} v${cycle.source.version}`;
  if (
    cycle.status !== "available" ||
    cycle.amplitudeKelvin === null ||
    cycle.warmestMonth === null ||
    cycle.coldestMonth === null
  ) {
    return `No mean annual 2 m air-temperature cycle (${cycle.reason ?? "unavailable"}; ${cycle.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const amplitude = formatNumber(cycle.amplitudeKelvin);
  const warm = MONTH_ABBREVIATIONS[cycle.warmestMonth.calendarMonth - 1];
  const cold = MONTH_ABBREVIATIONS[cycle.coldestMonth.calendarMonth - 1];
  return `Mean annual 2 m air-temperature range ${amplitude} K (${warm} warmest ${formatNumber(cycle.warmestMonth.meanKelvin)} K − ${cold} coldest ${formatNumber(cycle.coldestMonth.meanKelvin)} K); mean annual cycle over ${cycle.observationsUsed} usable observations, not a climate normal or extreme range; source ${source}`;
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

function emptyExclusions(): AirTemperatureAnnualCycleExclusions {
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
