import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import { KELVIN_TO_CELSIUS_OFFSET } from "./degreeDays";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Thermal warm-season length of the mean annual 2 m air-temperature cycle at a
 * probed point.
 *
 * `airTemperatureSeasonalCycle` derives the mean cycle's warmest/coldest
 * calendar months and its peak-to-trough amplitude (its *spread*), and a mean
 * annual temperature summarizes its *level*. Neither answers a distinct,
 * long-standing agroclimatic question: for how much of the year is this point
 * warm enough for plant growth, and when is that warm season? This module fills
 * that gap. It counts the climatological months whose mean sits at or above a
 * growth threshold and locates the contiguous warm-season window.
 *
 * Two thresholds are conventional; the default is the lower, most widely used
 * one:
 *   - 5 °C ("biological zero"): the near-universal agrometeorological onset of
 *     vegetative growth for temperate plants, and the basis of the Nordic
 *     thermal-growing-season definition.
 *   - 10 °C: the Köppen warm-season / summer threshold (a month averaging ≥10 °C
 *     is a Köppen "warm" month), also near the cool limit of tree growth.
 * The threshold is configurable and always reported alongside the result.
 *
 * The warm-season *window* is the longest contiguous run of at-or-above-threshold
 * months around the year. The mean annual cycle is inherently cyclic (December
 * abuts January), so the run is found on the wrapped twelve-month sequence: a
 * southern-hemisphere or tropical warm season that straddles the year boundary
 * (…Nov, Dec, Jan…) is reported as one contiguous window, not two fragments.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The threshold is applied to the CLIMATOLOGICAL MONTHLY MEAN, not to daily
 *    temperatures. A month averaging above the threshold can still contain
 *    below-threshold days and vice versa, so this is a coarse monthly-mean analog
 *    of the thermal growing season — NOT the daily-mean WMO definition, a
 *    frost-free period, or a phenological growing season.
 *  - The monthly means are a mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; a short record shifts with the years it contains.
 *  - The warm-season count and window are reported only when all twelve calendar
 *    months are covered. A partial cycle would bias the count toward whichever
 *    season is present, so they are withheld and only the covered per-month flags
 *    are exposed — never a warm-season length over a part-year.
 *  - Values are approximate regional means at the sampled footprint and inherit
 *    the MERRA-2 reanalysis product's resolution and biases. Nothing here is a
 *    forecast, trend, external-baseline anomaly, attribution, or diagnosis.
 */

/** Calendar months in a year; a full cycle covers all twelve. */
const CALENDAR_MONTHS_IN_YEAR = 12;

/**
 * Default growth threshold in °C. 5 °C ("biological zero") is the most widely
 * used agrometeorological onset of vegetative growth; 10 °C (the Köppen
 * warm-month threshold) is the common alternative. Configurable via options.
 */
export const DEFAULT_WARM_SEASON_THRESHOLD_C = 5;

/** Honest scope limits shared by the warm-season descriptor. */
export const AIR_TEMPERATURE_WARM_SEASON_LIMITATIONS = [
  "The warm season here is the count and contiguous window of climatological months whose MEAN 2 m air temperature is at or above the growth threshold; the threshold is applied to the monthly mean, not to daily temperatures.",
  "This is a coarse monthly-mean analog of the thermal growing season, not the daily-mean WMO definition, a frost-free period, or a phenological growing season; a month averaging above the threshold may still contain below-threshold days.",
  "The monthly means are a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains.",
  "The warm-season count and window are reported only when all twelve calendar months are covered; a partial cycle exposes its per-month flags but no length, so a missing warm or cold month is never guessed.",
  "The window is the longest contiguous run of at-or-above-threshold months on the cyclic twelve-month sequence (December abuts January), so a warm season straddling the year boundary is reported as one window.",
  "Values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases; nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

export type AirTemperatureWarmSeasonStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

/**
 * Warm-season regime once a full cycle is in hand:
 *  - "year-round": every calendar month is at or above the threshold.
 *  - "seasonal": some but not all months are at or above the threshold.
 *  - "none": no calendar month reaches the threshold (too cold year-round).
 */
export type WarmSeasonRegime = "year-round" | "seasonal" | "none";

export interface AirTemperatureWarmSeasonOptions extends AirTemperatureAnnualCycleOptions {
  /** Growth threshold in °C; defaults to {@link DEFAULT_WARM_SEASON_THRESHOLD_C}. */
  thresholdC?: number;
}

/** One calendar month of the mean cycle flagged against the growth threshold. */
export interface WarmSeasonMonthFlag {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Climatological monthly-mean 2 m air temperature for this month, in kelvin. */
  meanKelvin: number;
  /** True when this month's mean is at or above the growth threshold. */
  atOrAboveThreshold: boolean;
}

/** The contiguous warm-season window of the mean cycle. */
export interface WarmSeasonWindow {
  /** First calendar month of the window (1–12). */
  startMonth: number;
  /** Last calendar month of the window (1–12); may precede startMonth if it wraps. */
  endMonth: number;
  /** Length of the window in whole months. */
  lengthMonths: number;
  /** True when the window straddles the December→January year boundary. */
  wrapsYearBoundary: boolean;
}

export interface AirTemperatureWarmSeason {
  kind: "air-temperature-warm-season";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AirTemperatureWarmSeasonStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the kelvin values reported here. */
  nativeUnit: string;
  /** Growth threshold this warm season is defined against, in °C. */
  thresholdC: number;
  /** {@link thresholdC} in kelvin (exact +273.15 K offset), the comparison value. */
  thresholdKelvin: number;
  /** How many of the twelve calendar months of the underlying cycle were covered. */
  calendarMonthsCovered: number;
  /** Count of observations that contributed to the underlying monthly means. */
  observationsUsed: number;
  /**
   * Number of calendar months whose mean is at or above the threshold, over the
   * full cycle. Null unless all twelve calendar months are covered.
   */
  monthsAtOrAboveThreshold: number | null;
  /**
   * The longest contiguous at-or-above-threshold window on the cyclic year, or
   * null when no month reaches the threshold (a "none" regime) or the cycle is
   * incomplete.
   */
  warmSeason: WarmSeasonWindow | null;
  /** Warm-season regime; null unless a full cycle is available. */
  regime: WarmSeasonRegime | null;
  /**
   * Per-calendar-month flags of the covered months, sorted January→December.
   * Present even for a partial cycle (which reports no length or window), so a
   * caller can see the months in hand without a whole-year count being implied.
   */
  monthlyFlags: WarmSeasonMonthFlag[];
  limitations: readonly string[];
  /** Short machine-readable reason when no warm-season length is reported; null when available. */
  reason: string | null;
}

/**
 * Derive the thermal warm-season length and window of the mean annual 2 m
 * air-temperature cycle from a supplied set of monthly observations. The
 * underlying mean annual cycle is built by
 * {@link describeAirTemperatureAnnualCycle}, which handles metric filtering,
 * publication and coverage checks, and per-calendar-month averaging; the
 * warm-season count and window are emitted only when that cycle covers all
 * twelve calendar months.
 */
export function describeAirTemperatureWarmSeason(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureWarmSeasonOptions = {}
): AirTemperatureWarmSeason {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );
  return warmSeasonFromCycle(cycle, options.thresholdC);
}

/**
 * Derive the warm season from an already-computed mean annual cycle. Exposed for
 * callers that have a cycle in hand and want to avoid recomputing it.
 */
export function warmSeasonFromCycle(
  cycle: AirTemperatureAnnualCycle,
  thresholdC: number = DEFAULT_WARM_SEASON_THRESHOLD_C
): AirTemperatureWarmSeason {
  const thresholdKelvin = thresholdC + KELVIN_TO_CELSIUS_OFFSET;

  const base = {
    kind: "air-temperature-warm-season" as const,
    isForecast: false as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    thresholdC,
    thresholdKelvin,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    observationsUsed: cycle.observationsUsed,
    limitations: AIR_TEMPERATURE_WARM_SEASON_LIMITATIONS,
  };

  // A non-finite threshold cannot classify anything; report it explicitly rather
  // than silently comparing against NaN.
  if (!Number.isFinite(thresholdC)) {
    return {
      ...base,
      status: "invalid",
      monthsAtOrAboveThreshold: null,
      warmSeason: null,
      regime: null,
      monthlyFlags: [],
      reason: "invalid-threshold",
    };
  }

  const monthlyFlags: WarmSeasonMonthFlag[] = cycle.monthlyClimatology.map(
    (entry) => ({
      calendarMonth: entry.calendarMonth,
      meanKelvin: entry.meanKelvin,
      atOrAboveThreshold: entry.meanKelvin >= thresholdKelvin,
    })
  );

  // Without a full twelve-month cycle, a warm-season count would be biased toward
  // the covered season, so it is withheld; the covered per-month flags are still
  // exposed. The cycle's own status and reason carry through.
  if (cycle.status !== "available") {
    return {
      ...base,
      status: cycle.status,
      monthsAtOrAboveThreshold: null,
      warmSeason: null,
      regime: null,
      monthlyFlags,
      reason: cycle.reason ?? "cycle-unavailable",
    };
  }

  // Full cycle: monthlyClimatology is the twelve months in calendar order, so the
  // flag at index i is calendar month i+1.
  const atOrAbove = monthlyFlags.map((flag) => flag.atOrAboveThreshold);
  const monthsAtOrAboveThreshold = atOrAbove.filter(Boolean).length;
  const regime: WarmSeasonRegime =
    monthsAtOrAboveThreshold === CALENDAR_MONTHS_IN_YEAR
      ? "year-round"
      : monthsAtOrAboveThreshold === 0
        ? "none"
        : "seasonal";

  return {
    ...base,
    status: "available",
    monthsAtOrAboveThreshold,
    warmSeason: longestWarmWindow(atOrAbove),
    regime,
    monthlyFlags,
    reason: null,
  };
}

/**
 * Longest contiguous at-or-above-threshold window on the cyclic twelve-month
 * sequence (index i is calendar month i+1; the array wraps December→January).
 * Returns null when no month reaches the threshold. When every month qualifies
 * the window spans the whole year (Jan→Dec, no wrap). Ties in length resolve to
 * the window with the earliest start month, so selection is deterministic.
 */
function longestWarmWindow(
  atOrAbove: readonly boolean[]
): WarmSeasonWindow | null {
  const n = atOrAbove.length;
  if (atOrAbove.every((value) => !value)) return null;
  if (atOrAbove.every((value) => value)) {
    return {
      startMonth: 1,
      endMonth: n,
      lengthMonths: n,
      wrapsYearBoundary: false,
    };
  }

  // At least one month is below threshold, so runs have well-defined starts (a
  // month whose cyclic predecessor is below threshold). Scanning start months in
  // ascending order and replacing only on a strictly longer run keeps the
  // earliest-start window on ties.
  let best: WarmSeasonWindow | null = null;
  for (let i = 0; i < n; i++) {
    const predecessor = atOrAbove[(i - 1 + n) % n];
    if (!atOrAbove[i] || predecessor) continue;

    let length = 0;
    while (atOrAbove[(i + length) % n]) length += 1;
    const endIndex = (i + length - 1) % n;
    if (best === null || length > best.lengthMonths) {
      best = {
        startMonth: i + 1,
        endMonth: endIndex + 1,
        lengthMonths: length,
        wrapsYearBoundary: endIndex < i,
      };
    }
  }
  return best;
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

/**
 * A compact, honest readout of the thermal warm season. Emphasizes that the
 * threshold is applied to climatological monthly means over a short record — a
 * coarse analog of the growing season, not a daily-mean or frost-free definition.
 */
export function formatAirTemperatureWarmSeason(
  profile: AirTemperatureWarmSeason
): string {
  const source = `${profile.source.shortName} v${profile.source.version}`;
  const threshold = `${formatNumber(profile.thresholdC)} °C`;
  if (
    profile.status !== "available" ||
    profile.monthsAtOrAboveThreshold === null ||
    profile.regime === null
  ) {
    return `No thermal warm season at or above ${threshold} (${profile.reason ?? "unavailable"}; ${profile.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered); source ${source}`;
  }

  const count = profile.monthsAtOrAboveThreshold;
  if (profile.regime === "none") {
    return `No month's mean 2 m air temperature reaches ${threshold} (thermal warm season absent over ${profile.observationsUsed} usable observations, a mean annual cycle, not a climate normal); source ${source}`;
  }
  if (profile.regime === "year-round" || profile.warmSeason === null) {
    return `Thermal warm season year-round: all ${CALENDAR_MONTHS_IN_YEAR} climatological months average at or above ${threshold}; monthly-mean analog over ${profile.observationsUsed} usable observations, not a daily-mean or frost-free growing season; source ${source}`;
  }

  const window = profile.warmSeason;
  const start = MONTH_ABBREVIATIONS[window.startMonth - 1];
  const end = MONTH_ABBREVIATIONS[window.endMonth - 1];
  const wrap = window.wrapsYearBoundary ? ", across the year boundary" : "";
  return `Thermal warm season ${count}/${CALENDAR_MONTHS_IN_YEAR} months at or above ${threshold}; longest window ${window.lengthMonths} months (${start}–${end}${wrap}); monthly-mean analog over ${profile.observationsUsed} usable observations, not a daily-mean or frost-free growing season; source ${source}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
