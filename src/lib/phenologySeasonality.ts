import {
  MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA,
  NDVI_SOURCE,
  NDVI_UNIT,
  hemisphereForLatitude,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
  type NdviMonthlyObservation,
} from "./phenology";
import { neumaierSum } from "./numerics";
import type { DatasetRef } from "./timeline";

/**
 * Descriptive within-year *seasonality concentration* of monthly NDVI greenness.
 *
 * {@link summarizeAnnualNdviPhenology} reduces a year to its highest and lowest
 * supplied monthly MOD13A3 NDVI observation. That says nothing about how the
 * greenness in between is distributed around the calendar: two years with an
 * identical peak and trough can differ sharply — one packing its above-minimum
 * greenness into a short stretch (a pronounced single-season signal), the other
 * spreading it almost evenly through the year (a weakly seasonal, near-evergreen
 * signal). This helper summarizes that shape with the standard tool for
 * directional data: a magnitude-weighted mean resultant vector on the circle of
 * calendar months (Fisher, *Statistical Analysis of Circular Data*, 1993;
 * Mardia & Jupp, *Directional Statistics*, 2000).
 *
 * Method. Each valid month m is placed at angle θ = (m − 1)·2π/12 and weighted
 * by its greenness *above the year's own minimum*, wₘ = NDVIₘ − min NDVI (≥ 0).
 * Anchoring at the annual minimum is deliberate: NDVI's zero is not a meaningful
 * origin for greenness "mass" and the index can be negative, so raw values are
 * unsuitable as circular weights; the excess-above-floor is the appropriate
 * non-negative quantity and makes the trough month contribute nothing. The mean
 * resultant length R = |Σ wₘ e^{iθ}| / Σ wₘ lies in [0, 1]: R near 1 means the
 * above-floor greenness is concentrated in a short part of the year; R near 0
 * means it is spread evenly around the calendar. The resultant's direction gives
 * the greenness centroid month.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - R and the centroid are a geometric summary of the *supplied* monthly index
 *    only. They are NOT a growing-season length or onset/offset date, a
 *    phenophase, a productivity, biomass, canopy, or land-cover claim, an
 *    anomaly against any climatology, a cause, or a forecast. A high R is not
 *    "healthier" vegetation and a low R is not "worse" — an evergreen humid
 *    tropical forest is legitimately near-aseasonal in NDVI.
 *  - Calendar months are circular (December neighbours January), so the centroid
 *    is a vector mean, never an arithmetic average of month numbers — greenness
 *    split between December and January centres on the year-end turn, not July.
 *  - Missing months bias both R and the centroid, so a minimum month count is
 *    required and the full coverage tally is always returned for auditability.
 *  - A year with no within-year variation (every valid month equal, so the
 *    weights sum to zero) has an undefined concentration and is reported `flat`
 *    with a null R rather than a fabricated value.
 *  - The seasonality *class* bins are presentation aids for reading R, not
 *    categories from any published standard; R itself is the measurement.
 */

/** Honest scope limits for the derived seasonality-concentration descriptor. */
export const NDVI_SEASONAL_CONCENTRATION_LIMITATIONS =
  "The NDVI seasonality concentration is the magnitude-weighted mean resultant " +
  "length R (in [0,1]) of a year's supplied monthly MOD13A3 NDVI values placed " +
  "on the circle of calendar months and weighted by their greenness above the " +
  "year's own minimum. It describes only how that above-minimum greenness is " +
  "distributed in time — R near 1 is concentrated in a short part of the year, " +
  "R near 0 is spread evenly around the calendar — together with the greenness " +
  "centroid month. It requires a minimum number of valid months (gaps bias the " +
  "vector) and a year with within-year variation; a flat or too-sparse year " +
  "yields no value rather than a guess. It is a plain descriptive statistic of " +
  "a unitless vegetation index carrying the shared cited provenance — not a " +
  "growing-season length or onset date, phenophase, productivity, biomass, " +
  "anomaly, ecosystem-condition assessment, cause, or forecast.";

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;

/** Below this normalized resultant length the centroid direction is undefined. */
const RESULTANT_EPSILON = 1e-9;

export type NdviSeasonalConcentrationStatus =
  "available" | "flat" | "insufficient-coverage";

/**
 * Presentation bins for the mean resultant length R. These are reading aids for
 * R, not thresholds from any published standard; R itself is the measurement
 * and should be preferred for any quantitative use.
 */
export type NdviSeasonalityClass =
  "aseasonal" | "weakly-seasonal" | "seasonal" | "strongly-seasonal";

export interface NdviSeasonalConcentrationCoverage {
  /** Valid calendar months supplied for this year (not an assumed 12 months). */
  validMonthCount: number;
  /** Supplied months without a usable NDVI observation. */
  missingMonthCount: number;
  /** Supplied records rejected for invalid date, value, coverage, or duplicate. */
  invalidRecordCount: number;
  /** Minimum valid months required before a concentration is stated. */
  requiredMonthCount: number;
  /** Lowest reported regional valid fraction among the retained observations. */
  minimumValidFraction: number | null;
}

export interface NdviSeasonalConcentration {
  kind: "ndvi-seasonal-concentration";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  year: number;
  hemisphere: Hemisphere;
  status: NdviSeasonalConcentrationStatus;
  coverage: NdviSeasonalConcentrationCoverage;
  /**
   * Mean resultant length R in [0, 1]; higher means the above-minimum greenness
   * is packed into a shorter part of the year. Null for flat or too-sparse years.
   */
  concentration: number | null;
  /** Presentation bin for R; null when R is unavailable. */
  seasonalityClass: NdviSeasonalityClass | null;
  /** Calendar month (1..12) nearest the greenness centroid, or null. */
  centroidMonth: number | null;
  /**
   * Continuous centroid position in [1, 13) for finer reading (e.g. 6.5 is
   * mid-June/July), or null when the centroid direction is undefined.
   */
  continuousCentroidMonth: number | null;
  /** Calendar-season label of `centroidMonth`, never a growth-phase claim. */
  centroidSeason: MeteorologicalSeason;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no concentration is reported. */
  reason: string | null;
}

interface YearGroup {
  seenMonths: Set<number>;
  valid: { month: number; ndvi: number; validFraction: number }[];
  missingMonthCount: number;
  invalidRecordCount: number;
}

/**
 * Summarize the within-year NDVI seasonality concentration for each year in a
 * run of supplied monthly observations.
 *
 * Input may be supplied in any order and may be incomplete; omitted calendar
 * months are never counted as data. Grouping and per-observation validation
 * mirror {@link summarizeAnnualNdviPhenology} exactly (same calendar-month,
 * duplicate, range, and coverage rules), so coverage tallies are comparable and
 * a duplicate can never silently alter a year's vector.
 */
export function summarizeNdviSeasonalConcentration(
  observations: readonly NdviMonthlyObservation[],
  latitude: number,
  options: { minimumMonths?: number } = {}
): NdviSeasonalConcentration[] {
  const requiredMonthCount =
    Number.isInteger(options.minimumMonths) &&
    (options.minimumMonths as number) > 0
      ? (options.minimumMonths as number)
      : MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA;
  const hemisphere = hemisphereForLatitude(latitude);

  const years = new Map<number, YearGroup>();
  for (const observation of observations) {
    const year = observation.month?.year;
    if (!Number.isInteger(year)) continue;
    const group = years.get(year) ?? emptyYearGroup();
    years.set(year, group);

    if (!isCalendarMonth(observation.month)) {
      group.invalidRecordCount += 1;
      continue;
    }
    const month = observation.month.month;
    if (group.seenMonths.has(month)) {
      group.invalidRecordCount += 1;
      continue;
    }
    group.seenMonths.add(month);

    if (observation.ndvi === null || observation.validFraction === 0) {
      group.missingMonthCount += 1;
      continue;
    }
    if (
      !Number.isFinite(observation.ndvi) ||
      (observation.ndvi as number) < -1 ||
      (observation.ndvi as number) > 1 ||
      (observation.validFraction !== undefined &&
        (!Number.isFinite(observation.validFraction) ||
          observation.validFraction < 0 ||
          observation.validFraction > 1))
    ) {
      group.invalidRecordCount += 1;
      continue;
    }

    group.valid.push({
      month,
      ndvi: observation.ndvi as number,
      validFraction: observation.validFraction ?? 1,
    });
  }

  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, group]) =>
      concentrationForYear(year, group, hemisphere, requiredMonthCount)
    );
}

function emptyYearGroup(): YearGroup {
  return {
    seenMonths: new Set<number>(),
    valid: [],
    missingMonthCount: 0,
    invalidRecordCount: 0,
  };
}

function isCalendarMonth(month: NdviMonthlyObservation["month"]): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function concentrationForYear(
  year: number,
  group: YearGroup,
  hemisphere: Hemisphere,
  requiredMonthCount: number
): NdviSeasonalConcentration {
  const coverage: NdviSeasonalConcentrationCoverage = {
    validMonthCount: group.valid.length,
    missingMonthCount: group.missingMonthCount,
    invalidRecordCount: group.invalidRecordCount,
    requiredMonthCount,
    minimumValidFraction:
      group.valid.length === 0
        ? null
        : Math.min(...group.valid.map(({ validFraction }) => validFraction)),
  };
  const base = {
    kind: "ndvi-seasonal-concentration" as const,
    isForecast: false as const,
    year,
    hemisphere,
    coverage,
    source: NDVI_SOURCE,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  if (group.valid.length < requiredMonthCount) {
    return {
      ...base,
      status: "insufficient-coverage",
      concentration: null,
      seasonalityClass: null,
      centroidMonth: null,
      continuousCentroidMonth: null,
      centroidSeason: "not-assigned",
      reason: "insufficient-months",
    };
  }

  const minNdvi = Math.min(...group.valid.map(({ ndvi }) => ndvi));
  const maxNdvi = Math.max(...group.valid.map(({ ndvi }) => ndvi));
  if (maxNdvi === minNdvi) {
    // Every valid month shares one NDVI value: the above-minimum weights all
    // vanish, so there is no greenness distribution to place on the circle.
    return {
      ...base,
      status: "flat",
      concentration: null,
      seasonalityClass: null,
      centroidMonth: null,
      continuousCentroidMonth: null,
      centroidSeason: "not-assigned",
      reason: "no-within-year-variation",
    };
  }

  const weights = group.valid.map(({ ndvi }) => ndvi - minNdvi);
  const cosParts = group.valid.map(
    ({ month }, i) => weights[i] * Math.cos((month - 1) * RADIANS_PER_MONTH)
  );
  const sinParts = group.valid.map(
    ({ month }, i) => weights[i] * Math.sin((month - 1) * RADIANS_PER_MONTH)
  );
  const totalWeight = neumaierSum(weights);
  const meanCos = neumaierSum(cosParts) / totalWeight;
  const meanSin = neumaierSum(sinParts) / totalWeight;
  const concentration = Math.min(1, Math.hypot(meanCos, meanSin));

  let centroidMonth: number | null = null;
  let continuousCentroidMonth: number | null = null;
  if (concentration >= RESULTANT_EPSILON) {
    let angle = Math.atan2(meanSin, meanCos);
    if (angle < 0) angle += 2 * Math.PI;
    continuousCentroidMonth = angle / RADIANS_PER_MONTH + 1; // in [1, 13)
    centroidMonth = ((Math.round(continuousCentroidMonth) - 1) % 12) + 1;
  }

  return {
    ...base,
    status: "available",
    concentration,
    seasonalityClass: seasonalityClassFor(concentration),
    centroidMonth,
    continuousCentroidMonth,
    centroidSeason:
      centroidMonth === null
        ? "not-assigned"
        : meteorologicalSeasonForMonth(centroidMonth, hemisphere),
    reason: null,
  };
}

/**
 * Bin the mean resultant length R for presentation. Break points at
 * 0.15 / 0.35 / 0.60 are round reading aids, not calibrated thresholds; the
 * numeric `concentration` remains the authoritative value.
 */
function seasonalityClassFor(concentration: number): NdviSeasonalityClass {
  if (concentration < 0.15) return "aseasonal";
  if (concentration < 0.35) return "weakly-seasonal";
  if (concentration < 0.6) return "seasonal";
  return "strongly-seasonal";
}
