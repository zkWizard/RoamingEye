import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import {
  DEFAULT_DEGREE_DAY_BASE_C,
  KELVIN_TO_CELSIUS_OFFSET,
} from "./degreeDays";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Annual heating- and cooling-degree-day totals of the mean annual 2 m
 * air-temperature cycle.
 *
 * `degreeDays` derives heating (HDD) and cooling (CDD) degree-days for a SINGLE
 * supplied month. But degree-days are almost always used as an ANNUAL total —
 * "this location runs ~2500 HDD and ~400 CDD per year" is how building-energy,
 * agronomy, and climate-normals work quote them. This module answers that
 * climatological question for a probed point: taking the mean annual cycle
 * (each calendar month averaged across the years we actually have), how many
 * heating and cooling degree-days does a representative year accumulate against
 * a stated base?
 *
 * Definition, on the twelve climatological monthly means Tₘ (°C), base b
 * (default 18 °C), with dₘ the day count of calendar month m in a fixed 365-day
 * standard year:
 *   HDD = Σ over months of dₘ · max(0, b − Tₘ)   (°C·day, ≥ 0)
 *   CDD = Σ over months of dₘ · max(0, Tₘ − b)   (°C·day, ≥ 0)
 * This mirrors the monthly-mean approximation in `degreeDays` (mean deficit or
 * excess times the month's day count) and sums it over the whole mean cycle.
 *
 * This is a distinct quantity from Kira's Warmth/Coldness Index
 * (`airTemperatureWarmthIndex`): Kira accumulates a COUNT of degree-*months*
 * against a 5 °C biological-activity base; HDD/CDD accumulate day-weighted
 * degree-*days* against an 18 °C building-comfort base, and split heating from
 * cooling. This helper derives that annual pair and nothing more; it reuses the
 * annual-cycle module's vetted metric filtering, publication/coverage checks,
 * and per-calendar-month averaging, and only reports annual totals when the
 * cycle covers all twelve calendar months — so a month can never be silently
 * dropped from a sum meant to run over the whole year.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - These are the monthly-mean approximation of degree-days: they use the
 *    climatological monthly MEAN, not daily temperatures. Because the clip at
 *    zero is convex (Jensen's inequality), the monthly-mean HDD and CDD are each
 *    a LOWER bound on a daily-resolved total; the shortfall is largest in
 *    transition months whose mean sits near the base. This is the canonical
 *    monthly-mean method, not an error, but it is not day-resolved.
 *  - Day-weighting uses a fixed 365-day standard year (February = 28 days) so
 *    the normal is reproducible; a leap year would shift February's weight by
 *    under 0.3% and is not applied here.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; a short record shifts with the years it contains.
 *  - The base is a stated convention (default 18 °C) and travels with the
 *    result; it is not derived from the data.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, external-baseline anomaly, attribution, or diagnosis.
 */

/** Calendar months in a year; a full cycle covers all twelve. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/**
 * Day counts of each calendar month in a fixed 365-day standard (non-leap) year,
 * Jan→Dec. Using a fixed year keeps the climatological normal reproducible; the
 * limitations state the leap-year caveat plainly.
 */
export const STANDARD_YEAR_MONTH_DAYS = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

/** Total days in the fixed standard year the day-weighting uses. */
export const STANDARD_YEAR_DAYS = 365;

/** Honest scope limits shared by the annual degree-day climatology descriptor. */
export const AIR_TEMPERATURE_DEGREE_DAY_CLIMATOLOGY_LIMITATIONS = [
  "Annual heating (HDD) and cooling (CDD) degree-days sum each mean-cycle month's day-weighted deficit below and excess above the base (default 18 °C), in °C·day; both totals are ≥ 0.",
  "These are the monthly-mean approximation: they use climatological monthly means, not daily temperatures. Because the clip at zero is convex, the monthly-mean HDD and CDD are each a lower bound on a daily-resolved total, most so in transition months whose mean sits near the base; the result is not day-resolved.",
  "Day-weighting uses a fixed 365-day standard year (February = 28 days) so the normal is reproducible; a leap year would shift February's weight by under 0.3% and is not applied here.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains.",
  "Annual totals are reported only when all twelve calendar months are covered, so no month is dropped from a whole-year sum. The base is a stated convention that travels with the result.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureDegreeDayClimatologyStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface AirTemperatureDegreeDayClimatologyOptions extends AirTemperatureAnnualCycleOptions {
  /** Base temperature in °C; defaults to {@link DEFAULT_DEGREE_DAY_BASE_C}. */
  baseC?: number;
}

/** Day-weighted degree-days of one climatological calendar month. */
export interface MonthlyDegreeDayNormal {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Climatological monthly-mean 2 m air temperature for this month, in °C. */
  meanTemperatureC: number;
  /** Standard-year day count used to weight this month. */
  monthDays: number;
  /** Heating degree-days for this month (°C·day); 0 when mean ≥ base. */
  heatingDegreeDays: number;
  /** Cooling degree-days for this month (°C·day); 0 when mean ≤ base. */
  coolingDegreeDays: number;
}

export interface AirTemperatureDegreeDayClimatology {
  kind: "air-temperature-annual-degree-day-climatology";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureDegreeDayClimatologyStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of both annual totals and every per-month value. */
  unit: string;
  /** Base temperature the deficit/excess is measured against, in °C. */
  baseTemperatureC: number;
  /** Days in the fixed standard year the day-weighting used. */
  standardYearDays: number;
  /** How many of the twelve calendar months of the underlying cycle were covered. */
  calendarMonthsCovered: number;
  /** Count of observations that contributed to the underlying monthly means. */
  observationsUsed: number;
  /** Annual heating degree-days (°C·day); ≥ 0, or null without a full cycle. */
  annualHeatingDegreeDays: number | null;
  /** Annual cooling degree-days (°C·day); ≥ 0, or null without a full cycle. */
  annualCoolingDegreeDays: number | null;
  /**
   * Per-calendar-month day-weighted degree-days, sorted January→December, for
   * covered months only. Present even for a partial cycle (which reports no
   * annual totals), so a caller can see the months in hand without a whole-year
   * sum being implied.
   */
  monthlyDegreeDays: MonthlyDegreeDayNormal[];
  limitations: readonly string[];
  /** Short machine-readable reason when no annual totals are reported; null when available. */
  reason: string | null;
}

/**
 * Derive annual heating/cooling degree-day totals for the mean annual 2 m
 * air-temperature cycle from a supplied set of monthly observations. The
 * underlying mean annual cycle is built by
 * {@link describeAirTemperatureAnnualCycle}, which handles metric filtering,
 * publication and coverage checks, and per-calendar-month averaging; annual
 * totals are emitted only when that cycle covers all twelve calendar months.
 */
export function describeAirTemperatureDegreeDayClimatology(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureDegreeDayClimatologyOptions = {}
): AirTemperatureDegreeDayClimatology {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );
  return degreeDayClimatologyFromCycle(cycle, options);
}

/**
 * Derive the annual degree-day climatology from an already-computed mean annual
 * cycle. Exposed for callers that have a cycle in hand and want to avoid
 * recomputing it.
 */
export function degreeDayClimatologyFromCycle(
  cycle: AirTemperatureAnnualCycle,
  options: Pick<AirTemperatureDegreeDayClimatologyOptions, "baseC"> = {}
): AirTemperatureDegreeDayClimatology {
  const baseTemperatureC = options.baseC ?? DEFAULT_DEGREE_DAY_BASE_C;

  const base = {
    kind: "air-temperature-annual-degree-day-climatology" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    unit: "°C·day",
    baseTemperatureC,
    standardYearDays: STANDARD_YEAR_DAYS,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    observationsUsed: cycle.observationsUsed,
    limitations: AIR_TEMPERATURE_DEGREE_DAY_CLIMATOLOGY_LIMITATIONS,
  };

  if (!Number.isFinite(baseTemperatureC)) {
    return {
      ...base,
      status: "invalid",
      annualHeatingDegreeDays: null,
      annualCoolingDegreeDays: null,
      monthlyDegreeDays: [],
      reason: "invalid-base-temperature",
    };
  }

  // Day-weighted degree-days for every covered calendar month. This mirrors the
  // single-month arithmetic in degreeDays.ts (mean deficit/excess × day count),
  // and is computed even for a partial cycle so the months in hand are visible.
  const monthlyDegreeDays: MonthlyDegreeDayNormal[] =
    cycle.monthlyClimatology.map((entry) => {
      const meanTemperatureC = entry.meanKelvin - KELVIN_TO_CELSIUS_OFFSET;
      const monthDays = STANDARD_YEAR_MONTH_DAYS[entry.calendarMonth - 1];
      return {
        calendarMonth: entry.calendarMonth,
        meanTemperatureC,
        monthDays,
        heatingDegreeDays:
          monthDays * Math.max(0, baseTemperatureC - meanTemperatureC),
        coolingDegreeDays:
          monthDays * Math.max(0, meanTemperatureC - baseTemperatureC),
      };
    });

  if (cycle.status !== "available") {
    return {
      ...base,
      status: cycle.status,
      annualHeatingDegreeDays: null,
      annualCoolingDegreeDays: null,
      monthlyDegreeDays,
      reason: cycle.reason ?? "cycle-unavailable",
    };
  }

  // A full cycle: sum the twelve months into annual totals.
  let annualHeatingDegreeDays = 0;
  let annualCoolingDegreeDays = 0;
  for (const month of monthlyDegreeDays) {
    annualHeatingDegreeDays += month.heatingDegreeDays;
    annualCoolingDegreeDays += month.coolingDegreeDays;
  }

  return {
    ...base,
    status: "available",
    annualHeatingDegreeDays,
    annualCoolingDegreeDays,
    monthlyDegreeDays,
    reason: null,
  };
}

/**
 * A compact, honest readout of the annual degree-day totals. Emphasizes that
 * they are a monthly-mean, lower-bound approximation over a short record against
 * a stated base, not a 30-year normal or a daily-resolved total.
 */
export function formatAirTemperatureDegreeDayClimatology(
  profile: AirTemperatureDegreeDayClimatology
): string {
  const source = `${profile.source.shortName} v${profile.source.version}`;
  if (
    profile.status !== "available" ||
    profile.annualHeatingDegreeDays === null ||
    profile.annualCoolingDegreeDays === null
  ) {
    return `No annual 2 m air-temperature degree-day climatology (${profile.reason ?? "unavailable"}; ${profile.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const hdd = formatNumber(profile.annualHeatingDegreeDays);
  const cdd = formatNumber(profile.annualCoolingDegreeDays);
  return `Annual heating degree-days ${hdd} ${profile.unit}, cooling degree-days ${cdd} ${profile.unit} (base ${profile.baseTemperatureC} °C, ${profile.standardYearDays}-day year); monthly-mean climatological normal over ${profile.observationsUsed} usable observations, a lower-bound approximation, not a 30-year normal or day-resolved total; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
