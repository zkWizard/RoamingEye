import { LAYERS, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Descriptive annual summaries for already-calibrated monthly NDVI values.
 *
 * MOD13A3 NDVI is a unitless vegetation-index observation. These helpers do
 * not infer plant stages, ecosystem condition, crop performance, or causes;
 * they only identify the highest and lowest supplied monthly observations.
 */

export const NDVI_UNIT = "NDVI (unitless)";

/** A half-year of observations is the minimum for a descriptive annual range. */
export const MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA = 6;

const source = LAYERS.ndvi.dataset;
if (!source) {
  throw new Error("RoamingEye: the NDVI layer must retain a cited dataset");
}

/** Existing NASA MOD13A3 v061 provenance, retained in every summary. */
export const NDVI_SOURCE: DatasetRef = source;

export interface NdviMonthlyObservation {
  /** Calendar month of an already-calibrated regional or point observation. */
  month: YearMonth;
  /** Physical NDVI, unitless and bounded by the conventional [-1, 1] range. */
  ndvi: number | null;
  /**
   * Valid share of the sampled region (0..1), when the sampler supplied it.
   * A zero-coverage observation is treated as missing even if it has a value.
   */
  validFraction?: number;
}

export type Hemisphere = "northern" | "southern" | "equatorial" | "unknown";

export type MeteorologicalSeason =
  "spring" | "summer" | "autumn" | "winter" | "not-assigned";

export interface NdviExtremum {
  month: YearMonth;
  ndvi: number;
  /** Calendar-season label, not a claim about a biological growth phase. */
  meteorologicalSeason: MeteorologicalSeason;
}

export interface NdviCoverage {
  /** Valid calendar months supplied for this year (not an assumed 12 months). */
  validMonthCount: number;
  /** Supplied months without a usable NDVI observation. */
  missingMonthCount: number;
  /** Supplied records rejected for invalid date, value, coverage, or duplicate. */
  invalidRecordCount: number;
  /** Lowest reported regional valid fraction among the retained observations. */
  minimumValidFraction: number | null;
  /** Whether the record is shorter than the threshold for annual extrema. */
  isSparse: boolean;
}

export interface NdviAnnualPhenology {
  year: number;
  hemisphere: Hemisphere;
  coverage: NdviCoverage;
  /** Highest supplied monthly observation, or null for sparse/no-data years. */
  peak: NdviExtremum | null;
  /** Lowest supplied monthly observation, or null for sparse/no-data years. */
  trough: NdviExtremum | null;
  /** Peak minus trough for supplied observations, not a productivity measure. */
  seasonalRange: number | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
}

/** Classify a valid latitude only; invalid coordinates get no seasonal mapping. */
export function hemisphereForLatitude(latitude: number): Hemisphere {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) return "unknown";
  if (latitude > 0) return "northern";
  if (latitude < 0) return "southern";
  return "equatorial";
}

/**
 * Calendar-season convention for a month and hemisphere. Equatorial and
 * unknown locations deliberately get no label because this convention does
 * not describe local wet/dry or biological seasons there.
 */
export function meteorologicalSeasonForMonth(
  month: number,
  hemisphere: Hemisphere
): MeteorologicalSeason {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    return "not-assigned";
  }
  if (hemisphere === "equatorial" || hemisphere === "unknown") {
    return "not-assigned";
  }

  const northern: Exclude<MeteorologicalSeason, "not-assigned"> =
    month === 12 || month <= 2
      ? "winter"
      : month <= 5
        ? "spring"
        : month <= 8
          ? "summer"
          : "autumn";
  if (hemisphere === "northern") return northern;

  const southern: Record<
    Exclude<MeteorologicalSeason, "not-assigned">,
    Exclude<MeteorologicalSeason, "not-assigned">
  > = {
    spring: "autumn",
    summer: "winter",
    autumn: "spring",
    winter: "summer",
  };
  return southern[northern];
}

/**
 * Group supplied monthly NDVI values into honest annual descriptive summaries.
 * Input may be incomplete; omitted calendar months are never counted as data.
 * Duplicate records are rejected rather than averaged, so a repeat cannot
 * silently alter an annual peak or trough.
 */
export function summarizeAnnualNdviPhenology(
  observations: readonly NdviMonthlyObservation[],
  latitude: number
): NdviAnnualPhenology[] {
  const hemisphere = hemisphereForLatitude(latitude);
  const years = new Map<number, YearAccumulator>();

  for (const observation of observations) {
    const year = observation.month?.year;
    if (!Number.isInteger(year)) continue;
    const accumulator = years.get(year) ?? emptyYearAccumulator();
    years.set(year, accumulator);

    if (!isCalendarMonth(observation.month)) {
      accumulator.invalidRecordCount += 1;
      continue;
    }
    const key = observation.month.month;
    if (accumulator.seenMonths.has(key)) {
      accumulator.invalidRecordCount += 1;
      continue;
    }
    accumulator.seenMonths.add(key);

    if (observation.ndvi === null || observation.validFraction === 0) {
      accumulator.missingMonthCount += 1;
      continue;
    }
    if (
      !Number.isFinite(observation.ndvi) ||
      observation.ndvi < -1 ||
      observation.ndvi > 1 ||
      (observation.validFraction !== undefined &&
        (!Number.isFinite(observation.validFraction) ||
          observation.validFraction < 0 ||
          observation.validFraction > 1))
    ) {
      accumulator.invalidRecordCount += 1;
      continue;
    }

    accumulator.valid.push(observation);
  }

  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, accumulator]) => annualSummary(year, accumulator, hemisphere));
}

interface YearAccumulator {
  seenMonths: Set<number>;
  valid: NdviMonthlyObservation[];
  missingMonthCount: number;
  invalidRecordCount: number;
}

function emptyYearAccumulator(): YearAccumulator {
  return {
    seenMonths: new Set<number>(),
    valid: [],
    missingMonthCount: 0,
    invalidRecordCount: 0,
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

function annualSummary(
  year: number,
  accumulator: YearAccumulator,
  hemisphere: Hemisphere
): NdviAnnualPhenology {
  const valid = accumulator.valid;
  const coverage: NdviCoverage = {
    validMonthCount: valid.length,
    missingMonthCount: accumulator.missingMonthCount,
    invalidRecordCount: accumulator.invalidRecordCount,
    minimumValidFraction:
      valid.length === 0
        ? null
        : Math.min(...valid.map(({ validFraction }) => validFraction ?? 1)),
    isSparse: valid.length < MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA,
  };
  const base: Pick<
    NdviAnnualPhenology,
    "year" | "hemisphere" | "coverage" | "source" | "unit"
  > = { year, hemisphere, coverage, source: NDVI_SOURCE, unit: NDVI_UNIT };
  if (coverage.isSparse) {
    return { ...base, peak: null, trough: null, seasonalRange: null };
  }

  const peakObservation = valid.reduce((best, current) =>
    current.ndvi! > best.ndvi! ? current : best
  );
  const troughObservation = valid.reduce((best, current) =>
    current.ndvi! < best.ndvi! ? current : best
  );
  const peak = extremumFor(peakObservation, hemisphere);
  const trough = extremumFor(troughObservation, hemisphere);
  return {
    ...base,
    peak,
    trough,
    seasonalRange: peak.ndvi - trough.ndvi,
  };
}

function extremumFor(
  observation: NdviMonthlyObservation,
  hemisphere: Hemisphere
): NdviExtremum {
  return {
    month: observation.month,
    ndvi: observation.ndvi!,
    meteorologicalSeason: meteorologicalSeasonForMonth(
      observation.month.month,
      hemisphere
    ),
  };
}
