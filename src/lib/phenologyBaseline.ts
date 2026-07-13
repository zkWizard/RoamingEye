import {
  NDVI_SOURCE,
  NDVI_UNIT,
  hemisphereForLatitude,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
  type NdviMonthlyObservation,
} from "./phenology";
import { neumaierSum } from "./numerics";
import {
  LAYERS,
  compareYm,
  isAvailable,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Source-aware same-calendar-month comparisons for supplied NDVI observations.
 *
 * These helpers only compare the supplied vegetation-index observations. They
 * do not infer plant phenology, biodiversity, biomass, habitat quality,
 * ecosystem health, causes, or future conditions.
 */

/** Ten same-calendar-month observations is a conservative comparison floor. */
export const MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES = 10;

/** Comparisons require 60% valid sampled area in every retained observation. */
export const MINIMUM_NDVI_SEASONAL_VALID_FRACTION = 0.6;

export interface NdviMetric {
  layerId: "ndvi";
  label: "Vegetation (NDVI)";
  source: DatasetRef;
  nativeUnit: typeof NDVI_UNIT;
}

/** MOD13A3 metadata retained by every monthly and baseline result. */
export const NDVI_METRIC: NdviMetric = {
  layerId: "ndvi",
  label: "Vegetation (NDVI)",
  source: NDVI_SOURCE,
  nativeUnit: NDVI_UNIT,
};

export type NdviCoverageStatus = "available" | "no-data" | "invalid";

export interface NdviObservationCoverage {
  status: NdviCoverageStatus;
  /** Null means the sampler did not report the usable boundary fraction. */
  validFraction: number | null;
  reason: string | null;
}

export type NdviPublicationStatus =
  | "published"
  | "not-yet-published"
  | "outside-product-range"
  | "invalid-reference-month";

export interface MonthlyNdviSummary {
  kind: "observed-monthly-ndvi";
  isForecast: false;
  metric: NdviMetric;
  dataMonth: YearMonth;
  /** Caller-confirmed latest published NDVI month. */
  availableThrough: YearMonth;
  publicationStatus: NdviPublicationStatus;
  /** Months from this observation to `availableThrough`, if published. */
  publicationLagMonths: number | null;
  coverage: NdviObservationCoverage;
  /** NDVI unchanged from the source observation, or null when unusable. */
  observedValue: number | null;
}

export interface NdviSeasonalBaselineOptions {
  minimumSamples?: number;
  minimumValidFraction?: number;
  baselineStartYear?: number;
  baselineEndYear?: number;
}

export interface NdviSeasonalBaselineBounds {
  startYear: number | null;
  endYear: number | null;
  calendarMonth: number | null;
}

export interface NdviSeasonalBaselineExclusions {
  wrongCalendarMonth: number;
  outOfBounds: number;
  duplicateYear: number;
  missing: number;
  invalid: number;
  /** Candidate is later than the caller-confirmed availability checkpoint. */
  notYetPublished: number;
  /** Candidate predates the MOD13A3 NDVI record. */
  outsideProductRange: number;
  insufficientCoverage: number;
}

export interface NdviSeasonalBaselineSample {
  month: YearMonth;
  ndvi: number;
  validFraction: number;
  publicationLagMonths: number;
}

export interface NdviSeasonalBaselineStatistics {
  sampleCount: number;
  requiredSampleCount: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  sampleStandardDeviation: number | null;
  standardErrorOfMean: number | null;
  minimumValidFraction: number | null;
  requiredValidFraction: number;
}

export type NdviSeasonalBaselineStatus =
  | "available"
  | "unavailable"
  | "insufficient-samples"
  | "insufficient-coverage"
  | "no-data"
  | "invalid";

export interface NdviSeasonalBaselineComparison {
  kind: "same-calendar-month-ndvi-baseline";
  isForecast: false;
  status: NdviSeasonalBaselineStatus;
  metric: NdviMetric;
  hemisphere: Hemisphere;
  /** Calendar convention only; never a claimed biological growth stage. */
  meteorologicalSeason: MeteorologicalSeason;
  target: MonthlyNdviSummary;
  bounds: NdviSeasonalBaselineBounds;
  baseline: NdviSeasonalBaselineStatistics;
  exclusions: NdviSeasonalBaselineExclusions;
  /** Target NDVI minus the supplied same-month baseline mean. */
  differenceFromBaseline: number | null;
  differenceUnit: typeof NDVI_UNIT;
  /** Retained samples, sorted oldest to newest for auditability. */
  samples: NdviSeasonalBaselineSample[];
  /** Short machine-readable reason when no comparison is reported. */
  reason: string | null;
}

/**
 * Describe a supplied MOD13A3 NDVI observation without converting its unit or
 * assuming boundary coverage. `availableThrough` is a checkpoint, not a
 * prediction that later data will become available.
 */
export function summarizeMonthlyNdvi(
  observation: NdviMonthlyObservation,
  availableThrough: YearMonth
): MonthlyNdviSummary {
  const validMonths =
    isCalendarMonth(observation.month) && isCalendarMonth(availableThrough);
  const publicationStatus = publicationStatusFor(
    observation.month,
    availableThrough,
    validMonths
  );
  const lag =
    publicationStatus === "published"
      ? monthDistance(observation.month, availableThrough)
      : null;
  const coverage = coverageFor(observation, validMonths);

  return {
    kind: "observed-monthly-ndvi",
    isForecast: false,
    metric: NDVI_METRIC,
    dataMonth: observation.month,
    availableThrough,
    publicationStatus,
    publicationLagMonths: lag,
    coverage,
    observedValue:
      coverage.status === "available" && publicationStatus === "published"
        ? observation.ndvi
        : null,
  };
}

/**
 * Compare one NDVI month with supplied observations from the same calendar
 * month in preceding years. The result is a descriptive index difference, not
 * a diagnosis or ecological-condition assessment. Missing or low boundary
 * coverage is retained and blocks the comparison instead of being filled.
 */
export function compareMonthlyNdviToSeasonalBaseline(
  targetObservation: NdviMonthlyObservation,
  baselineCandidates: readonly NdviMonthlyObservation[],
  availableThrough: YearMonth,
  latitude: number,
  options: NdviSeasonalBaselineOptions = {}
): NdviSeasonalBaselineComparison {
  const target = summarizeMonthlyNdvi(targetObservation, availableThrough);
  const hemisphere = hemisphereForLatitude(latitude);
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_NDVI_SEASONAL_BASELINE_SAMPLES;
  const minimumValidFraction =
    options.minimumValidFraction ?? MINIMUM_NDVI_SEASONAL_VALID_FRACTION;
  const targetMonth = isCalendarMonth(targetObservation.month)
    ? targetObservation.month.month
    : null;
  const baselineEndYear =
    options.baselineEndYear ?? targetObservation.month.year - 1;
  const bounds: NdviSeasonalBaselineBounds = {
    startYear: options.baselineStartYear ?? null,
    endYear: Number.isInteger(baselineEndYear) ? baselineEndYear : null,
    calendarMonth: targetMonth,
  };
  const season =
    targetMonth === null
      ? "not-assigned"
      : meteorologicalSeasonForMonth(targetMonth, hemisphere);
  const exclusions = emptyExclusions();
  const validOptions =
    Number.isInteger(minimumSamples) &&
    minimumSamples > 0 &&
    Number.isFinite(minimumValidFraction) &&
    minimumValidFraction >= 0 &&
    minimumValidFraction <= 1 &&
    validYearBound(options.baselineStartYear) &&
    validYearBound(options.baselineEndYear) &&
    (options.baselineStartYear === undefined ||
      options.baselineEndYear === undefined ||
      options.baselineStartYear <= options.baselineEndYear);

  if (!validOptions || targetMonth === null || bounds.endYear === null) {
    return comparisonFor(
      "invalid",
      hemisphere,
      season,
      target,
      bounds,
      emptyBaselineStats(minimumSamples, minimumValidFraction),
      exclusions,
      [],
      "invalid-baseline-configuration"
    );
  }

  const seenYears = new Set<number>();
  const samples: NdviSeasonalBaselineSample[] = [];
  let coverageEligibleCount = 0;

  for (const candidate of baselineCandidates) {
    if (!isCalendarMonth(candidate.month)) {
      exclusions.invalid += 1;
      continue;
    }
    if (candidate.month.month !== targetMonth) {
      exclusions.wrongCalendarMonth += 1;
      continue;
    }
    if (
      (options.baselineStartYear !== undefined &&
        candidate.month.year < options.baselineStartYear) ||
      candidate.month.year > baselineEndYear
    ) {
      exclusions.outOfBounds += 1;
      continue;
    }
    if (seenYears.has(candidate.month.year)) {
      exclusions.duplicateYear += 1;
      continue;
    }
    seenYears.add(candidate.month.year);

    const summary = summarizeMonthlyNdvi(candidate, availableThrough);
    if (summary.publicationStatus === "invalid-reference-month") {
      exclusions.invalid += 1;
      continue;
    }
    if (summary.publicationStatus === "not-yet-published") {
      exclusions.notYetPublished += 1;
      continue;
    }
    if (summary.publicationStatus === "outside-product-range") {
      exclusions.outsideProductRange += 1;
      continue;
    }
    if (summary.coverage.status === "no-data") {
      exclusions.missing += 1;
      continue;
    }
    if (
      summary.coverage.status === "invalid" ||
      summary.observedValue === null
    ) {
      exclusions.invalid += 1;
      continue;
    }
    coverageEligibleCount += 1;
    if (!meetsCoverage(summary, minimumValidFraction)) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    samples.push({
      month: candidate.month,
      ndvi: summary.observedValue,
      validFraction: summary.coverage.validFraction,
      publicationLagMonths: summary.publicationLagMonths!,
    });
  }

  samples.sort((a, b) => a.month.year - b.month.year);
  const baseline = baselineStats(samples, minimumSamples, minimumValidFraction);
  const targetReadiness = readinessForTarget(target, minimumValidFraction);
  if (targetReadiness.status !== "available") {
    return comparisonFor(
      targetReadiness.status,
      hemisphere,
      season,
      target,
      bounds,
      baseline,
      exclusions,
      samples,
      targetReadiness.reason
    );
  }
  if (
    coverageEligibleCount >= minimumSamples &&
    samples.length < minimumSamples
  ) {
    return comparisonFor(
      "insufficient-coverage",
      hemisphere,
      season,
      target,
      bounds,
      baseline,
      exclusions,
      samples,
      "baseline-coverage-below-threshold"
    );
  }
  if (samples.length < minimumSamples || baseline.mean === null) {
    return comparisonFor(
      "insufficient-samples",
      hemisphere,
      season,
      target,
      bounds,
      baseline,
      exclusions,
      samples,
      "too-few-same-calendar-month-samples"
    );
  }

  return {
    kind: "same-calendar-month-ndvi-baseline",
    isForecast: false,
    status: "available",
    metric: NDVI_METRIC,
    hemisphere,
    meteorologicalSeason: season,
    target,
    bounds,
    baseline,
    exclusions,
    differenceFromBaseline: target.observedValue! - baseline.mean,
    differenceUnit: NDVI_UNIT,
    samples,
    reason: null,
  };
}

function publicationStatusFor(
  dataMonth: YearMonth,
  availableThrough: YearMonth,
  validMonths: boolean
): NdviPublicationStatus {
  if (!validMonths || !isAvailable(LAYERS.ndvi, availableThrough)) {
    return "invalid-reference-month";
  }
  if (compareYm(dataMonth, LAYERS.ndvi.start) < 0) {
    return "outside-product-range";
  }
  return compareYm(dataMonth, availableThrough) > 0
    ? "not-yet-published"
    : "published";
}

function coverageFor(
  observation: NdviMonthlyObservation,
  validMonths: boolean
): NdviObservationCoverage {
  if (!validMonths) {
    return { status: "invalid", validFraction: null, reason: "invalid-month" };
  }
  const fraction = observation.validFraction;
  if (
    fraction !== undefined &&
    (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
  ) {
    return {
      status: "invalid",
      validFraction: null,
      reason: "invalid-coverage",
    };
  }
  if (observation.ndvi === null || fraction === 0) {
    return {
      status: "no-data",
      validFraction: fraction ?? null,
      reason: observation.ndvi === null ? "missing-value" : "zero-coverage",
    };
  }
  if (
    !Number.isFinite(observation.ndvi) ||
    observation.ndvi < -1 ||
    observation.ndvi > 1
  ) {
    return {
      status: "invalid",
      validFraction: fraction ?? null,
      reason: "invalid-value",
    };
  }
  return { status: "available", validFraction: fraction ?? null, reason: null };
}

function readinessForTarget(
  target: MonthlyNdviSummary,
  minimumValidFraction: number
): { status: NdviSeasonalBaselineStatus; reason: string } {
  if (target.publicationStatus === "invalid-reference-month") {
    return { status: "invalid", reason: target.publicationStatus };
  }
  if (target.publicationStatus !== "published") {
    return { status: "unavailable", reason: target.publicationStatus };
  }
  if (target.coverage.status === "invalid") {
    return { status: "invalid", reason: target.coverage.reason! };
  }
  if (target.coverage.status === "no-data") {
    return { status: "no-data", reason: target.coverage.reason! };
  }
  if (!meetsCoverage(target, minimumValidFraction)) {
    return {
      status: "insufficient-coverage",
      reason:
        target.coverage.validFraction === null
          ? "target-coverage-not-supplied"
          : "target-coverage-below-threshold",
    };
  }
  return { status: "available", reason: "" };
}

function meetsCoverage(
  summary: MonthlyNdviSummary,
  minimumValidFraction: number
): summary is MonthlyNdviSummary & {
  coverage: NdviObservationCoverage & { validFraction: number };
} {
  return (
    summary.coverage.status === "available" &&
    summary.coverage.validFraction !== null &&
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function baselineStats(
  samples: readonly NdviSeasonalBaselineSample[],
  requiredSampleCount: number,
  requiredValidFraction: number
): NdviSeasonalBaselineStatistics {
  if (samples.length === 0) {
    return emptyBaselineStats(requiredSampleCount, requiredValidFraction);
  }
  const values = samples.map((sample) => sample.ndvi);
  const mean = neumaierSum(values) / values.length;
  const variance =
    values.length < 2
      ? null
      : neumaierSum(values.map((value) => (value - mean) ** 2)) /
        (values.length - 1);
  const sampleStandardDeviation =
    variance === null ? null : Math.sqrt(variance);

  return {
    sampleCount: samples.length,
    requiredSampleCount,
    mean,
    min: Math.min(...values),
    max: Math.max(...values),
    sampleStandardDeviation,
    standardErrorOfMean:
      sampleStandardDeviation === null
        ? null
        : sampleStandardDeviation / Math.sqrt(samples.length),
    minimumValidFraction: Math.min(
      ...samples.map((sample) => sample.validFraction)
    ),
    requiredValidFraction,
  };
}

function emptyBaselineStats(
  requiredSampleCount: number,
  requiredValidFraction: number
): NdviSeasonalBaselineStatistics {
  return {
    sampleCount: 0,
    requiredSampleCount,
    mean: null,
    min: null,
    max: null,
    sampleStandardDeviation: null,
    standardErrorOfMean: null,
    minimumValidFraction: null,
    requiredValidFraction,
  };
}

function comparisonFor(
  status: NdviSeasonalBaselineStatus,
  hemisphere: Hemisphere,
  meteorologicalSeason: MeteorologicalSeason,
  target: MonthlyNdviSummary,
  bounds: NdviSeasonalBaselineBounds,
  baseline: NdviSeasonalBaselineStatistics,
  exclusions: NdviSeasonalBaselineExclusions,
  samples: NdviSeasonalBaselineSample[],
  reason: string
): NdviSeasonalBaselineComparison {
  return {
    kind: "same-calendar-month-ndvi-baseline",
    isForecast: false,
    status,
    metric: NDVI_METRIC,
    hemisphere,
    meteorologicalSeason,
    target,
    bounds,
    baseline,
    exclusions,
    differenceFromBaseline: null,
    differenceUnit: NDVI_UNIT,
    samples,
    reason,
  };
}

function emptyExclusions(): NdviSeasonalBaselineExclusions {
  return {
    wrongCalendarMonth: 0,
    outOfBounds: 0,
    duplicateYear: 0,
    missing: 0,
    invalid: 0,
    notYetPublished: 0,
    outsideProductRange: 0,
    insufficientCoverage: 0,
  };
}

function isCalendarMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function validYearBound(year: number | undefined): boolean {
  return year === undefined || Number.isInteger(year);
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
