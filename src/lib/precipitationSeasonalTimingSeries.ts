import {
  summarizeMonthlyClimate,
  type MonthlyClimateObservation,
} from "./climate";
import { neumaierSum } from "./numerics";
import {
  precipitationAccumulation,
  type PrecipitationAccumulation,
} from "./precipitationAccumulation";
import { MINIMUM_PRECIP_ANNUAL_CYCLE_VALID_FRACTION } from "./precipitationAnnualCycle";
import {
  clampResultantToUnit,
  precipitationSeasonalCentroid,
  precipitationSeasonalTiming,
  PRECIP_SEASONAL_TIMING_MONTHS,
} from "./precipitationSeasonalTiming";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Pool the single-year Markham seasonal-timing vectors of a multi-year monthly
 * precipitation record into one timing statement for the whole record.
 *
 * `precipitationSeasonalTiming.ts` deliberately answers for exactly ONE annual
 * cycle: it rejects any input that is not an unbroken twelve-month run, so a
 * two-decade probe series cannot be handed to it at all. That contract is right
 * — a centroid mixing two calendar positions of the same month is meaningless —
 * but it left the module unreachable from every surface the app actually has,
 * because no surface holds a single tidy year.
 *
 * This aggregator supplies the missing step and nothing else: split the record
 * into complete calendar years, ask the audited helper for each year's
 * precipitation-weighted resultant vector, and add those vectors. Summing the
 * per-year vectors and normalizing by the summed water is exactly the circular
 * mean over the pooled record, with each year contributing in proportion to the
 * water it actually carried — the intended weighting for a question about where
 * a place's water sits in the calendar.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - Only complete calendar years count. A partial year at either end of the
 *    record is dropped entirely rather than folded in, because an incomplete
 *    year over-weights whichever calendar months it happens to contain and
 *    would drag the pooled centroid toward them.
 *  - A year the single-cycle helper rejects (a gap, a duplicate month, mixed
 *    provenance, or a bone-dry total) is skipped, never patched. `yearsUsed`
 *    reports how many survived, so callers can state the real support.
 *  - A year with no defined direction (water spread evenly enough that its
 *    resultant vanishes) still contributes its water to the denominator while
 *    contributing no direction. That is the correct treatment: the water is
 *    real and genuinely has no preferred month, so it should dilute the pooled
 *    concentration rather than be discarded.
 *  - This stays a description of observed timing. It is not a wet-season onset
 *    date, monsoon index, climatological normal, anomaly, drought signal,
 *    runoff, water-balance closure, trend, attribution, or forecast, and a
 *    centroid month is not an event date.
 */

/**
 * Complete calendar years required before a pooled timing is stated. Matches the
 * per-calendar-month floor the mean annual cycle already applies, so the two
 * precipitation readings rest on comparable evidence.
 */
export const MINIMUM_PRECIP_SEASONAL_TIMING_YEARS = 3;

/**
 * Below this pooled resultant length the mean direction is numerically
 * undefined. Mirrors the single-cycle helper's own epsilon.
 */
const RESULTANT_EPSILON = 1e-9;

/** Honest scope limits for the pooled multi-year timing. */
export const PRECIP_SEASONAL_TIMING_SERIES_LIMITATIONS =
  "The pooled precipitation timing adds the precipitation-weighted resultant " +
  "vectors (Markham 1970) of every complete calendar year in the record and " +
  "normalizes by the pooled water, so each year counts in proportion to the " +
  "water it carried. Only whole calendar years are used: a partial year at " +
  "either end, a year with a missing or duplicated month, a year mixing " +
  "products, and a bone-dry year are excluded rather than patched. The " +
  "resultant length R in [0, 1] states how strongly the record's water " +
  "concentrates in one part of the calendar (R near 0 means no preferred " +
  "timing, so the centroid month is withheld). It describes observed timing " +
  "only: it is not a wet-season onset date, monsoon index, climate normal, " +
  "anomaly, drought index, runoff estimate, trend, or forecast, and timing is " +
  "stated at whole-month resolution. It inherits the land-model product's " +
  "resolution and biases.";

export interface PrecipitationSeasonalTimingSeries {
  kind: "derived-precip-seasonal-timing-series";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Pooled resultant phase in degrees [0, 360) from the Dec/Jan boundary, or
   * `null` when the pooled resultant is too short to define a direction.
   */
  phaseDegrees: number | null;
  /** Pooled centroid as a continuous month in (0.5, 12.5], or `null`. */
  centroidMonth: number | null;
  /** Whole calendar month (1..12) nearest the pooled centroid, or `null`. */
  centroidCalendarMonth: number | null;
  /** Short English name of `centroidCalendarMonth`, or `null` when undefined. */
  centroidMonthName: string | null;
  /**
   * Pooled mean resultant length R in [0, 1]: 0 = the record's water is spread
   * evenly around the calendar, 1 = it all arrives in one month. Always
   * reported, including when the centroid direction itself is withheld.
   */
  concentration: number;
  /** Complete calendar years that survived every guard and were pooled. */
  yearsUsed: number;
  /** Oldest pooled calendar year. */
  firstYear: number;
  /** Newest pooled calendar year. */
  lastYear: number;
  /** Pooled water the timing is weighted by, in mm water-equivalent. */
  totalMm: number;
  /** Single cited product shared by every pooled year; provenance preserved. */
  source: DatasetRef;
}

export interface PrecipitationSeasonalTimingSeriesOptions {
  /** Override the complete-calendar-year floor. */
  minimumYears?: number;
  /** Override the per-month usable-coverage floor. */
  minimumValidFraction?: number;
}

/**
 * Describe the pooled seasonal timing of a multi-year monthly precipitation
 * record, or `null` when the record cannot support one.
 *
 * `observations` carry the metric's native rate and are validated and integrated
 * to monthly depths through the same audited path the mean annual cycle uses, so
 * a month this accepts is a month that reading accepts too. `availableThrough`
 * is the publication frontier: a month the product has not released yet is
 * excluded rather than read as missing water.
 */
export function describePrecipitationSeasonalTimingSeries(
  observations: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: PrecipitationSeasonalTimingSeriesOptions = {}
): PrecipitationSeasonalTimingSeries | null {
  const requiredYears =
    options.minimumYears ?? MINIMUM_PRECIP_SEASONAL_TIMING_YEARS;
  const requiredValidFraction =
    options.minimumValidFraction ?? MINIMUM_PRECIP_ANNUAL_CYCLE_VALID_FRACTION;
  if (!Number.isInteger(requiredYears) || requiredYears <= 0) return null;
  if (
    !Number.isFinite(requiredValidFraction) ||
    requiredValidFraction < 0 ||
    requiredValidFraction > 1
  ) {
    return null;
  }

  // Bucket usable monthly depths by calendar year.
  const years = new Map<number, PrecipitationAccumulation[]>();
  for (const observation of observations) {
    if (observation.metricId !== "precipitation-rate") continue;

    const summary = summarizeMonthlyClimate(observation, availableThrough);
    if (summary.publicationStatus !== "published") continue;
    if (summary.coverage.status !== "available") continue;
    if (
      summary.coverage.validFraction !== null &&
      summary.coverage.validFraction < requiredValidFraction
    ) {
      continue;
    }

    const accumulation = precipitationAccumulation(summary);
    if (accumulation === null || !Number.isFinite(accumulation.totalMm)) {
      continue;
    }

    const bucket = years.get(accumulation.dataMonth.year) ?? [];
    bucket.push(accumulation);
    years.set(accumulation.dataMonth.year, bucket);
  }

  const cosTerms: number[] = [];
  const sinTerms: number[] = [];
  const totals: number[] = [];
  const pooledYears: number[] = [];
  let source: DatasetRef | null = null;

  const orderedYears = [...years.entries()].sort((a, b) => a[0] - b[0]);
  for (const [year, bucket] of orderedYears) {
    // Only a complete calendar year can be handed to the single-cycle helper;
    // it rejects everything else, which is exactly the guard wanted here.
    if (bucket.length !== PRECIP_SEASONAL_TIMING_MONTHS) continue;
    const timing = precipitationSeasonalTiming(bucket);
    if (timing === null) continue;

    // Every pooled year must cite the same product; a pooled centroid cannot
    // mix provenance any more than a single year's can.
    if (source === null) source = timing.source;
    else if (!sameDataset(timing.source, source)) continue;

    totals.push(timing.totalMm);
    pooledYears.push(year);

    // Rebuild this year's resultant vector: the helper reports its length
    // normalized by that year's own water, so length = concentration x totalMm.
    // A year with no direction contributes no vector while its water still
    // counts above, diluting the pooled concentration exactly as it should.
    if (timing.phaseDegrees === null) continue;
    const radians = (timing.phaseDegrees * Math.PI) / 180;
    const length = timing.concentration * timing.totalMm;
    cosTerms.push(length * Math.cos(radians));
    sinTerms.push(length * Math.sin(radians));
  }

  if (source === null) return null;
  if (pooledYears.length < requiredYears) return null;

  const totalMm = neumaierSum(totals);
  if (!(totalMm > 0)) return null;

  const cosSum = neumaierSum(cosTerms);
  const sinSum = neumaierSum(sinTerms);
  const resultant = Math.hypot(cosSum, sinSum);
  const concentration = clampResultantToUnit(resultant / totalMm);

  const base = {
    kind: "derived-precip-seasonal-timing-series" as const,
    isForecast: false as const,
    concentration,
    yearsUsed: pooledYears.length,
    firstYear: pooledYears[0],
    lastYear: pooledYears[pooledYears.length - 1],
    totalMm,
    source,
  };

  // Water spread evenly enough that the pooled resultant vanishes has no
  // preferred timing; report the (near-zero) concentration but withhold a
  // spurious direction, mirroring the single-cycle helper.
  if (
    resultant <= RESULTANT_EPSILON * totalMm ||
    resultant <= RESULTANT_EPSILON
  ) {
    return {
      ...base,
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
    };
  }

  const phaseRadians = Math.atan2(sinSum, cosSum);
  const phaseDegrees = ((phaseRadians * 180) / Math.PI + 360) % 360;
  return { ...base, ...precipitationSeasonalCentroid(phaseDegrees) };
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
