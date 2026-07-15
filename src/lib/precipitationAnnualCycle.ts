import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetric,
  type MonthlyClimateObservation,
} from "./climate";
import { precipitationAccumulation } from "./precipitationAccumulation";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Mean annual cycle and seasonal amplitude of monthly precipitation.
 *
 * `precipitationSeasonalTiming` answers "in one twelve-month run, which part of
 * the calendar did the water balance around", and `precipitationConcentrationIndex`
 * answers "how concentrated was that one year's water" — both are single-cycle
 * reductions that a data gap or one anomalous year distorts. This module answers
 * a different, climatological question about a probed point: averaging each
 * calendar month across the years we actually have, what does the mean annual
 * precipitation cycle look like, and how far does it swing from its wettest to
 * its driest calendar month?
 *
 * The peak-to-trough spread of that mean cycle is a plain *seasonality strength*
 * for monthly water supply: a monsoonal or wet-and-dry-season site swings widely
 * between its wettest and driest climatological month, an evenly-watered site far
 * less. This helper derives that mean cycle and its amplitude and nothing more —
 * it mirrors the audited annual-cycle machinery in airTemperatureSeasonalCycle.ts
 * (deduplicate years, drop unpublished or low-coverage months, require a per-month
 * year floor, and emit an amplitude only for a full twelve-month cycle). Each
 * usable monthly-mean rate is integrated to an accumulation total with the same
 * audited factor as precipitationAccumulation.ts before it enters the cycle, so
 * the climatology is stated in the hydrologically legible mm/month, not a rate.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - Each monthly value is the GLDAS monthly-mean precipitation rate integrated
 *    over the calendar month (rate × seconds in month; 1 kg/m² = 1 mm), a land-
 *    model accumulation, NOT a rain-gauge total, and it inherits that product's
 *    resolution and biases.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climatological normal. A short record shifts with the years it
 *    happens to contain and a single wet year can dominate a thin month.
 *  - The amplitude is the difference between two climatological monthly *means*
 *    (wettest-month mean minus driest-month mean), a depth in mm, NOT an extreme
 *    range and NOT a record.
 *  - An amplitude is reported only when all twelve calendar months are covered.
 *    A partial cycle exposes the monthly means it has but no amplitude, so a
 *    missing wettest or driest month is never guessed.
 *  - Nothing here is a forecast, trend, external-baseline anomaly, drought or
 *    monsoon index, wet-season onset date, attribution, or diagnosis.
 *
 * Pure, render-free logic (see precipitationAnnualCycle.test.ts).
 */

/** The metric this descriptor is defined for; a precipitation cycle is rate-only. */
const PRECIPITATION_METRIC: ClimateMetric =
  CLIMATE_METRICS["precipitation-rate"];

/** Reported unit of the climatological monthly totals: mm water-equivalent depth. */
export const PRECIPITATION_ANNUAL_CYCLE_UNIT = "mm";

/** A conservative floor of distinct years per calendar month before it counts. */
export const MINIMUM_PRECIP_ANNUAL_CYCLE_YEARS_PER_MONTH = 3;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_PRECIP_ANNUAL_CYCLE_VALID_FRACTION = 0.6;

/** Every calendar month must be covered before a full-cycle amplitude is emitted. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the precipitation annual-cycle descriptor. */
export const PRECIPITATION_ANNUAL_CYCLE_LIMITATIONS = [
  "Each monthly value is the GLDAS monthly-mean precipitation rate integrated over the calendar month (rate × seconds in month; 1 kg/m² = 1 mm), a land-model accumulation, not a rain-gauge total, and inherits that product's resolution and biases.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains and one wet year can dominate a thin month.",
  "The amplitude is the difference between two climatological monthly means (wettest-month mean minus driest-month mean), a depth in mm, not an extreme range or a record.",
  "An amplitude is reported only when all twelve calendar months are covered; a partial cycle exposes its monthly means but no amplitude, so a missing wettest or driest month is never guessed.",
  "Nothing here is a forecast, trend, external-baseline anomaly, drought or monsoon index, wet-season onset date, attribution, or diagnosis.",
] as const;

export type PrecipitationAnnualCycleStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface PrecipitationAnnualCycleOptions {
  /** Distinct years required per calendar month before it enters the cycle. */
  minimumYearsPerMonth?: number;
  /** Minimum valid spatial fraction for an observation to be usable. */
  minimumValidFraction?: number;
}

/** Climatological summary of one calendar month across the supplied years. */
export interface MonthlyPrecipitationClimatology {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Distinct years that contributed to this month's mean. */
  yearsUsed: number;
  /** Mean accumulated depth for this calendar month, in mm water-equivalent. */
  meanMm: number;
  /** Lowest contributing yearly accumulation for this calendar month, in mm. */
  minMm: number;
  /** Highest contributing yearly accumulation for this calendar month, in mm. */
  maxMm: number;
}

/** One extreme of the mean annual cycle: a calendar month and its mean total. */
export interface PrecipitationAnnualCycleExtreme {
  calendarMonth: number;
  meanMm: number;
}

export interface PrecipitationAnnualCycleExclusions {
  /** Observation is not the precipitation-rate metric. */
  wrongMetric: number;
  /** Data month is not a valid calendar month. */
  notCalendarMonth: number;
  /** Data month is not yet published against `availableThrough`. */
  notYetPublished: number;
  /** Published month carried no usable value (no-data coverage). */
  missing: number;
  /** Coverage, value, or the integrated accumulation was invalid. */
  invalid: number;
  /** A (year, calendar-month) pair already seen; the first is kept. */
  duplicateYearMonth: number;
  /** Coverage was below the required valid fraction. */
  insufficientCoverage: number;
}

export interface PrecipitationAnnualCycle {
  kind: "precipitation-mean-annual-cycle";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: PrecipitationAnnualCycleStatus;
  /** Cited GLDAS precipitation product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the source rate observation, before integration. */
  sourceNativeUnit: string;
  /** Unit of every accumulation value reported here (mm water-equivalent). */
  unit: string;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  /** Count of observations supplied, usable or not. */
  observationsSupplied: number;
  /** Count of observations that contributed to a monthly mean. */
  observationsUsed: number;
  /** How many of the twelve calendar months met the years-per-month floor. */
  calendarMonthsCovered: number;
  /** Per-calendar-month climatology, sorted January→December; covered months only. */
  monthlyClimatology: MonthlyPrecipitationClimatology[];
  /** Wettest (highest-mean) calendar month, or null without a full cycle. */
  wettestMonth: PrecipitationAnnualCycleExtreme | null;
  /** Driest (lowest-mean) calendar month, or null without a full cycle. */
  driestMonth: PrecipitationAnnualCycleExtreme | null;
  /**
   * Wettest-month mean minus driest-month mean, in mm. Null unless all twelve
   * calendar months are covered, so a partial cycle never yields an amplitude
   * that omits an unseen month.
   */
  amplitudeMm: number | null;
  exclusions: PrecipitationAnnualCycleExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no amplitude is reported. */
  reason: string | null;
}

/**
 * Derive the mean annual precipitation cycle and its wettest-to-driest amplitude
 * from a supplied set of monthly observations. Observations for any other metric
 * are counted as exclusions rather than mixed in, so a temperature or soil-
 * moisture value can never leak into a precipitation cycle. Each usable monthly-
 * mean rate is integrated to an accumulation total (mm) with the audited
 * precipitationAccumulation factor; each calendar month is then averaged over its
 * distinct usable years. A month needs `minimumYearsPerMonth` of them to count,
 * and an amplitude is emitted only when every calendar month qualifies. Grouping
 * observations to one place is the caller's responsibility; this helper never
 * borrows adjacent months or fills missing years.
 */
export function describePrecipitationAnnualCycle(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: PrecipitationAnnualCycleOptions = {}
): PrecipitationAnnualCycle {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_PRECIP_ANNUAL_CYCLE_YEARS_PER_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_PRECIP_ANNUAL_CYCLE_VALID_FRACTION;
  const exclusions = emptyExclusions();

  const base = {
    kind: "precipitation-mean-annual-cycle" as const,
    isForecast: false as const,
    metric: PRECIPITATION_METRIC,
    source: PRECIPITATION_METRIC.source,
    sourceNativeUnit: PRECIPITATION_METRIC.nativeUnit,
    unit: PRECIPITATION_ANNUAL_CYCLE_UNIT,
    requiredYearsPerMonth,
    requiredValidFraction,
    observationsSupplied: observations.length,
    limitations: PRECIPITATION_ANNUAL_CYCLE_LIMITATIONS,
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
      wettestMonth: null,
      driestMonth: null,
      amplitudeMm: null,
      exclusions,
      reason: "invalid-configuration",
    };
  }

  // Bucket usable accumulation totals by calendar month, keeping one value per
  // distinct year.
  const buckets = new Map<number, Map<number, number>>();
  for (const observation of observations) {
    if (observation.metricId !== "precipitation-rate") {
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
      // A negative (nonphysical) precipitation rate is already marked invalid
      // coverage upstream, so it lands here too.
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

    // Integrate the usable monthly-mean rate to an accumulation total with the
    // audited factor. This re-validates the summary and guards a negative rate,
    // so a null here means the value could not be integrated to a real depth.
    const accumulation = precipitationAccumulation(summary);
    if (accumulation === null || !Number.isFinite(accumulation.totalMm)) {
      exclusions.invalid += 1;
      continue;
    }

    const { year, month } = observation.dataMonth;
    const yearValues = buckets.get(month) ?? new Map<number, number>();
    if (yearValues.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    yearValues.set(year, accumulation.totalMm);
    buckets.set(month, yearValues);
  }

  const monthlyClimatology: MonthlyPrecipitationClimatology[] = [];
  let observationsUsed = 0;
  for (let calendarMonth = 1; calendarMonth <= CALENDAR_MONTHS_IN_YEAR;) {
    const yearValues = buckets.get(calendarMonth);
    if (yearValues && yearValues.size >= requiredYearsPerMonth) {
      const values = [...yearValues.values()];
      observationsUsed += values.length;
      monthlyClimatology.push({
        calendarMonth,
        yearsUsed: values.length,
        meanMm: values.reduce((sum, value) => sum + value, 0) / values.length,
        minMm: Math.min(...values),
        maxMm: Math.max(...values),
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
      wettestMonth: null,
      driestMonth: null,
      amplitudeMm: null,
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
      wettestMonth: null,
      driestMonth: null,
      amplitudeMm: null,
      exclusions,
      reason: "not-all-calendar-months-covered",
    };
  }

  // Full cycle: the wettest and driest calendar months of the mean annual cycle.
  // Ties resolve to the earlier calendar month so selection is deterministic
  // regardless of input order.
  let wettest = monthlyClimatology[0];
  let driest = monthlyClimatology[0];
  for (const entry of monthlyClimatology) {
    if (entry.meanMm > wettest.meanMm) wettest = entry;
    if (entry.meanMm < driest.meanMm) driest = entry;
  }

  return {
    ...base,
    status: "available",
    observationsUsed,
    calendarMonthsCovered,
    monthlyClimatology,
    wettestMonth: {
      calendarMonth: wettest.calendarMonth,
      meanMm: wettest.meanMm,
    },
    driestMonth: {
      calendarMonth: driest.calendarMonth,
      meanMm: driest.meanMm,
    },
    amplitudeMm: wettest.meanMm - driest.meanMm,
    exclusions,
    reason: null,
  };
}

/**
 * A compact, honest readout of the mean annual precipitation cycle. Emphasizes
 * that the amplitude is a difference of climatological means over a short record,
 * not an extreme range or a climate normal.
 */
export function formatPrecipitationAnnualCycle(
  cycle: PrecipitationAnnualCycle
): string {
  const source = `${cycle.source.shortName} v${cycle.source.version}`;
  if (
    cycle.status !== "available" ||
    cycle.amplitudeMm === null ||
    cycle.wettestMonth === null ||
    cycle.driestMonth === null
  ) {
    return `No mean annual precipitation cycle (${cycle.reason ?? "unavailable"}; ${cycle.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const amplitude = formatNumber(cycle.amplitudeMm);
  const wet = MONTH_ABBREVIATIONS[cycle.wettestMonth.calendarMonth - 1];
  const dry = MONTH_ABBREVIATIONS[cycle.driestMonth.calendarMonth - 1];
  return `Mean annual precipitation range ${amplitude} mm (${wet} wettest ${formatNumber(cycle.wettestMonth.meanMm)} mm − ${dry} driest ${formatNumber(cycle.driestMonth.meanMm)} mm); mean annual cycle over ${cycle.observationsUsed} usable observations, not a climate normal or extreme range; source ${source}`;
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

function emptyExclusions(): PrecipitationAnnualCycleExclusions {
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
