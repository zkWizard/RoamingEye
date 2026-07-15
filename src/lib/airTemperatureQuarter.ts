import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Warmest- and coldest-quarter mean 2 m air temperature of the mean annual cycle.
 *
 * `airTemperatureSeasonalCycle` reports the warmest and coldest single calendar
 * MONTH of the mean annual cycle and the peak-to-trough range between them. This
 * module answers the coarser, bioclimatically standard question: averaging over
 * a three-month season, which quarter of the year is warmest and which coldest,
 * and how far apart are they? A "quarter" here is any three consecutive calendar
 * months of the mean cycle — a running window that wraps December→January — so
 * there are twelve candidate quarters, exactly as WorldClim defines its
 * warmest-/coldest-quarter bioclimatic variables (BIO10 and BIO11). The
 * warmest-minus-coldest quarter difference (a BIO7-style range on quarters) is a
 * gently smoothed continentality measure: taking three-month means damps the
 * single-month noise that the month-to-month range in the annual-cycle module
 * carries.
 *
 * This helper derives that and nothing more. It reuses the annual-cycle module's
 * vetted bucketing and exclusion accounting rather than re-deriving them, so a
 * non-temperature value can never leak into a quarter mean.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - A quarter mean is the equal-weight mean of three climatological monthly
 *    MEANS. It is not day-length-weighted (calendar months differ in length) and
 *    is not an extreme (record) temperature — a warm quarter mean does not rule
 *    out cold months within it, nor cold days within those months.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; a short record shifts with the years it contains.
 *  - Quarters are reported only when all twelve calendar months of the cycle are
 *    covered, so an unseen calendar month can never fall inside the extreme
 *    quarter or bias the range.
 *  - A kelvin difference is numerically the same figure in °C, so the range needs
 *    no unit conversion.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, external-baseline anomaly, attribution, or diagnosis.
 */

/** Consecutive months per quarter, matching the WorldClim quarter definition. */
export const MONTHS_PER_QUARTER = 3;

/** Calendar months in a year; also the number of candidate running quarters. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the warmest/coldest-quarter descriptor. */
export const AIR_TEMPERATURE_QUARTER_LIMITATIONS = [
  "A quarter is any three consecutive calendar months of the mean annual cycle (wrapping December→January); the warmest/coldest quarter is the running three-month window with the highest/lowest mean of climatological monthly means (WorldClim BIO10/BIO11 convention).",
  "A quarter mean averages three climatological monthly means with equal weight; it is not day-length-weighted and is not an extreme (record) temperature, so it does not rule out colder or warmer months and days inside the quarter.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains.",
  "Quarters are reported only when all twelve calendar months are covered; otherwise none is emitted so an unseen calendar month can never fall inside the extreme quarter. A kelvin difference is the same figure in °C.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureQuarterStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

/** One three-month quarter of the mean annual cycle and its mean temperature. */
export interface AirTemperatureQuarter {
  /** Starting calendar month of the quarter, 1 (January) through 12 (December). */
  startMonth: number;
  /** The three calendar months composing the quarter, in order; may wrap the year. */
  months: [number, number, number];
  /** Equal-weight mean of the three climatological monthly means, in kelvin. */
  meanKelvin: number;
}

export interface AirTemperatureQuarterProfile {
  kind: "air-temperature-quarter-profile";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureQuarterStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of every value reported here. */
  nativeUnit: string;
  /** How many of the twelve calendar months of the underlying cycle were covered. */
  calendarMonthsCovered: number;
  /** Count of observations that contributed to the underlying monthly means. */
  observationsUsed: number;
  /** Warmest three-month quarter of the mean cycle, or null without a full cycle. */
  warmestQuarter: AirTemperatureQuarter | null;
  /** Coldest three-month quarter of the mean cycle, or null without a full cycle. */
  coldestQuarter: AirTemperatureQuarter | null;
  /**
   * Warmest-quarter mean minus coldest-quarter mean, in kelvin (equivalently °C
   * for a difference). Null unless all twelve calendar months are covered.
   */
  rangeKelvin: number | null;
  limitations: readonly string[];
  /** Short machine-readable reason when no quarter is reported; null when available. */
  reason: string | null;
}

/**
 * Derive the warmest and coldest three-month quarter of the mean annual 2 m
 * air-temperature cycle, and the range between their means, from a supplied set
 * of monthly observations. The underlying mean annual cycle is built by
 * {@link describeAirTemperatureAnnualCycle}, which handles metric filtering,
 * publication and coverage checks, and per-calendar-month averaging; quarters
 * are emitted only when that cycle covers all twelve calendar months.
 */
export function describeAirTemperatureQuarters(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureAnnualCycleOptions = {}
): AirTemperatureQuarterProfile {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );
  return quartersFromCycle(cycle);
}

/**
 * Derive the quarter profile from an already-computed mean annual cycle. Exposed
 * for callers that have a cycle in hand and want to avoid recomputing it.
 */
export function quartersFromCycle(
  cycle: AirTemperatureAnnualCycle
): AirTemperatureQuarterProfile {
  const base = {
    kind: "air-temperature-quarter-profile" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    observationsUsed: cycle.observationsUsed,
    limitations: AIR_TEMPERATURE_QUARTER_LIMITATIONS,
  };

  if (cycle.status !== "available") {
    return {
      ...base,
      status: cycle.status,
      warmestQuarter: null,
      coldestQuarter: null,
      rangeKelvin: null,
      reason: cycle.reason ?? "cycle-unavailable",
    };
  }

  // A full cycle exposes all twelve monthly means; index them by calendar month.
  const meanByMonth = new Map<number, number>();
  for (const entry of cycle.monthlyClimatology) {
    meanByMonth.set(entry.calendarMonth, entry.meanKelvin);
  }

  // Twelve running quarters, each starting at month s and wrapping the year.
  // Ties resolve to the earliest starting month so selection is deterministic
  // regardless of input order.
  let warmest: AirTemperatureQuarter | null = null;
  let coldest: AirTemperatureQuarter | null = null;
  for (
    let startMonth = 1;
    startMonth <= CALENDAR_MONTHS_IN_YEAR;
    startMonth++
  ) {
    const months = quarterMonths(startMonth);
    const meanKelvin =
      months.reduce((sum, month) => sum + (meanByMonth.get(month) ?? 0), 0) /
      MONTHS_PER_QUARTER;
    const quarter: AirTemperatureQuarter = { startMonth, months, meanKelvin };
    if (warmest === null || quarter.meanKelvin > warmest.meanKelvin) {
      warmest = quarter;
    }
    if (coldest === null || quarter.meanKelvin < coldest.meanKelvin) {
      coldest = quarter;
    }
  }

  // A full cycle guarantees both extremes exist; the guard satisfies the types.
  if (warmest === null || coldest === null) {
    return {
      ...base,
      status: "no-usable-observations",
      warmestQuarter: null,
      coldestQuarter: null,
      rangeKelvin: null,
      reason: "no-quarter-derived",
    };
  }

  return {
    ...base,
    status: "available",
    warmestQuarter: warmest,
    coldestQuarter: coldest,
    rangeKelvin: warmest.meanKelvin - coldest.meanKelvin,
    reason: null,
  };
}

/** The three calendar months of the quarter starting at `startMonth`, wrapping. */
function quarterMonths(startMonth: number): [number, number, number] {
  return [startMonth, wrapMonth(startMonth + 1), wrapMonth(startMonth + 2)];
}

/** Wrap a 1-based month index back into 1–12. */
function wrapMonth(month: number): number {
  return ((month - 1) % CALENDAR_MONTHS_IN_YEAR) + 1;
}

/**
 * A compact, honest readout of the warmest and coldest quarters. Emphasizes that
 * a quarter mean is a mean of climatological monthly means over a short record,
 * not an extreme range or a climate normal.
 */
export function formatAirTemperatureQuarters(
  profile: AirTemperatureQuarterProfile
): string {
  const source = `${profile.source.shortName} v${profile.source.version}`;
  if (
    profile.status !== "available" ||
    profile.warmestQuarter === null ||
    profile.coldestQuarter === null ||
    profile.rangeKelvin === null
  ) {
    return `No warmest/coldest 2 m air-temperature quarter (${profile.reason ?? "unavailable"}; ${profile.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const warm = quarterLabel(profile.warmestQuarter);
  const cold = quarterLabel(profile.coldestQuarter);
  const range = formatNumber(profile.rangeKelvin);
  return `Warmest 2 m air-temperature quarter ${warm} ${formatNumber(profile.warmestQuarter.meanKelvin)} K, coldest ${cold} ${formatNumber(profile.coldestQuarter.meanKelvin)} K (range ${range} K); mean of climatological monthly means over ${profile.observationsUsed} usable observations, not a climate normal or extreme range; source ${source}`;
}

/** e.g. "Jun–Aug" for the quarter starting in June. */
function quarterLabel(quarter: AirTemperatureQuarter): string {
  const first = MONTH_ABBREVIATIONS[quarter.months[0] - 1];
  const last = MONTH_ABBREVIATIONS[quarter.months[2] - 1];
  return `${first}–${last}`;
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

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
