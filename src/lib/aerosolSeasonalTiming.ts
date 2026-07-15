import { neumaierSum } from "./numerics";
import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  summarizeAerosolLoading,
  type AerosolObservation,
} from "./aerosolLoading";
import { MONTH_NAMES, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Describe *when in the year* a place's column aerosol loading concentrates — the
 * timing companion to the same-place aerosol descriptors, which measure the level
 * of loading (`aerosolLoading`), its same-month anomaly (`aerosolSeasonalBaseline`),
 * or its month-over-month change, but never the calendar position the haze, dust,
 * or biomass-burning season balances around.
 *
 * Calendar months are circular (December is adjacent to January), so a "typical
 * month" of the year's column optical loading cannot be found with ordinary
 * arithmetic: a December-heavy and a January-heavy cycle do not average to July.
 * Following Markham (1970, "Seasonality of Precipitation in the United States"),
 * this helper first builds the mean annual cycle — averaging each calendar month
 * over its distinct usable years — then places each calendar month on the unit
 * circle at its mid-month angle and takes the mean-AOD-weighted resultant vector
 * over the complete twelve-month cycle. The vector's direction gives a centroid
 * month — the calendar position the year's column loading is optically
 * concentrated around — and its length R in [0, 1] measures how peaked that
 * timing is (R near 1: loading piles toward one part of the year, a strong dust
 * or smoke season; R near 0: loading is spread evenly around the calendar and no
 * centroid is meaningfully defined).
 *
 * Because column AOD is strictly non-negative, this value-weighted first
 * trigonometric moment is well-defined for it exactly as it is for a
 * precipitation depth (see precipitationSeasonalTiming.ts). It is NOT applicable
 * to a signed field such as air temperature in °C, where a value-weighted mean
 * has no physical meaning; those signals use a harmonic fit instead.
 *
 * Scientific honesty (kept in the code because callers surface it):
 *  - AOD at 550 nm is a whole-column optical thickness, NOT a surface
 *    concentration and NOT a regulatory air-quality or health index. A haze-season
 *    centroid is a calendar direction of column loading, nothing about surface air.
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so each monthly value is a modelled mean, not a direct pixel measurement.
 *  - AOD is an intensive optical property, not an additive amount like a
 *    precipitation depth; the value-weighted circular mean is still well-defined
 *    because AOD is non-negative, but it describes where loading sits optically in
 *    the calendar, never an accumulated quantity.
 *  - The centroid is derived from a mean annual cycle over the SUPPLIED years
 *    only, not a 30-year climatological normal. A short record shifts with the
 *    years it happens to contain and one dust or smoke year can pull a thin month.
 *  - The centroid month is a calendar direction at whole-month resolution — NOT a
 *    dust/smoke-season onset or retreat date, a monsoon detector, an event date,
 *    a climate normal, an anomaly, an attribution, a trend, or a forecast.
 *  - The resultant length R is a companion *concentration* measure; when R is
 *    small the centroid direction is weakly defined, so callers should read
 *    `concentration` alongside `centroidMonth` rather than in isolation.
 *  - A centroid is emitted only when all twelve calendar months meet the
 *    per-month year floor, so every 30° angular bin is represented exactly once; a
 *    missing month yields no timing rather than a direction biased by the gap.
 *
 * Pure, render-free logic (see aerosolSeasonalTiming.test.ts).
 */

/** A conservative floor of distinct years per calendar month before it counts. */
export const MINIMUM_AEROSOL_SEASONAL_TIMING_YEARS_PER_MONTH = 3;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_AEROSOL_SEASONAL_TIMING_VALID_FRACTION = 0.6;

/** Every calendar month must be covered before a centroid is emitted. */
export const CALENDAR_MONTHS_IN_YEAR = 12;

const RADIANS_PER_MONTH = (2 * Math.PI) / CALENDAR_MONTHS_IN_YEAR;
const DEGREES_PER_MONTH = 360 / CALENDAR_MONTHS_IN_YEAR;

/**
 * Below this resultant length (relative to the total weight) the loading is
 * spread so evenly around the calendar that the mean direction is numerically
 * undefined; `centroidMonth` is withheld rather than reported as a spurious month.
 */
const RESULTANT_EPSILON = 1e-9;

/** Honest scope limits shared by the aerosol seasonal-timing descriptor. */
export const AEROSOL_SEASONAL_TIMING_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so each monthly value is a modelled mean, not a direct pixel measurement.",
  "AOD is an intensive optical property, not an additive amount like a precipitation depth; the value-weighted circular mean is well-defined only because AOD is non-negative and it describes where loading sits optically in the calendar, not an accumulated quantity.",
  "The centroid is derived from a mean annual cycle over the supplied years only, not a 30-year climate normal; a short record shifts with the years it contains and one dust or smoke year can pull a thin month.",
  "The centroid month is a calendar direction at whole-month resolution, not a dust/smoke-season onset or retreat date, monsoon detector, event date, climate normal, anomaly, attribution, trend, or forecast.",
  "The resultant length R is a companion concentration measure; when R is small the centroid direction is weakly defined and is withheld rather than guessed.",
  "A centroid is emitted only when all twelve calendar months meet the per-month year floor, so every angular bin is represented once; a missing month yields no timing rather than a biased direction.",
] as const;

export type AerosolSeasonalTimingStatus =
  | "available"
  | "insufficient-monthly-coverage"
  | "no-usable-observations"
  | "invalid";

export interface AerosolSeasonalTimingOptions {
  /** Distinct years required per calendar month before it enters the cycle. */
  minimumYearsPerMonth?: number;
  /** Minimum valid spatial fraction for an observation to be usable. */
  minimumValidFraction?: number;
}

/** Mean column AOD for one calendar month across the supplied years. */
export interface MonthlyAerosolMean {
  /** Calendar month, 1 (January) through 12 (December). */
  calendarMonth: number;
  /** Distinct years that contributed to this month's mean. */
  yearsUsed: number;
  /** Mean column AOD at 550 nm for this calendar month (dimensionless). */
  meanAod: number;
}

export interface AerosolSeasonalTimingExclusions {
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

export interface AerosolSeasonalTiming {
  kind: "derived-aerosol-seasonal-timing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AerosolSeasonalTimingStatus;
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
  /** Per-calendar-month mean cycle, sorted January→December; covered months only. */
  monthlyMeans: MonthlyAerosolMean[];
  /**
   * Resultant vector phase in degrees [0, 360), measured from the Dec/Jan year
   * boundary (0° = start of January, 90° = start of April, …). `null` when no
   * full cycle is available or the resultant is too short to define a direction.
   */
  phaseDegrees: number | null;
  /**
   * Centroid position on the calendar as a continuous month in (0.5, 12.5]:
   * 1.0 = mid-January, 6.5 = end of June / start of July. `null` when no
   * direction is defined.
   */
  centroidMonth: number | null;
  /**
   * Whole calendar month (1..12) nearest the centroid, or `null` when no
   * direction is defined. December (12) and January (1) are treated as adjacent,
   * so the nearest month is always in range.
   */
  centroidCalendarMonth: number | null;
  /** Short English name of `centroidCalendarMonth`, or `null` when undefined. */
  centroidMonthName: string | null;
  /**
   * Mean resultant length R in [0, 1]: 0 = loading spread evenly around the
   * calendar (no preferred timing), 1 = all loading directed at a single month.
   * Reported for any full cycle, even when the centroid direction is withheld.
   * `null` only when no full cycle is available.
   */
  concentration: number | null;
  exclusions: AerosolSeasonalTimingExclusions;
  limitations: readonly string[];
  /** Short machine-readable reason when no centroid is reported. */
  reason: string | null;
}

/**
 * Compute the mean-AOD-weighted seasonal-timing centroid of the mean annual
 * column-aerosol cycle from a supplied set of monthly aerosol observations. Each
 * calendar month is averaged over its distinct usable years; a month needs
 * `minimumYearsPerMonth` of them to count, and a centroid is emitted only when
 * every calendar month qualifies so each 30° angular bin is represented once.
 *
 * Grouping observations to one place is the caller's responsibility; this helper
 * never borrows adjacent months or fills missing years. A `null` centroid always
 * means "no timing can be stated", never "the loading has no season" — read
 * `concentration` for the latter.
 */
export function describeAerosolSeasonalTiming(
  observations: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolSeasonalTimingOptions = {}
): AerosolSeasonalTiming {
  const requiredYearsPerMonth =
    options.minimumYearsPerMonth ??
    MINIMUM_AEROSOL_SEASONAL_TIMING_YEARS_PER_MONTH;
  const requiredValidFraction =
    options.minimumValidFraction ??
    MINIMUM_AEROSOL_SEASONAL_TIMING_VALID_FRACTION;
  const exclusions = emptyExclusions();

  const base = {
    kind: "derived-aerosol-seasonal-timing" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    requiredYearsPerMonth,
    requiredValidFraction,
    observationsSupplied: observations.length,
    limitations: AEROSOL_SEASONAL_TIMING_LIMITATIONS,
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
      monthlyMeans: [],
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
      concentration: null,
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

  const monthlyMeans: MonthlyAerosolMean[] = [];
  let observationsUsed = 0;
  for (let calendarMonth = 1; calendarMonth <= CALENDAR_MONTHS_IN_YEAR;) {
    const yearValues = buckets.get(calendarMonth);
    if (yearValues && yearValues.size >= requiredYearsPerMonth) {
      const values = [...yearValues.values()];
      observationsUsed += values.length;
      monthlyMeans.push({
        calendarMonth,
        yearsUsed: values.length,
        meanAod: neumaierSum(values) / values.length,
      });
    }
    calendarMonth += 1;
  }

  const calendarMonthsCovered = monthlyMeans.length;
  if (calendarMonthsCovered === 0) {
    return {
      ...base,
      status: "no-usable-observations",
      observationsUsed,
      calendarMonthsCovered,
      monthlyMeans,
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
      concentration: null,
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
      monthlyMeans,
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
      concentration: null,
      exclusions,
      reason: "not-all-calendar-months-covered",
    };
  }

  // Full cycle: form the mean-AOD-weighted resultant. Every calendar month sits
  // at its mid-month angle (Jan → 15°, Dec → 345°) and carries its monthly mean.
  const cosTerms: number[] = [];
  const sinTerms: number[] = [];
  const weights: number[] = [];
  for (const entry of monthlyMeans) {
    const angle = RADIANS_PER_MONTH * (entry.calendarMonth - 0.5);
    cosTerms.push(entry.meanAod * Math.cos(angle));
    sinTerms.push(entry.meanAod * Math.sin(angle));
    weights.push(entry.meanAod);
  }

  const totalWeight = neumaierSum(weights);
  const cosSum = neumaierSum(cosTerms);
  const sinSum = neumaierSum(sinTerms);
  const resultant = Math.hypot(cosSum, sinSum);

  const commonAvailable = {
    ...base,
    status: "available" as const,
    observationsUsed,
    calendarMonthsCovered,
    monthlyMeans,
    exclusions,
  };

  // A degenerate all-zero cycle (every month a perfectly clean column) makes the
  // weighted vector 0/0; report zero concentration but withhold a direction.
  if (totalWeight <= 0) {
    return {
      ...commonAvailable,
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
      concentration: 0,
      reason: "zero-total-loading",
    };
  }

  const concentration = clamp01(resultant / totalWeight);

  // Loading spread so evenly that the resultant vanishes has no preferred timing;
  // report the (near-zero) concentration but withhold a spurious direction.
  if (
    resultant <= RESULTANT_EPSILON * totalWeight ||
    resultant <= RESULTANT_EPSILON
  ) {
    return {
      ...commonAvailable,
      phaseDegrees: null,
      centroidMonth: null,
      centroidCalendarMonth: null,
      centroidMonthName: null,
      concentration,
      reason: "no-preferred-timing",
    };
  }

  // Mean direction, normalized to [0, 360).
  const phaseRadians = Math.atan2(sinSum, cosSum);
  const phaseDegrees = ((phaseRadians * 180) / Math.PI + 360) % 360;

  // Invert the mid-month placement: month m sat at DEGREES_PER_MONTH·(m − 0.5),
  // so the continuous centroid month is phase/DEGREES_PER_MONTH + 0.5, wrapped
  // into (0.5, 12.5].
  let centroidMonth = phaseDegrees / DEGREES_PER_MONTH + 0.5;
  if (centroidMonth <= 0.5) centroidMonth += CALENDAR_MONTHS_IN_YEAR;

  const centroidCalendarMonth = wrapCalendarMonth(Math.round(centroidMonth));

  return {
    ...commonAvailable,
    phaseDegrees,
    centroidMonth,
    centroidCalendarMonth,
    centroidMonthName: MONTH_NAMES[centroidCalendarMonth - 1],
    concentration,
    reason: null,
  };
}

/**
 * A compact, honest readout of the aerosol seasonal timing. Emphasizes that the
 * centroid is a calendar direction of column loading over a short record, not a
 * dust-season onset date or a forecast.
 */
export function formatAerosolSeasonalTiming(
  timing: AerosolSeasonalTiming
): string {
  const source = `${timing.source.shortName} v${timing.source.version}`;
  if (
    timing.status !== "available" ||
    timing.centroidCalendarMonth === null ||
    timing.centroidMonthName === null ||
    timing.concentration === null
  ) {
    const concentration =
      timing.concentration === null
        ? "n/a"
        : `R=${formatNumber(timing.concentration)}`;
    return `No aerosol seasonal-timing centroid (${timing.reason ?? "unavailable"}; ${timing.calendarMonthsCovered}/${CALENDAR_MONTHS_IN_YEAR} calendar months covered; concentration ${concentration}); source ${source}`;
  }
  return `Mean annual column-AOD (550 nm) loading centred on ${timing.centroidMonthName} (concentration R=${formatNumber(timing.concentration)}, 0=even 1=one month); mean-cycle circular mean over ${timing.observationsUsed} usable observations, a calendar direction not a season-onset date; source ${source}`;
}

/** Clamp a value to [0, 1], guarding tiny floating-point overshoots. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Map a rounded month value onto 1..12, treating December and January as adjacent. */
function wrapCalendarMonth(month: number): number {
  return ((month - 1) % CALENDAR_MONTHS_IN_YEAR) + 1;
}

function emptyExclusions(): AerosolSeasonalTimingExclusions {
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
