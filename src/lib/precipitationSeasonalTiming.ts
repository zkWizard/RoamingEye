import { neumaierSum } from "./numerics";
import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  MONTH_NAMES,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Describe *when in the year* a place's precipitation concentrates — the timing
 * companion to precipitationConcentrationIndex.ts, which measures only *how*
 * concentrated the water was, not *when* it arrived.
 *
 * Calendar months are circular (December is adjacent to January), so a "typical
 * month" of the annual water supply cannot be found with ordinary arithmetic: a
 * December-heavy and a January-heavy year do not average to July. Following
 * Markham (1970, "Seasonality of Precipitation in the United States"), this
 * helper places each calendar month on the unit circle at its mid-month angle
 * and takes the precipitation-weighted mean resultant vector over one complete
 * annual cycle. The vector's direction gives a centroid month — the calendar
 * position the year's water balances around — and its length R in [0, 1]
 * measures how peaked that timing is (R near 1: the water piles toward one part
 * of the year; R near 0: it is spread evenly around the calendar and no centroid
 * is meaningfully defined).
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - This is a descriptive circular mean of observed monthly water, NOT a wet-
 *    season onset/retreat date, monsoon detector, climatological normal,
 *    anomaly, drought signal, runoff, water-balance, causation, or forecast. A
 *    monthly accumulation total is not a storm, and a centroid month is not an
 *    event date.
 *  - The resultant length R is a companion *concentration* measure to the PCI;
 *    when R is small the centroid direction is weakly defined, so callers should
 *    read `concentration` alongside `centroidMonth` rather than in isolation.
 *  - Months are equal 30° angular bins placed at their mid-month; differing
 *    month lengths are not re-weighted (the accumulation total already carries
 *    each month's integrated depth). Timing is reported at whole-month
 *    resolution — never a day-of-year the monthly data cannot support.
 *  - It requires an unbroken, single-source run of exactly twelve usable months
 *    (one full annual cycle, so every calendar month is represented once) and a
 *    positive total; a gap, overlap, mixed source, wrong length, or bone-dry
 *    (zero-total) year yields `null` rather than a guessed centroid.
 */

/** A meaningful centroid needs one complete annual cycle of usable months. */
export const PRECIP_SEASONAL_TIMING_MONTHS = 12;

const RADIANS_PER_MONTH = (2 * Math.PI) / PRECIP_SEASONAL_TIMING_MONTHS;
const DEGREES_PER_MONTH = 360 / PRECIP_SEASONAL_TIMING_MONTHS;

/**
 * Below this resultant length the water is spread so evenly around the calendar
 * that the mean direction is numerically undefined; `centroidMonth` is withheld
 * rather than reported as a spurious month.
 */
const RESULTANT_EPSILON = 1e-9;

/** Honest scope limits for the derived precipitation-timing descriptor. */
export const PRECIP_SEASONAL_TIMING_LIMITATIONS =
  "The precipitation seasonal timing is the precipitation-weighted circular " +
  "mean (Markham 1970) of an unbroken, single-source run of exactly twelve " +
  "usable GLDAS monthly precipitation accumulations — one complete annual " +
  "cycle. Each calendar month is a 30° bin at its mid-month; the resultant " +
  "direction gives the centroid month the year's water balances around and the " +
  "resultant length R in [0, 1] gives how peaked that timing is (R near 0 " +
  "means no preferred timing, so the centroid is withheld). It describes only " +
  "the observed distribution in time: it is not a wet-season onset date, " +
  "monsoon detector, climatological normal, anomaly, drought index, runoff " +
  "estimate, or forecast, and timing is stated at whole-month resolution only. " +
  "It requires a positive total and a complete twelve-month cycle — a gap, " +
  "overlap, mixed source, wrong length, or dry (zero-total) year yields no " +
  "timing rather than a guess. It inherits the land-model product's resolution " +
  "and biases.";

export interface PrecipitationSeasonalTiming {
  kind: "derived-precip-seasonal-timing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Resultant vector phase in degrees [0, 360), measured from the Dec/Jan year
   * boundary (0° = start of January, 90° = start of April, …). `null` when the
   * resultant is too short to define a direction.
   */
  phaseDegrees: number | null;
  /**
   * Centroid position on the calendar as a continuous month in (0.5, 12.5]:
   * 1.0 = mid-January, 6.5 = end of June / start of July. `null` when the
   * resultant is too short to define a direction.
   */
  centroidMonth: number | null;
  /**
   * Whole calendar month (1..12) nearest the centroid, or `null` when no
   * direction is defined. December (12) and January (1) are treated as
   * adjacent, so the nearest month is always in range.
   */
  centroidCalendarMonth: number | null;
  /** Short English name of `centroidCalendarMonth`, or `null` when undefined. */
  centroidMonthName: string | null;
  /**
   * Mean resultant length R in [0, 1]: 0 = water spread evenly around the
   * calendar (no preferred timing), 1 = all water directed at a single month.
   * A companion concentration measure to the PCI; always reported even when the
   * centroid direction itself is withheld.
   */
  concentration: number;
  /** First (oldest) month of the annual cycle. */
  startMonth: YearMonth;
  /** Last (newest) month of the annual cycle. */
  endMonth: YearMonth;
  /** Always {@link PRECIP_SEASONAL_TIMING_MONTHS} — a complete annual cycle. */
  monthCount: number;
  /** Window total the timing is weighted by, in mm water-equivalent. */
  totalMm: number;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Compute the precipitation-weighted seasonal-timing centroid for one annual
 * cycle of usable monthly precipitation accumulations.
 *
 * Inputs may be supplied in any order; they are ordered internally. Returns
 * `null` — never a fabricated or partial centroid — unless the months form a
 * strictly consecutive run of exactly twelve months (no gap, no
 * duplicate/overlapping month) from a single cited dataset *and* the window
 * total is positive. A zero-total (bone-dry) year is a real observation, but the
 * weighted vector is undefined there, so this reports `null` rather than
 * inventing a centroid. Mirrors the null contract of
 * precipitationConcentrationIndex.ts.
 */
export function precipitationSeasonalTiming(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationSeasonalTiming | null {
  if (accumulations.length !== PRECIP_SEASONAL_TIMING_MONTHS) return null;

  // Order oldest → newest without mutating the caller's array; ordering makes
  // the consecutive-run check well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;
  const cosTerms: number[] = [];
  const sinTerms: number[] = [];
  const totals: number[] = [];

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];

    // Every month must cite the same product; a centroid cannot mix provenance.
    if (!sameDataset(entry.source, source)) return null;

    // Guard each monthly total so a corrupt input never yields a
    // plausible-looking but meaningless centroid.
    if (!Number.isFinite(entry.totalMm) || entry.totalMm < 0) return null;

    if (i > 0) {
      const gap =
        ymToIndex(entry.dataMonth) - ymToIndex(ordered[i - 1].dataMonth);
      // gap === 0 → duplicate/overlapping month; gap > 1 → a missing month.
      if (gap !== 1) return null;
    }

    // Place each calendar month at its mid-month angle (Jan → 15°, Dec → 345°).
    const angle = RADIANS_PER_MONTH * (entry.dataMonth.month - 0.5);
    cosTerms.push(entry.totalMm * Math.cos(angle));
    sinTerms.push(entry.totalMm * Math.sin(angle));
    totals.push(entry.totalMm);
  }

  const totalMm = neumaierSum(totals);
  // The weighted resultant is normalized by the total; a bone-dry year makes it
  // 0/0, so no timing can be stated.
  if (totalMm <= 0) return null;

  const cosSum = neumaierSum(cosTerms);
  const sinSum = neumaierSum(sinTerms);
  const resultant = Math.hypot(cosSum, sinSum);
  const concentration = clamp01(resultant / totalMm);

  const monthCount = ordered.length;
  const base: Omit<
    PrecipitationSeasonalTiming,
    | "phaseDegrees"
    | "centroidMonth"
    | "centroidCalendarMonth"
    | "centroidMonthName"
  > = {
    kind: "derived-precip-seasonal-timing",
    isForecast: false,
    concentration,
    startMonth: ordered[0].dataMonth,
    endMonth: ordered[monthCount - 1].dataMonth,
    monthCount,
    totalMm,
    source,
  };

  // Water spread so evenly that the resultant vanishes has no preferred timing;
  // report the (near-zero) concentration but withhold a spurious direction.
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

  // Mean direction, normalized to [0, 360).
  const phaseRadians = Math.atan2(sinSum, cosSum);
  const phaseDegrees = ((phaseRadians * 180) / Math.PI + 360) % 360;

  // Invert the mid-month placement: month m sat at DEGREES_PER_MONTH·(m − 0.5),
  // so the continuous centroid month is phase/DEGREES_PER_MONTH + 0.5, wrapped
  // into (0.5, 12.5].
  let centroidMonth = phaseDegrees / DEGREES_PER_MONTH + 0.5;
  if (centroidMonth <= 0.5) centroidMonth += PRECIP_SEASONAL_TIMING_MONTHS;

  const centroidCalendarMonth = wrapCalendarMonth(Math.round(centroidMonth));

  return {
    ...base,
    phaseDegrees,
    centroidMonth,
    centroidCalendarMonth,
    centroidMonthName: MONTH_NAMES[centroidCalendarMonth - 1],
  };
}

/** Clamp a value to [0, 1], guarding tiny floating-point overshoots. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Map a rounded month value onto 1..12, treating December and January as adjacent. */
function wrapCalendarMonth(month: number): number {
  return ((month - 1) % PRECIP_SEASONAL_TIMING_MONTHS) + 1;
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
