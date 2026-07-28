import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Kira's Warmth Index (WI) and Coldness Index (CI) of the mean annual 2 m
 * air-temperature cycle.
 *
 * The extreme/range descriptors in this repo — warmest and coldest month
 * (`airTemperatureSeasonalCycle`), the warmest/coldest quarter
 * (`airTemperatureQuarter`), and the seasonal-cycle amplitude — say WHERE the
 * cycle peaks and how far it swings, but nothing about how much cumulative
 * warmth the year delivers. Kira's thermal indices answer that: they accumulate
 * the mean cycle's monthly excess (WI) and deficit (CI) against a fixed
 * biological-activity threshold, giving a compact pair that underlies Kira's
 * classic thermal zonation of vegetation (Kira 1945; Yim & Kira 1975; Fang &
 * Yoda 1988).
 *
 * Definition, on the twelve climatological monthly means Tₘ (°C), base b = 5 °C:
 *   WI = Σ over months of max(0, Tₘ − b)   (°C·month, ≥ 0)
 *   CI = Σ over months of min(0, Tₘ − b)   (°C·month, ≤ 0)
 * The 5 °C base is Kira's convention: the approximate lower limit for the growth
 * of temperate vegetation. Because a kelvin difference equals a °C difference,
 * the excess/deficit is computed directly as Tₘ(K) − (b + 273.15) K, so the
 * indices carry the natural unit °C·month (equivalently K·month).
 *
 * This helper derives that pair and nothing more. It reuses the annual-cycle
 * module's vetted metric filtering, publication/coverage checks, and
 * per-calendar-month averaging, and only emits indices when that cycle covers
 * all twelve calendar months — so an unseen calendar month can never be silently
 * dropped from a sum that is meant to run over the whole year.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The indices are Kira's monthly-mean formulation: they sum climatological
 *    MONTHLY MEANS, not daily temperatures. A month whose mean sits below the
 *    base still contributes warm days that a daily-integrated warmth sum would
 *    count; because max(0, ·) is convex (Jensen's inequality), the monthly-mean
 *    WI is a LOWER bound on a daily-resolved WI, and |CI| likewise. This is the
 *    canonical definition, not an error, but it is not day-resolved.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; a short record shifts with the years it contains.
 *  - The base is a stated convention (default 5 °C) and travels with the result;
 *    it is not derived from the data. Kira's vegetation zones are intentionally
 *    NOT assigned here — the indices are reported as thermal-accumulation
 *    quantities, not a biome classification.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, external-baseline anomaly, attribution, or diagnosis.
 */

/** Kira's conventional base temperature for WI/CI, in °C. */
export const KIRA_BASE_TEMPERATURE_C = 5;

/** Kelvin → Celsius offset (exact, standard-pressure freezing point of water). */
export const KELVIN_TO_CELSIUS_OFFSET = 273.15;

/** Calendar months in a year; a full cycle covers all twelve. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/** Honest scope limits shared by the warmth/coldness-index descriptor. */
export const AIR_TEMPERATURE_WARMTH_INDEX_LIMITATIONS = [
  "Kira's Warmth Index (WI) sums each mean-cycle month's excess above the base (default 5 °C) and the Coldness Index (CI) sums the deficits below it, in °C·month; WI ≥ 0 and CI ≤ 0.",
  "These are the monthly-mean formulation: they sum climatological monthly means, not daily temperatures. Because the clip at zero is convex, the monthly-mean WI is a lower bound on a daily-resolved WI (and |CI| likewise); the result is not day-resolved.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains.",
  "Indices are reported only when all twelve calendar months are covered, so no month is dropped from a whole-year sum. The base is a stated convention that travels with the result; Kira's vegetation zones are not assigned here.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureWarmthIndexStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface AirTemperatureWarmthIndexOptions extends AirTemperatureAnnualCycleOptions {
  /** Base temperature in °C; defaults to {@link KIRA_BASE_TEMPERATURE_C}. */
  baseTemperatureC?: number;
}

export interface AirTemperatureWarmthIndexProfile {
  kind: "air-temperature-warmth-index-profile";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureWarmthIndexStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of both indices; a difference sum, so °C·month (= K·month). */
  unit: string;
  /** Base temperature the excess/deficit is measured against, in °C. */
  baseTemperatureC: number;
  /** How many of the twelve calendar months of the underlying cycle were covered. */
  calendarMonthsCovered: number;
  /** Count of observations that contributed to the underlying monthly means. */
  observationsUsed: number;
  /** Kira Warmth Index (Σ monthly excess above base), °C·month; ≥ 0 or null. */
  warmthIndexDegreeMonths: number | null;
  /** Kira Coldness Index (Σ monthly deficit below base), °C·month; ≤ 0 or null. */
  coldnessIndexDegreeMonths: number | null;
  /** Count of mean-cycle months warmer than the base; null without a full cycle. */
  warmMonths: number | null;
  /** Count of mean-cycle months colder than the base; null without a full cycle. */
  coldMonths: number | null;
  limitations: readonly string[];
  /** Short machine-readable reason when no indices are reported; null when available. */
  reason: string | null;
}

/**
 * Derive Kira's Warmth and Coldness indices for the mean annual 2 m
 * air-temperature cycle from a supplied set of monthly observations. The
 * underlying mean annual cycle is built by
 * {@link describeAirTemperatureAnnualCycle}, which handles metric filtering,
 * publication and coverage checks, and per-calendar-month averaging; indices are
 * emitted only when that cycle covers all twelve calendar months.
 */
export function describeAirTemperatureWarmthIndex(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureWarmthIndexOptions = {}
): AirTemperatureWarmthIndexProfile {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );
  return warmthIndexFromCycle(cycle, options);
}

/**
 * Derive the warmth/coldness-index profile from an already-computed mean annual
 * cycle. Exposed for callers that have a cycle in hand and want to avoid
 * recomputing it.
 */
export function warmthIndexFromCycle(
  cycle: AirTemperatureAnnualCycle,
  options: Pick<AirTemperatureWarmthIndexOptions, "baseTemperatureC"> = {}
): AirTemperatureWarmthIndexProfile {
  const baseTemperatureC = options.baseTemperatureC ?? KIRA_BASE_TEMPERATURE_C;

  const base = {
    kind: "air-temperature-warmth-index-profile" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    unit: "°C·month",
    baseTemperatureC,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    observationsUsed: cycle.observationsUsed,
    limitations: AIR_TEMPERATURE_WARMTH_INDEX_LIMITATIONS,
  };

  if (!Number.isFinite(baseTemperatureC)) {
    return {
      ...base,
      status: "invalid",
      warmthIndexDegreeMonths: null,
      coldnessIndexDegreeMonths: null,
      warmMonths: null,
      coldMonths: null,
      reason: "invalid-base-temperature",
    };
  }

  if (cycle.status !== "available") {
    return {
      ...base,
      status: cycle.status,
      warmthIndexDegreeMonths: null,
      coldnessIndexDegreeMonths: null,
      warmMonths: null,
      coldMonths: null,
      reason: cycle.reason ?? "cycle-unavailable",
    };
  }

  // A full cycle exposes all twelve monthly means. Accumulate the excess above
  // and deficit below the base. A kelvin difference equals a °C difference, so
  // the base is shifted into kelvin once and the sums come out in °C·month.
  const baseKelvin = baseTemperatureC + KELVIN_TO_CELSIUS_OFFSET;
  let warmthIndex = 0;
  let coldnessIndex = 0;
  let warmMonths = 0;
  let coldMonths = 0;
  for (const entry of cycle.monthlyClimatology) {
    const departure = entry.meanKelvin - baseKelvin;
    if (departure > 0) {
      warmthIndex += departure;
      warmMonths += 1;
    } else if (departure < 0) {
      coldnessIndex += departure;
      coldMonths += 1;
    }
    // A month exactly at the base contributes 0 to both indices and is counted
    // in neither tally, matching Kira's max(0, ·) / min(0, ·) definition.
  }

  return {
    ...base,
    status: "available",
    warmthIndexDegreeMonths: warmthIndex,
    coldnessIndexDegreeMonths: coldnessIndex,
    warmMonths,
    coldMonths,
    reason: null,
  };
}

/**
 * A compact, honest readout of the warmth/coldness indices. Emphasizes that they
 * are Kira's monthly-mean thermal accumulations over a short record against a
 * stated base, not a climate normal, a day-resolved sum, or a biome class.
 */
export function formatAirTemperatureWarmthIndex(
  profile: AirTemperatureWarmthIndexProfile
): string {
  const source = `${profile.source.shortName} v${profile.source.version}`;
  if (
    profile.status !== "available" ||
    profile.warmthIndexDegreeMonths === null ||
    profile.coldnessIndexDegreeMonths === null
  ) {
    return `No Kira warmth/coldness index for 2 m air temperature (${profile.reason ?? "unavailable"}; ${profile.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }
  const wi = formatNumber(profile.warmthIndexDegreeMonths);
  const ci = formatNumber(profile.coldnessIndexDegreeMonths);
  return `Kira Warmth Index ${wi} ${profile.unit}, Coldness Index ${ci} ${profile.unit} (base ${profile.baseTemperatureC} °C); monthly-mean thermal accumulation over ${profile.observationsUsed} usable observations, not a climate normal, day-resolved sum, or vegetation zone; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
