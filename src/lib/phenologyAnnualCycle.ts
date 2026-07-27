import {
  NDVI_SOURCE,
  NDVI_UNIT,
  hemisphereForLatitude,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
  type NdviMonthlyObservation,
} from "./phenology";
import { neumaierSum } from "./numerics";
import type { DatasetRef } from "./timeline";

/**
 * Mean annual NDVI cycle (climatology) and its seasonal-cycle amplitude.
 *
 * {@link summarizeAnnualNdviPhenology} answers "which single month in this year
 * was greenest and which least green". That is a per-year, within-sample
 * reduction: one anomalous month can be a year's peak, and a data gap can hide
 * its true trough. The timing descriptors (`summarizePeakGreennessTiming`,
 * `summarizeTroughTiming`) then ask, across years, *in which calendar month*
 * each year's single extremum tended to fall.
 *
 * This module answers a different, climatological question about a probed
 * point: averaging each calendar month across the years we actually have, what
 * does the mean annual greenness cycle look like, and how wide is it from its
 * greenest to its least-green calendar month? A location whose yearly peaks are
 * scattered across the calendar (low timing concordance) can still have a
 * perfectly well-defined mean cycle; the two views are complementary, not
 * substitutes. The peak-to-trough spread of that mean cycle is the vegetation
 * analogue of the seasonal-cycle amplitude that the air-temperature and
 * sea-surface-temperature cycle descriptors already report.
 *
 * Method. Each usable observation contributes one value to its calendar-month
 * bucket, keeping a single value per distinct year (a repeat year is an
 * exclusion, never averaged in twice). A calendar month enters the cycle only
 * once it has at least `minimumYearsPerMonth` distinct usable years; its
 * climatological value is the compensated mean of those yearly values. The
 * amplitude is emitted only when all twelve calendar months qualify, so a
 * missing greenest or least-green month is never guessed at.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a multi-decade climate normal. A short record shifts with the years it
 *    happens to contain.
 *  - The amplitude is the difference between two climatological monthly *means*
 *    (greenest-month mean minus least-green-month mean) in unitless NDVI, NOT an
 *    extreme index range, a within-year seasonal range, or a record.
 *  - An amplitude is reported only when all twelve calendar months are covered.
 *    A partial cycle exposes the monthly means it does have but no amplitude.
 *  - NDVI is a unitless vegetation-index observation. Nothing here is a
 *    growing-season length or onset date, a phenophase, a productivity, biomass,
 *    canopy, land-cover, or ecosystem-condition claim, an anomaly against an
 *    external baseline, a trend, a cause, or a forecast. A wider amplitude is
 *    not "healthier" vegetation — an evergreen humid-tropical canopy is
 *    legitimately near-flat in NDVI.
 */

/** A conservative floor of distinct years per calendar month before it counts. */
export const MINIMUM_ANNUAL_CYCLE_YEARS_PER_MONTH = 3;

/** Require at least 60% usable sampled area when a valid fraction is supplied. */
export const MINIMUM_ANNUAL_CYCLE_VALID_FRACTION = 0.6;

/** Every calendar month must be covered before a full-cycle amplitude is emitted. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the mean-annual-cycle descriptor. */
export const NDVI_ANNUAL_CYCLE_LIMITATIONS = [
  "The monthly means are a mean annual NDVI cycle over the supplied years only, not a multi-decade climate normal.",
  "The amplitude is the difference between two climatological monthly means (greenest-month mean minus least-green-month mean) in unitless NDVI, not an extreme index range, a within-year seasonal range, or a record.",
  "An amplitude is reported only when all twelve calendar months are covered; a partial cycle exposes its monthly means but no amplitude, so a missing greenest or least-green month is never guessed.",
  "NDVI is a unitless vegetation index; nothing here is a growing-season length or onset date, phenophase, productivity, biomass, land-cover, or ecosystem-condition claim, an external-baseline anomaly, a trend, a cause, or a forecast.",
] as const;

export type NdviAnnualCycleStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface NdviAnnualCycleOptions {
  /** Distinct years required per calendar month before it enters the cycle. */
  minimumYearsPerMonth?: number;
  /** Minimum valid spatial fraction for an observation to be usable. */
  minimumValidFraction?: number;
}

/** Climatological summary of one calendar month across the supplied years. */
export interface NdviMonthlyClimatology {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Calendar-season label for the hemisphere, never a growth-phase claim. */
  meteorologicalSeason: MeteorologicalSeason;
  /** Distinct years that contributed to this month's mean. */
  yearsUsed: number;
  /** Compensated mean NDVI for this calendar month, unitless. */
  meanNdvi: number;
  /** Lowest contributing yearly value for this calendar month, unitless. */
  minNdvi: number;
  /** Highest contributing yearly value for this calendar month, unitless. */
  maxNdvi: number;
}

/** One extreme of the mean annual cycle: a calendar month and its mean NDVI. */
export interface NdviAnnualCycleExtreme {
  calendarMonth: number;
  meteorologicalSeason: MeteorologicalSeason;
  meanNdvi: number;
}

export interface NdviAnnualCycleExclusions {
  /** Data month is not a valid calendar month. */
  notCalendarMonth: number;
  /** Month carried no usable value (null NDVI or zero coverage). */
  missing: number;
  /** NDVI value or supplied valid fraction was out of range or non-finite. */
  invalid: number;
  /** A (year, calendar-month) pair already seen; the first is kept. */
  duplicateYearMonth: number;
  /** A supplied valid fraction was below the required floor. */
  insufficientCoverage: number;
}

export interface NdviAnnualCycle {
  kind: "ndvi-mean-annual-cycle";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: NdviAnnualCycleStatus;
  hemisphere: Hemisphere;
  /** Cited NASA MOD13A3 v061 NDVI product; provenance is preserved. */
  source: DatasetRef;
  /** Native unit of every value reported here. */
  unit: typeof NDVI_UNIT;
  requiredYearsPerMonth: number;
  requiredValidFraction: number;
  /** Count of observations supplied, usable or not. */
  observationsSupplied: number;
  /** Count of observations that contributed to a monthly mean. */
  observationsUsed: number;
  /** How many of the twelve calendar months met the years-per-month floor. */
  calendarMonthsCovered: number;
  /** Per-calendar-month climatology, sorted January→December; covered months only. */
  monthlyClimatology: NdviMonthlyClimatology[];
  /** Greenest calendar month of the mean cycle, or null without a full cycle. */
  greenestMonth: NdviAnnualCycleExtreme | null;
  /** Least-green calendar month of the mean cycle, or null without a full cycle. */
  leastGreenMonth: NdviAnnualCycleExtreme | null;
  /**
   * Greenest-month mean minus least-green-month mean, in unitless NDVI. Null
   * unless all twelve calendar months are covered, so a partial cycle never
   * yields a range that omits an unseen month. Always >= 0 when present.
   */
  amplitude: number | null;
  exclusions: NdviAnnualCycleExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no amplitude is reported. */
  reason: string | null;
}

/**
 * Derive the mean annual NDVI cycle and its peak-to-trough amplitude from a
 * supplied set of monthly observations. Each calendar month is averaged over its
 * distinct usable years; a month needs `minimumYearsPerMonth` of them to count,
 * and an amplitude is emitted only when every calendar month qualifies. Grouping
 * and per-observation validation mirror {@link summarizeAnnualNdviPhenology}
 * (same calendar-month, missing, range, and duplicate rules), so a duplicate can
 * never silently shift a climatological mean.
 */
export function describeNdviAnnualCycle(
  observations: readonly NdviMonthlyObservation[],
  latitude: number,
  options: NdviAnnualCycleOptions = {}
): NdviAnnualCycle {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ?? MINIMUM_ANNUAL_CYCLE_YEARS_PER_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_ANNUAL_CYCLE_VALID_FRACTION;
  const hemisphere = hemisphereForLatitude(latitude);
  const exclusions = emptyExclusions();

  const base = {
    kind: "ndvi-mean-annual-cycle" as const,
    isForecast: false as const,
    hemisphere,
    source: NDVI_SOURCE,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
    requiredYearsPerMonth,
    requiredValidFraction,
    observationsSupplied: observations.length,
    limitations: NDVI_ANNUAL_CYCLE_LIMITATIONS,
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
      greenestMonth: null,
      leastGreenMonth: null,
      amplitude: null,
      exclusions,
      reason: "invalid-configuration",
    };
  }

  // Bucket usable values by calendar month, keeping one value per distinct year.
  const buckets = new Map<number, Map<number, number>>();
  for (const observation of observations) {
    if (!isCalendarMonth(observation.month)) {
      exclusions.notCalendarMonth += 1;
      continue;
    }
    const fraction = observation.validFraction;
    if (
      fraction !== undefined &&
      (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    ) {
      exclusions.invalid += 1;
      continue;
    }
    if (observation.ndvi === null || fraction === 0) {
      exclusions.missing += 1;
      continue;
    }
    if (
      !Number.isFinite(observation.ndvi) ||
      observation.ndvi < -1 ||
      observation.ndvi > 1
    ) {
      exclusions.invalid += 1;
      continue;
    }
    if (fraction !== undefined && fraction < requiredValidFraction) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    const { year, month } = observation.month;
    const yearValues = buckets.get(month) ?? new Map<number, number>();
    if (yearValues.has(year)) {
      exclusions.duplicateYearMonth += 1;
      continue;
    }
    yearValues.set(year, observation.ndvi);
    buckets.set(month, yearValues);
  }

  const monthlyClimatology: NdviMonthlyClimatology[] = [];
  let observationsUsed = 0;
  for (
    let calendarMonth = 1;
    calendarMonth <= CALENDAR_MONTHS_IN_YEAR;
    calendarMonth += 1
  ) {
    const yearValues = buckets.get(calendarMonth);
    if (yearValues && yearValues.size >= requiredYearsPerMonth) {
      const values = [...yearValues.values()];
      observationsUsed += values.length;
      monthlyClimatology.push({
        calendarMonth,
        meteorologicalSeason: meteorologicalSeasonForMonth(
          calendarMonth,
          hemisphere
        ),
        yearsUsed: values.length,
        meanNdvi: neumaierSum(values) / values.length,
        minNdvi: Math.min(...values),
        maxNdvi: Math.max(...values),
      });
    }
  }

  const calendarMonthsCovered = monthlyClimatology.length;
  if (calendarMonthsCovered === 0) {
    return {
      ...base,
      status: "no-usable-observations",
      observationsUsed,
      calendarMonthsCovered,
      monthlyClimatology,
      greenestMonth: null,
      leastGreenMonth: null,
      amplitude: null,
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
      greenestMonth: null,
      leastGreenMonth: null,
      amplitude: null,
      exclusions,
      reason: "not-all-calendar-months-covered",
    };
  }

  // Full cycle: the greenest and least-green calendar months of the mean annual
  // cycle. Ties resolve to the earlier calendar month so selection is
  // deterministic regardless of input order.
  let greenest = monthlyClimatology[0];
  let leastGreen = monthlyClimatology[0];
  for (const entry of monthlyClimatology) {
    if (entry.meanNdvi > greenest.meanNdvi) greenest = entry;
    if (entry.meanNdvi < leastGreen.meanNdvi) leastGreen = entry;
  }

  return {
    ...base,
    status: "available",
    observationsUsed,
    calendarMonthsCovered,
    monthlyClimatology,
    greenestMonth: {
      calendarMonth: greenest.calendarMonth,
      meteorologicalSeason: greenest.meteorologicalSeason,
      meanNdvi: greenest.meanNdvi,
    },
    leastGreenMonth: {
      calendarMonth: leastGreen.calendarMonth,
      meteorologicalSeason: leastGreen.meteorologicalSeason,
      meanNdvi: leastGreen.meanNdvi,
    },
    amplitude: greenest.meanNdvi - leastGreen.meanNdvi,
    exclusions,
    reason: null,
  };
}

/**
 * A compact, honest readout of the mean annual NDVI cycle. Emphasizes that the
 * amplitude is a difference of climatological means over the supplied years, not
 * a within-year extreme range or a climate normal.
 */
export function formatNdviAnnualCycle(cycle: NdviAnnualCycle): string {
  const source = `${cycle.source.shortName} v${cycle.source.version}`;
  if (
    cycle.status !== "available" ||
    cycle.amplitude === null ||
    cycle.greenestMonth === null ||
    cycle.leastGreenMonth === null
  ) {
    return `No mean annual NDVI cycle (${cycle.reason ?? "unavailable"}; ${cycle.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const amplitude = formatNumber(cycle.amplitude);
  const green = MONTH_ABBREVIATIONS[cycle.greenestMonth.calendarMonth - 1];
  const lean = MONTH_ABBREVIATIONS[cycle.leastGreenMonth.calendarMonth - 1];
  return `Mean annual NDVI cycle amplitude ${amplitude} (${green} greenest ${formatNumber(cycle.greenestMonth.meanNdvi)} − ${lean} least green ${formatNumber(cycle.leastGreenMonth.meanNdvi)}); climatological monthly means over ${cycle.observationsUsed} usable observations, not a climate normal, within-year extreme range, or a productivity measure; source ${source}`;
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

function emptyExclusions(): NdviAnnualCycleExclusions {
  return {
    notCalendarMonth: 0,
    missing: 0,
    invalid: 0,
    duplicateYearMonth: 0,
    insufficientCoverage: 0,
  };
}

function isCalendarMonth(month: NdviMonthlyObservation["month"]): boolean {
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
