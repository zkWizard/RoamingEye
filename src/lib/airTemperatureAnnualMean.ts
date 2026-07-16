import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import { KELVIN_TO_CELSIUS_OFFSET } from "./degreeDays";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Mean annual 2 m air temperature — the WorldClim BIO1 bioclimatic variable — of
 * the mean annual air-temperature cycle at a probed point.
 *
 * `airTemperatureSeasonalCycle` derives the mean cycle's warmest and coldest
 * calendar months and its peak-to-trough amplitude (a measure of *spread*). What
 * it does not report is the cycle's *central level*: the single most-cited
 * climate descriptor of a place — its mean annual temperature. This module fills
 * that gap. It answers "averaged over the whole year, how warm is this point?"
 *
 * Two averages of the same twelve climatological monthly means are reported:
 *   - BIO1 (unweighted): the plain arithmetic mean of the twelve monthly means.
 *     This is the WorldClim convention, so the figure is directly comparable to
 *     published BIO1 layers and is reported as the primary value.
 *   - Day-weighted: each month's mean weighted by its day count in a fixed
 *     365-day standard year. This is the more physical annual mean (a February
 *     mean should count for 28/365 of the year, not 1/12), and it is what the
 *     degree-day identity CDD − HDD = 365·(day-weighted mean − base) uses. The
 *     two differ only slightly — the signed difference is reported as the
 *     weighting bias so a caller can see it rather than have it hidden.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; a short record shifts with the years it contains.
 *  - A mean is reported only when all twelve calendar months are covered. A
 *    partial cycle would bias the annual mean toward whichever season is present
 *    (a record missing winter reads too warm), so the mean is withheld and only
 *    the covered monthly means are exposed — never an average over a part-year.
 *  - A kelvin mean is a level, so the °C companion is the exact −273.15 K offset;
 *    both are given because callers quote climate means in °C.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, external-baseline anomaly, attribution, or diagnosis.
 */

/** Calendar months in a year; a full cycle covers all twelve. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/**
 * Day counts of each calendar month in a fixed 365-day standard (non-leap) year,
 * Jan→Dec. A fixed year keeps the day-weighted mean reproducible; the leap-year
 * caveat is stated in the limitations. Defined locally so this descriptor stays
 * independent of the degree-day module's copy.
 */
export const ANNUAL_MEAN_STANDARD_YEAR_MONTH_DAYS = [
  31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31,
] as const;

/** Total days in the fixed standard year the day-weighting uses. */
export const ANNUAL_MEAN_STANDARD_YEAR_DAYS = 365;

/** Honest scope limits shared by the mean-annual-temperature descriptor. */
export const AIR_TEMPERATURE_ANNUAL_MEAN_LIMITATIONS = [
  "The mean annual temperature (WorldClim BIO1) is the plain arithmetic mean of the twelve climatological monthly means; the day-weighted companion weights each month by its day count in a fixed 365-day standard year.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains.",
  "A mean is reported only when all twelve calendar months are covered; a partial cycle would bias the annual mean toward the covered season, so the mean is withheld and only the covered monthly means are exposed.",
  "Day-weighting uses a fixed 365-day standard year (February = 28 days); a leap year would shift February's weight by under 0.3% and is not applied here.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureAnnualMeanStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export type AirTemperatureAnnualMeanOptions = AirTemperatureAnnualCycleOptions;

/** One climatological monthly mean and the day weight it carries. */
export interface AnnualMeanMonthlyContribution {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Climatological monthly-mean 2 m air temperature for this month, in kelvin. */
  meanKelvin: number;
  /** Standard-year day count that weights this month in the day-weighted mean. */
  monthDays: number;
}

export interface AirTemperatureAnnualMean {
  kind: "air-temperature-annual-mean";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureAnnualMeanStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the kelvin values reported here. */
  nativeUnit: string;
  /** Days in the fixed standard year the day-weighting used. */
  standardYearDays: number;
  /** How many of the twelve calendar months of the underlying cycle were covered. */
  calendarMonthsCovered: number;
  /** Count of observations that contributed to the underlying monthly means. */
  observationsUsed: number;
  /**
   * WorldClim BIO1: the unweighted arithmetic mean of the twelve monthly means,
   * in kelvin. Null unless all twelve calendar months are covered.
   */
  meanAnnualKelvin: number | null;
  /** {@link meanAnnualKelvin} as °C (exact −273.15 K offset); null when withheld. */
  meanAnnualCelsius: number | null;
  /**
   * Day-weighted annual mean (each month weighted by its standard-year day
   * count), in kelvin. The more physical annual average. Null when withheld.
   */
  dayWeightedMeanKelvin: number | null;
  /** {@link dayWeightedMeanKelvin} as °C; null when withheld. */
  dayWeightedMeanCelsius: number | null;
  /**
   * Signed day-weighted minus unweighted mean, in kelvin (equivalently °C for a
   * difference). Small; exposed so the weighting choice is visible rather than
   * hidden. Null when withheld.
   */
  weightingBiasKelvin: number | null;
  /**
   * The covered monthly means and their day weights, sorted January→December.
   * Present even for a partial cycle (which reports no annual mean), so a caller
   * can see the months in hand without a whole-year average being implied.
   */
  monthlyContributions: AnnualMeanMonthlyContribution[];
  limitations: readonly string[];
  /** Short machine-readable reason when no annual mean is reported; null when available. */
  reason: string | null;
}

/**
 * Derive the mean annual 2 m air temperature (WorldClim BIO1) and its
 * day-weighted companion from a supplied set of monthly observations. The
 * underlying mean annual cycle is built by
 * {@link describeAirTemperatureAnnualCycle}, which handles metric filtering,
 * publication and coverage checks, and per-calendar-month averaging; the annual
 * mean is emitted only when that cycle covers all twelve calendar months.
 */
export function describeAirTemperatureAnnualMean(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureAnnualMeanOptions = {}
): AirTemperatureAnnualMean {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );
  return annualMeanFromCycle(cycle);
}

/**
 * Derive the mean annual temperature from an already-computed mean annual cycle.
 * Exposed for callers that have a cycle in hand and want to avoid recomputing it.
 */
export function annualMeanFromCycle(
  cycle: AirTemperatureAnnualCycle
): AirTemperatureAnnualMean {
  const monthlyContributions: AnnualMeanMonthlyContribution[] =
    cycle.monthlyClimatology.map((entry) => ({
      calendarMonth: entry.calendarMonth,
      meanKelvin: entry.meanKelvin,
      monthDays: ANNUAL_MEAN_STANDARD_YEAR_MONTH_DAYS[entry.calendarMonth - 1],
    }));

  const base = {
    kind: "air-temperature-annual-mean" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    standardYearDays: ANNUAL_MEAN_STANDARD_YEAR_DAYS,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    observationsUsed: cycle.observationsUsed,
    monthlyContributions,
    limitations: AIR_TEMPERATURE_ANNUAL_MEAN_LIMITATIONS,
  };

  // Without a full twelve-month cycle, an annual mean would be biased toward the
  // covered season, so it is withheld; the covered months are still exposed. The
  // cycle's own status ("invalid" / "no-usable-observations" /
  // "insufficient-monthly-coverage") carries through, and its reason with it.
  if (cycle.status !== "available") {
    return {
      ...base,
      status: cycle.status,
      meanAnnualKelvin: null,
      meanAnnualCelsius: null,
      dayWeightedMeanKelvin: null,
      dayWeightedMeanCelsius: null,
      weightingBiasKelvin: null,
      reason: cycle.reason ?? "cycle-unavailable",
    };
  }

  // Full cycle: the unweighted BIO1 mean and the day-weighted physical mean over
  // all twelve monthly means.
  let sumKelvin = 0;
  let dayWeightedSumKelvin = 0;
  for (const month of monthlyContributions) {
    sumKelvin += month.meanKelvin;
    dayWeightedSumKelvin += month.monthDays * month.meanKelvin;
  }
  const meanAnnualKelvin = sumKelvin / CALENDAR_MONTHS_IN_YEAR;
  const dayWeightedMeanKelvin =
    dayWeightedSumKelvin / ANNUAL_MEAN_STANDARD_YEAR_DAYS;

  return {
    ...base,
    status: "available",
    meanAnnualKelvin,
    meanAnnualCelsius: meanAnnualKelvin - KELVIN_TO_CELSIUS_OFFSET,
    dayWeightedMeanKelvin,
    dayWeightedMeanCelsius: dayWeightedMeanKelvin - KELVIN_TO_CELSIUS_OFFSET,
    weightingBiasKelvin: dayWeightedMeanKelvin - meanAnnualKelvin,
    reason: null,
  };
}

/**
 * A compact, honest readout of the mean annual temperature. Emphasizes that it
 * is the WorldClim BIO1 mean of climatological monthly means over a short
 * record, not a 30-year normal, and notes the small day-weighting bias.
 */
export function formatAirTemperatureAnnualMean(
  profile: AirTemperatureAnnualMean
): string {
  const source = `${profile.source.shortName} v${profile.source.version}`;
  if (
    profile.status !== "available" ||
    profile.meanAnnualKelvin === null ||
    profile.meanAnnualCelsius === null ||
    profile.weightingBiasKelvin === null
  ) {
    return `No mean annual 2 m air temperature (${profile.reason ?? "unavailable"}; ${profile.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const kelvin = formatNumber(profile.meanAnnualKelvin);
  const celsius = formatNumber(profile.meanAnnualCelsius);
  const bias = formatNumber(profile.weightingBiasKelvin);
  return `Mean annual 2 m air temperature (WorldClim BIO1) ${kelvin} K (${celsius} °C); day-weighting bias ${bias} K; unweighted mean of twelve climatological monthly means over ${profile.observationsUsed} usable observations, not a 30-year normal; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
