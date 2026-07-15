import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  summarizeAerosolLoading,
  type AerosolObservation,
} from "./aerosolLoading";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Mean annual cycle and seasonal amplitude of column aerosol optical depth (AOD).
 *
 * `aerosolSeasonalBaseline` answers "is THIS calendar month hazy or clear for
 * here", comparing one supplied month to prior same-calendar-month values. That
 * is a single-month anomaly. `describeAerosolLoadingChange` compares two adjacent
 * months. Neither draws the shape a reader most wants for a place with a strong
 * dust or biomass-burning season: averaging each calendar month across the years
 * we actually have, what does the mean annual AOD cycle look like, and how far
 * does it swing from its haziest to its clearest calendar month?
 *
 * That peak-to-trough spread of the mean cycle is a plain *seasonality strength*
 * for column loading: a site with a pronounced dust or smoke season swings
 * widely between months, a background-maritime site far less. This helper derives
 * that mean cycle and its amplitude and nothing more — it mirrors the audited
 * annual-cycle machinery in airTemperatureSeasonalCycle.ts (deduplicate years,
 * drop unpublished or low-coverage months, require a per-month year floor, and
 * emit an amplitude only for a full twelve-month cycle).
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - AOD at 550 nm is a whole-column optical thickness, NOT a surface
 *    concentration and NOT a regulatory air-quality or health index. A haziest
 *    month is a haziest optical column, nothing about surface air.
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so each value is a modelled monthly mean, not a direct pixel measurement.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climatological normal. A short record shifts with the years it
 *    happens to contain and a single dust year can dominate a thin month.
 *  - The amplitude is the difference between two climatological monthly *means*
 *    (haziest-month mean minus clearest-month mean), a dimensionless AOD
 *    difference, NOT an extreme range and NOT a record.
 *  - An amplitude is reported only when all twelve calendar months are covered.
 *    A partial cycle exposes the monthly means it has but no amplitude, so a
 *    missing haziest or clearest month is never guessed.
 *  - Nothing here is a forecast, trend, external-baseline anomaly, attribution,
 *    or diagnosis.
 *
 * Pure, render-free logic (see aerosolAnnualCycle.test.ts).
 */

/** A conservative floor of distinct years per calendar month before it counts. */
export const MINIMUM_AEROSOL_ANNUAL_CYCLE_YEARS_PER_MONTH = 3;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_AEROSOL_ANNUAL_CYCLE_VALID_FRACTION = 0.6;

/** Every calendar month must be covered before a full-cycle amplitude is emitted. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the aerosol annual-cycle descriptor. */
export const AEROSOL_ANNUAL_CYCLE_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so each value is a modelled monthly mean, not a direct pixel measurement.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains and one dust or smoke year can dominate a thin month.",
  "The amplitude is the difference between two climatological monthly means (haziest-month mean minus clearest-month mean), a dimensionless AOD difference, not an extreme range or a record.",
  "An amplitude is reported only when all twelve calendar months are covered; a partial cycle exposes its monthly means but no amplitude, so a missing haziest or clearest month is never guessed.",
  "Nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AerosolAnnualCycleStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface AerosolAnnualCycleOptions {
  /** Distinct years required per calendar month before it enters the cycle. */
  minimumYearsPerMonth?: number;
  /** Minimum valid spatial fraction for an observation to be usable. */
  minimumValidFraction?: number;
}

/** Climatological summary of one calendar month across the supplied years. */
export interface MonthlyAerosolClimatology {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Distinct years that contributed to this month's mean. */
  yearsUsed: number;
  /** Mean column AOD at 550 nm for this calendar month (dimensionless). */
  meanAod: number;
  /** Lowest contributing yearly AOD for this calendar month. */
  minAod: number;
  /** Highest contributing yearly AOD for this calendar month. */
  maxAod: number;
}

/** One extreme of the mean annual cycle: a calendar month and its mean AOD. */
export interface AerosolAnnualCycleExtreme {
  calendarMonth: number;
  meanAod: number;
}

export interface AerosolAnnualCycleExclusions {
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

export interface AerosolAnnualCycle {
  kind: "aerosol-mean-annual-cycle";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AerosolAnnualCycleStatus;
  /** Cited MERRA-2 aerosol optical thickness product; provenance is preserved. */
  source: DatasetRef;
  /** Wavelength of the rendered optical-thickness product, in nm. */
  wavelengthNm: number;
  /** AOD is dimensionless; echoed for symmetry with the other descriptors. */
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
  monthlyClimatology: MonthlyAerosolClimatology[];
  /** Haziest (highest-mean) calendar month, or null without a full cycle. */
  haziestMonth: AerosolAnnualCycleExtreme | null;
  /** Clearest (lowest-mean) calendar month, or null without a full cycle. */
  clearestMonth: AerosolAnnualCycleExtreme | null;
  /**
   * Haziest-month mean minus clearest-month mean (dimensionless AOD). Null
   * unless all twelve calendar months are covered, so a partial cycle never
   * yields an amplitude that omits an unseen month.
   */
  amplitude: number | null;
  exclusions: AerosolAnnualCycleExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no amplitude is reported. */
  reason: string | null;
}

/**
 * Derive the mean annual column-AOD cycle and its haziest-to-clearest amplitude
 * from a supplied set of monthly aerosol observations. Each calendar month is
 * averaged over its distinct usable years; a month needs `minimumYearsPerMonth`
 * of them to count, and an amplitude is emitted only when every calendar month
 * qualifies. Grouping observations to one place is the caller's responsibility;
 * this helper never borrows adjacent months or fills missing years.
 */
export function describeAerosolAnnualCycle(
  observations: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolAnnualCycleOptions = {}
): AerosolAnnualCycle {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ??
    MINIMUM_AEROSOL_ANNUAL_CYCLE_YEARS_PER_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_AEROSOL_ANNUAL_CYCLE_VALID_FRACTION;
  const exclusions = emptyExclusions();

  const base = {
    kind: "aerosol-mean-annual-cycle" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    requiredYearsPerMonth,
    requiredValidFraction,
    observationsSupplied: observations.length,
    limitations: AEROSOL_ANNUAL_CYCLE_LIMITATIONS,
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
      haziestMonth: null,
      clearestMonth: null,
      amplitude: null,
      exclusions,
      reason: "invalid-configuration",
    };
  }

  // Bucket usable values by calendar month, keeping one value per distinct year.
  const buckets = new Map<number, Map<number, number>>();
  for (const observation of observations) {
    if (!isCalendarMonth(observation.dataMonth)) {
      exclusions.notCalendarMonth += 1;
      continue;
    }
    const summary = summarizeAerosolLoading(observation, availableThrough);
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

  const monthlyClimatology: MonthlyAerosolClimatology[] = [];
  let observationsUsed = 0;
  for (let calendarMonth = 1; calendarMonth <= CALENDAR_MONTHS_IN_YEAR;) {
    const yearValues = buckets.get(calendarMonth);
    if (yearValues && yearValues.size >= requiredYearsPerMonth) {
      const values = [...yearValues.values()];
      observationsUsed += values.length;
      monthlyClimatology.push({
        calendarMonth,
        yearsUsed: values.length,
        meanAod: values.reduce((sum, value) => sum + value, 0) / values.length,
        minAod: Math.min(...values),
        maxAod: Math.max(...values),
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
      haziestMonth: null,
      clearestMonth: null,
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
      haziestMonth: null,
      clearestMonth: null,
      amplitude: null,
      exclusions,
      reason: "not-all-calendar-months-covered",
    };
  }

  // Full cycle: the haziest and clearest calendar months of the mean annual
  // cycle. Ties resolve to the earlier calendar month so selection is
  // deterministic regardless of input order.
  let haziest = monthlyClimatology[0];
  let clearest = monthlyClimatology[0];
  for (const entry of monthlyClimatology) {
    if (entry.meanAod > haziest.meanAod) haziest = entry;
    if (entry.meanAod < clearest.meanAod) clearest = entry;
  }

  return {
    ...base,
    status: "available",
    observationsUsed,
    calendarMonthsCovered,
    monthlyClimatology,
    haziestMonth: {
      calendarMonth: haziest.calendarMonth,
      meanAod: haziest.meanAod,
    },
    clearestMonth: {
      calendarMonth: clearest.calendarMonth,
      meanAod: clearest.meanAod,
    },
    amplitude: haziest.meanAod - clearest.meanAod,
    exclusions,
    reason: null,
  };
}

/**
 * A compact, honest readout of the mean annual AOD cycle. Emphasizes that the
 * amplitude is a difference of climatological means over a short record, not an
 * extreme range or a climate normal.
 */
export function formatAerosolAnnualCycle(cycle: AerosolAnnualCycle): string {
  const source = `${cycle.source.shortName} v${cycle.source.version}`;
  if (
    cycle.status !== "available" ||
    cycle.amplitude === null ||
    cycle.haziestMonth === null ||
    cycle.clearestMonth === null
  ) {
    return `No mean annual column-AOD cycle (${cycle.reason ?? "unavailable"}; ${cycle.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const amplitude = formatNumber(cycle.amplitude);
  const hazy = MONTH_ABBREVIATIONS[cycle.haziestMonth.calendarMonth - 1];
  const clear = MONTH_ABBREVIATIONS[cycle.clearestMonth.calendarMonth - 1];
  return `Mean annual column-AOD (550 nm) range ${amplitude} (${hazy} haziest ${formatNumber(cycle.haziestMonth.meanAod)} − ${clear} clearest ${formatNumber(cycle.clearestMonth.meanAod)}, dimensionless); mean annual cycle over ${cycle.observationsUsed} usable observations, not a climate normal or extreme range; source ${source}`;
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

function emptyExclusions(): AerosolAnnualCycleExclusions {
  return {
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
