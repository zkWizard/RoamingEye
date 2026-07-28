import {
  describeAirTemperatureAnnualCycle,
  type AirTemperatureAnnualCycleExclusions,
  type AirTemperatureAnnualCycleOptions,
} from "./airTemperatureSeasonalCycle";
import type { ClimateMetric, MonthlyClimateObservation } from "./climate";
import { MONTH_NAMES, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Warming-limb / cooling-limb asymmetry of the mean 2 m air-temperature annual
 * cycle — the temporal companion to {@link describeAirTemperatureAnnualCycle}
 * (which reports the peak-to-trough amplitude) and the annual-harmonic
 * seasonal-phase descriptor (which reports the fitted phase of the annual
 * maximum).
 *
 * The mean annual cycle already resolves the warmest and coldest climatological
 * calendar months. Those two months split the 12-month circle into two
 * complementary arcs: the forward span from the coldest month to the warmest
 * month (the seasonal *warming* limb) and the forward span from the warmest
 * month back to the coldest month (the *cooling* limb). The two arcs always sum
 * to twelve. A cycle that warms slowly and cools quickly — the maritime thermal-
 * lag signature, where a late-summer peak leaves a short autumn descent — has a
 * long warming arc and a short cooling one; a continental interior tends nearer
 * an even 6/6 split. This helper reports each arc length in whole calendar
 * months, which limb spans more of the year, and the mean rate of change across
 * each limb (the shared peak-to-trough amplitude divided by that limb's month
 * count).
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - The arcs are the circular calendar separation between the two
 *    climatological extrema; they are whole-month counts, not phenophase dates,
 *    onset detection, or a sub-monthly timing. They say nothing about the
 *    monotonicity of the unobserved within-limb march.
 *  - The mean limb rate is the peak-to-trough amplitude divided by that limb's
 *    whole-month length: an average slope across the limb, NOT an observed month-
 *    to-month rate and NOT a maximum warming/cooling rate. Because both limbs
 *    share the same amplitude, the rate asymmetry is fully implied by the arc-
 *    length asymmetry; the rates are provided only as an interpretable readout.
 *  - A kelvin difference is numerically the same figure in °C, so the amplitude
 *    and the rates need no unit conversion.
 *  - Everything rests on the mean annual cycle over the SUPPLIED years only, not
 *    a 30-year climate normal; values are approximate regional means at the
 *    sampled footprint and inherit the MERRA-2 reanalysis resolution and biases.
 *    Nothing here is a forecast, trend, external-baseline anomaly, attribution,
 *    or diagnosis.
 *
 * All per-calendar-month averaging across years, coverage filtering, year-month
 * deduplication, metric gating, and the minimum-years-per-month floor are
 * delegated to {@link describeAirTemperatureAnnualCycle}, so a precipitation or
 * soil-moisture value can never leak into a temperature limb and provenance is
 * preserved.
 *
 * Pure, render-free logic (see airTemperatureSeasonalCycleAsymmetry.test.ts).
 */

const FULL_YEAR_MONTHS = 12;

/**
 * Which of the two complementary arcs spans more of the calendar year.
 * "warming" is the forward interval from the coldest to the warmest
 * climatological month; "cooling" is its complement; "balanced" is an even 6/6
 * split.
 */
export type AirTemperatureDominantLimb = "warming" | "cooling" | "balanced";

/**
 * "available" when the full mean annual cycle exists and its warmest and coldest
 * months differ; "insufficient-monthly-coverage" when the underlying cycle did
 * not cover all twelve calendar months (so it has no full-cycle extrema);
 * "no-usable-observations" when nothing cleared the coverage floors; "flat" when
 * the warmest and coldest climatological months coincide, leaving no limb to
 * split; "invalid" for a bad configuration.
 */
export type AirTemperatureCycleAsymmetryStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "flat"
  | "invalid";

export interface AirTemperatureCycleAsymmetrySummary {
  kind: "derived-air-temperature-seasonal-cycle-asymmetry";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-air-temperature-only";
  status: AirTemperatureCycleAsymmetryStatus;
  /** Cited MERRA-2 2 m air-temperature product; provenance is preserved. */
  metric: ClimateMetric;
  source: DatasetRef;
  /** Native unit of the amplitude and per-limb rate values. */
  nativeUnit: string;
  /**
   * Forward calendar months from the coldest climatological month to the warmest
   * (the warming limb), wrapping across year end (1..11). Null unless a full
   * cycle with distinct extrema is available.
   */
  warmingArcMonths: number | null;
  /**
   * Forward calendar months from the warmest climatological month back to the
   * coldest (the cooling limb); the complement of {@link warmingArcMonths}
   * (1..11). Together they sum to twelve.
   */
  coolingArcMonths: number | null;
  /**
   * |warmingArcMonths − coolingArcMonths|: how lopsided the split is, in whole
   * months. 0 for an even 6/6 split, up to 10 for the most lopsided cycle.
   */
  asymmetryMonths: number | null;
  /** Which limb spans more of the year, or "balanced" for an even split. */
  dominantLimb: AirTemperatureDominantLimb | null;
  /**
   * Peak-to-trough amplitude of the mean annual cycle (warmest-month mean minus
   * coldest-month mean), in kelvin (equivalently °C for a difference). Echoed
   * from the underlying cycle for auditability. Null without a full cycle.
   */
  amplitudeKelvin: number | null;
  /**
   * Mean warming rate across the warming limb: {@link amplitudeKelvin} divided
   * by {@link warmingArcMonths}, in kelvin per month. An average slope across the
   * limb, not an observed month-to-month or peak rate. Null without a full cycle.
   */
  meanWarmingRateKelvinPerMonth: number | null;
  /**
   * Mean cooling rate across the cooling limb: {@link amplitudeKelvin} divided by
   * {@link coolingArcMonths}, in kelvin per month. Reported as a magnitude (the
   * limb descends, but the value is non-negative). Null without a full cycle.
   */
  meanCoolingRateKelvinPerMonth: number | null;
  /** Calendar month (1..12) of the warmest climatological month; echoed. */
  warmestMonth: number | null;
  /** Calendar month (1..12) of the coldest climatological month; echoed. */
  coldestMonth: number | null;
  /** Short English name of {@link warmestMonth}, or null when unavailable. */
  warmestMonthName: string | null;
  /** Short English name of {@link coldestMonth}, or null when unavailable. */
  coldestMonthName: string | null;
  /** How many of the twelve calendar months met the years-per-month floor. */
  calendarMonthsCovered: number;
  /** Forwarded from the underlying climatology for auditability. */
  exclusions: AirTemperatureAnnualCycleExclusions;
  limitations: typeof AIR_TEMPERATURE_CYCLE_ASYMMETRY_LIMITATIONS;
  /** Short machine-readable reason when no limbs are reported. */
  reason: string | null;
}

export const AIR_TEMPERATURE_CYCLE_ASYMMETRY_LIMITATIONS = [
  "The warming and cooling arcs are the circular calendar separation between the coldest and warmest climatological months in whole months; they are not phenophase dates, onset detection, or a sub-monthly timing, and imply nothing about the monotonicity of the unobserved within-limb march.",
  "The mean limb rate is the peak-to-trough amplitude divided by that limb's whole-month length — an average slope across the limb, not an observed month-to-month rate or a maximum warming/cooling rate; because both limbs share one amplitude, the rate asymmetry is fully implied by the arc-length asymmetry.",
  "Amplitude and the per-limb rates are in kelvin (the same figure in °C for a difference); values are approximate regional means at the sampled footprint and inherit the MERRA-2 reanalysis resolution and biases.",
  "Everything rests on the mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts the extrema with the years it happens to contain. Nothing here is a forecast, trend, external-baseline anomaly, attribution, or diagnosis.",
] as const;

/**
 * Partition the mean 2 m air-temperature annual cycle between its warming and
 * cooling limbs.
 *
 * Reuses the already-validated extrema, cited MERRA-2 provenance, exclusions,
 * and coverage bookkeeping from {@link describeAirTemperatureAnnualCycle}; it
 * re-derives nothing and drops no dataset reference. A cycle that does not cover
 * all twelve calendar months carries no limbs (its full-cycle extrema are
 * withheld upstream), and a cycle whose warmest and coldest months coincide is
 * reported as flat rather than as a spurious zero-length or full-year arc.
 */
export function describeAirTemperatureSeasonalCycleAsymmetry(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: AirTemperatureAnnualCycleOptions = {}
): AirTemperatureCycleAsymmetrySummary {
  const cycle = describeAirTemperatureAnnualCycle(
    observations,
    availableThrough,
    options
  );

  const base = {
    kind: "derived-air-temperature-seasonal-cycle-asymmetry" as const,
    isForecast: false as const,
    claimScope: "descriptive-air-temperature-only" as const,
    metric: cycle.metric,
    source: cycle.source,
    nativeUnit: cycle.nativeUnit,
    calendarMonthsCovered: cycle.calendarMonthsCovered,
    exclusions: cycle.exclusions,
    limitations: AIR_TEMPERATURE_CYCLE_ASYMMETRY_LIMITATIONS,
  };
  const empty = {
    warmingArcMonths: null,
    coolingArcMonths: null,
    asymmetryMonths: null,
    dominantLimb: null,
    amplitudeKelvin: null,
    meanWarmingRateKelvinPerMonth: null,
    meanCoolingRateKelvinPerMonth: null,
    warmestMonth: null,
    coldestMonth: null,
    warmestMonthName: null,
    coldestMonthName: null,
  };

  if (cycle.status === "invalid") {
    return { ...base, ...empty, status: "invalid", reason: cycle.reason };
  }
  if (cycle.status === "no-usable-observations") {
    return {
      ...base,
      ...empty,
      status: "no-usable-observations",
      reason: cycle.reason,
    };
  }
  if (
    cycle.status === "insufficient-monthly-coverage" ||
    cycle.warmestMonth === null ||
    cycle.coldestMonth === null ||
    cycle.amplitudeKelvin === null
  ) {
    return {
      ...base,
      ...empty,
      status: "insufficient-monthly-coverage",
      reason: cycle.reason ?? "not-all-calendar-months-covered",
    };
  }

  const warmestMonth = cycle.warmestMonth.calendarMonth;
  const coldestMonth = cycle.coldestMonth.calendarMonth;
  const echoed = {
    warmestMonth,
    coldestMonth,
    warmestMonthName: MONTH_NAMES[warmestMonth - 1],
    coldestMonthName: MONTH_NAMES[coldestMonth - 1],
    amplitudeKelvin: cycle.amplitudeKelvin,
  };

  const warmingArcMonths = forwardMonthDistance(coldestMonth, warmestMonth);
  if (warmingArcMonths === 0) {
    // Warmest and coldest climatological months coincide: no limb to split.
    // With a full twelve-month cycle this means an essentially flat climatology
    // whose argmax and argmin resolved to the same month.
    return {
      ...base,
      ...empty,
      ...echoed,
      meanWarmingRateKelvinPerMonth: null,
      meanCoolingRateKelvinPerMonth: null,
      status: "flat",
      reason: "no-within-year-temperature-range",
    };
  }

  const coolingArcMonths = FULL_YEAR_MONTHS - warmingArcMonths;
  return {
    ...base,
    ...echoed,
    status: "available",
    warmingArcMonths,
    coolingArcMonths,
    asymmetryMonths: Math.abs(warmingArcMonths - coolingArcMonths),
    dominantLimb: dominantLimbFor(warmingArcMonths, coolingArcMonths),
    meanWarmingRateKelvinPerMonth: cycle.amplitudeKelvin / warmingArcMonths,
    meanCoolingRateKelvinPerMonth: cycle.amplitudeKelvin / coolingArcMonths,
    reason: null,
  };
}

/**
 * A compact, honest readout of the limb asymmetry. Emphasizes that the arcs are
 * whole-month calendar spans and the rates are mean limb slopes over a short
 * record, not observed per-month rates or a climate normal.
 */
export function formatAirTemperatureCycleAsymmetry(
  summary: AirTemperatureCycleAsymmetrySummary
): string {
  const source = `${summary.source.shortName} v${summary.source.version}`;
  if (
    summary.status !== "available" ||
    summary.warmingArcMonths === null ||
    summary.coolingArcMonths === null ||
    summary.meanWarmingRateKelvinPerMonth === null ||
    summary.meanCoolingRateKelvinPerMonth === null
  ) {
    return `No 2 m air-temperature seasonal-cycle asymmetry (${summary.reason ?? "unavailable"}; ${summary.calendarMonthsCovered}/${FULL_YEAR_MONTHS} calendar months covered); source ${source}`;
  }
  const cold = summary.coldestMonthName;
  const warm = summary.warmestMonthName;
  const warmRate = formatNumber(summary.meanWarmingRateKelvinPerMonth);
  const coolRate = formatNumber(summary.meanCoolingRateKelvinPerMonth);
  const dominant =
    summary.dominantLimb === "balanced"
      ? "even split"
      : `longer ${summary.dominantLimb} limb`;
  return `Mean 2 m air-temperature cycle: warming ${cold}→${warm} over ${summary.warmingArcMonths} mo (${warmRate} K/mo), cooling over ${summary.coolingArcMonths} mo (${coolRate} K/mo); ${dominant}, mean limb slopes over supplied years, not a climate normal; source ${source}`;
}

/**
 * Forward circular distance in whole months from calendar month `from` to `to`
 * (both 1..12), wrapping across December. Returns 0 when the months are equal.
 */
function forwardMonthDistance(from: number, to: number): number {
  return (
    (((to - from) % FULL_YEAR_MONTHS) + FULL_YEAR_MONTHS) % FULL_YEAR_MONTHS
  );
}

function dominantLimbFor(
  warmingArcMonths: number,
  coolingArcMonths: number
): AirTemperatureDominantLimb {
  if (warmingArcMonths > coolingArcMonths) return "warming";
  if (coolingArcMonths > warmingArcMonths) return "cooling";
  return "balanced";
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}
