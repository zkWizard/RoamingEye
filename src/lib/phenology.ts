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
  /**
   * Earliest supplied month holding this value. When `status` is "tied" it is
   * one of several equally extreme months, not the year's single peak/trough.
   */
  month: YearMonth;
  ndvi: number;
  /**
   * Calendar-season label for `month`, not a claim about a biological growth
   * phase. Tied months may fall in different seasons; read `tiedMonths`.
   */
  meteorologicalSeason: MeteorologicalSeason;
  /** Whether one supplied month holds this value on its own. */
  status: "unique" | "tied";
  /**
   * Every supplied month holding this value, in calendar order (length 1 when
   * unique). MOD13A3 observations reaching these summaries are decoded from a
   * quantised colour ramp, so exact ties between months are ordinary rather
   * than pathological, and naming one of them the peak would over-claim.
   */
  tiedMonths: YearMonth[];
}

export interface NdviCoverage {
  /** Distinct valid calendar-month numbers represented by supplied records. */
  suppliedCalendarMonths: number[];
  /** Calendar-month numbers absent from the supplied records. */
  omittedCalendarMonths: number[];
  /** Valid calendar months supplied for this year (not an assumed 12 months). */
  validMonthCount: number;
  /** Exact months retained as usable observations, sorted chronologically. */
  validMonths: YearMonth[];
  /** Supplied months without a usable NDVI observation. */
  missingMonthCount: number;
  /** Exact supplied months reported as unavailable, sorted chronologically. */
  missingMonths: YearMonth[];
  /** Supplied records rejected for invalid date, value, coverage, or duplicate. */
  invalidRecordCount: number;
  /** Retained observations that supplied a regional valid fraction. */
  validFractionReportedCount: number;
  /** Retained observations whose regional valid fraction was unavailable. */
  validFractionUnavailableCount: number;
  /**
   * Lowest reported regional valid fraction among retained observations, or
   * null when none supplied coverage metadata. Unknown coverage is never
   * interpreted as complete coverage.
   */
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
 * Every record in a duplicate calendar month is rejected rather than choosing
 * the first or averaging, so input order cannot silently alter an annual peak
 * or trough. Months that tie for a year's highest or lowest value are all
 * reported (see {@link NdviExtremum}) instead of letting supply order decide
 * which one is named.
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
    const monthRecords = accumulator.monthRecords.get(observation.month.month);
    if (monthRecords) monthRecords.push(observation);
    else accumulator.monthRecords.set(observation.month.month, [observation]);
  }

  return [...years.entries()]
    .sort(([a], [b]) => a - b)
    .map(([year, accumulator]) => {
      classifyMonthRecords(accumulator);
      return annualSummary(year, accumulator, hemisphere);
    });
}

interface YearAccumulator {
  monthRecords: Map<number, NdviMonthlyObservation[]>;
  valid: NdviMonthlyObservation[];
  missingMonths: YearMonth[];
  missingMonthCount: number;
  invalidRecordCount: number;
}

function emptyYearAccumulator(): YearAccumulator {
  return {
    monthRecords: new Map<number, NdviMonthlyObservation[]>(),
    valid: [],
    missingMonths: [],
    missingMonthCount: 0,
    invalidRecordCount: 0,
  };
}

function classifyMonthRecords(accumulator: YearAccumulator): void {
  for (const records of accumulator.monthRecords.values()) {
    if (records.length > 1) {
      accumulator.invalidRecordCount += records.length;
      continue;
    }

    const observation = records[0];
    if (observation.ndvi === null || observation.validFraction === 0) {
      accumulator.missingMonthCount += 1;
      accumulator.missingMonths.push(observation.month);
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
  const reportedValidFractions = valid.flatMap(({ validFraction }) =>
    validFraction === undefined ? [] : [validFraction]
  );
  const suppliedCalendarMonths = [...accumulator.monthRecords.keys()].sort(
    (a, b) => a - b
  );
  const omittedCalendarMonths = Array.from(
    { length: 12 },
    (_, index) => index + 1
  ).filter((month) => !accumulator.monthRecords.has(month));
  const validMonths = valid
    .map(({ month }) => month)
    .sort((a, b) => a.month - b.month);
  const missingMonths = [...accumulator.missingMonths].sort(
    (a, b) => a.month - b.month
  );
  const coverage: NdviCoverage = {
    suppliedCalendarMonths,
    omittedCalendarMonths,
    validMonthCount: valid.length,
    validMonths,
    missingMonthCount: accumulator.missingMonthCount,
    missingMonths,
    invalidRecordCount: accumulator.invalidRecordCount,
    validFractionReportedCount: reportedValidFractions.length,
    validFractionUnavailableCount: valid.length - reportedValidFractions.length,
    minimumValidFraction:
      reportedValidFractions.length === 0
        ? null
        : Math.min(...reportedValidFractions),
    isSparse: valid.length < MINIMUM_MONTHS_FOR_ANNUAL_EXTREMA,
  };
  const base: Pick<
    NdviAnnualPhenology,
    "year" | "hemisphere" | "coverage" | "source" | "unit"
  > = { year, hemisphere, coverage, source: NDVI_SOURCE, unit: NDVI_UNIT };
  if (coverage.isSparse) {
    return { ...base, peak: null, trough: null, seasonalRange: null };
  }

  // Compare in calendar order so a tie resolves to the earliest month rather
  // than to whichever record the caller happened to supply first.
  const chronological = [...valid].sort(
    (a, b) => a.month.month - b.month.month
  );
  const peak = extremumFor(
    chronological,
    Math.max(...chronological.map(({ ndvi }) => ndvi!)),
    hemisphere
  );
  const trough = extremumFor(
    chronological,
    Math.min(...chronological.map(({ ndvi }) => ndvi!)),
    hemisphere
  );
  return {
    ...base,
    peak,
    trough,
    seasonalRange: peak.ndvi - trough.ndvi,
  };
}

function extremumFor(
  chronological: readonly NdviMonthlyObservation[],
  ndvi: number,
  hemisphere: Hemisphere
): NdviExtremum {
  const tiedMonths = chronological
    .filter((observation) => observation.ndvi === ndvi)
    .map(({ month }) => month);
  const [month] = tiedMonths;
  return {
    month,
    ndvi,
    meteorologicalSeason: meteorologicalSeasonForMonth(month.month, hemisphere),
    status: tiedMonths.length > 1 ? "tied" : "unique",
    tiedMonths,
  };
}
