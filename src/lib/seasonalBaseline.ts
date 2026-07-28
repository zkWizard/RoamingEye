import {
  summarizeMonthlyClimate,
  type ClimateMetric,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import type { YearMonth } from "./timeline";

/**
 * Source-aware same-calendar-month baseline comparisons.
 *
 * These helpers describe supplied monthly climate observations relative to
 * prior supplied observations for the same calendar month. They retain source
 * units, publication lag, missing data, and sampling uncertainty; they do not
 * forecast weather, issue alerts, diagnose hazards, score risk, predict
 * drought, or attribute causes.
 */

/** Ten same-calendar-month years is a conservative floor for comparisons. */
export const MINIMUM_SEASONAL_BASELINE_SAMPLES = 10;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_SEASONAL_VALID_FRACTION = 0.6;

export type SeasonalBaselineStatus =
  | "available"
  | "unavailable"
  | "not-yet-published"
  | "insufficient-samples"
  | "insufficient-coverage"
  | "no-data"
  | "invalid";

export interface SeasonalBaselineOptions {
  /** Minimum retained same-calendar-month observations needed for an anomaly. */
  minimumSamples?: number;
  /** Minimum valid spatial fraction for target and baseline observations. */
  minimumValidFraction?: number;
  /** Optional inclusive first year for the baseline candidate window. */
  baselineStartYear?: number;
  /** Optional inclusive last year; defaults to the year before the target. */
  baselineEndYear?: number;
}

export interface SeasonalBaselineBounds {
  startYear: number | null;
  endYear: number | null;
  calendarMonth: number | null;
}

export interface SeasonalBaselineExclusions {
  wrongMetric: number;
  wrongCalendarMonth: number;
  outOfBounds: number;
  duplicateYear: number;
  missing: number;
  invalid: number;
  notYetPublished: number;
  insufficientCoverage: number;
}

export interface SeasonalBaselineSample {
  month: YearMonth;
  value: number;
  validFraction: number;
  publicationLagMonths: number;
}

export interface SeasonalBaselineStatistics {
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

export interface SeasonalBaselineComparison {
  kind: "same-calendar-month-climate-baseline";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SeasonalBaselineStatus;
  metric: ClimateMetric;
  target: MonthlyClimateSummary;
  bounds: SeasonalBaselineBounds;
  baseline: SeasonalBaselineStatistics;
  exclusions: SeasonalBaselineExclusions;
  /** Target observed value minus same-calendar-month baseline mean. */
  anomaly: number | null;
  /** Same native unit as `metric.nativeUnit`; no display conversion is done. */
  anomalyUnit: string;
  /** Retained baseline samples, sorted oldest to newest for auditability. */
  samples: SeasonalBaselineSample[];
  /** Short machine-readable reason when no anomaly is reported. */
  reason: string | null;
}

/**
 * Compare one supplied monthly observation to prior supplied observations from
 * the same metric and same calendar month. The baseline never borrows adjacent
 * months, never fills missing years, and excludes the target year by default.
 */
export function compareMonthlyClimateToSeasonalBaseline(
  targetObservation: MonthlyClimateObservation,
  baselineCandidates: readonly MonthlyClimateObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): SeasonalBaselineComparison {
  const target = summarizeMonthlyClimate(targetObservation, availableThrough);
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_SEASONAL_BASELINE_SAMPLES;
  const minimumValidFraction =
    options.minimumValidFraction ?? MINIMUM_SEASONAL_VALID_FRACTION;
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
  const targetMonth = isCalendarMonth(targetObservation.dataMonth)
    ? targetObservation.dataMonth.month
    : null;
  const baselineEndYear =
    options.baselineEndYear ?? targetObservation.dataMonth.year - 1;
  const bounds: SeasonalBaselineBounds = {
    startYear: options.baselineStartYear ?? null,
    endYear: Number.isInteger(baselineEndYear) ? baselineEndYear : null,
    calendarMonth: targetMonth,
  };
  const exclusions = emptyExclusions();

  if (!validOptions || targetMonth === null || bounds.endYear === null) {
    return comparisonFor(
      "invalid",
      target,
      bounds,
      emptyBaselineStats(minimumSamples, minimumValidFraction),
      exclusions,
      [],
      "invalid-baseline-configuration"
    );
  }

  const samples: SeasonalBaselineSample[] = [];
  let coverageEligibleCount = 0;

  const candidateYearCounts = new Map<number, number>();
  for (const candidate of baselineCandidates) {
    if (
      candidate.metricId === targetObservation.metricId &&
      isCalendarMonth(candidate.dataMonth) &&
      candidate.dataMonth.month === targetMonth &&
      (options.baselineStartYear === undefined ||
        candidate.dataMonth.year >= options.baselineStartYear) &&
      candidate.dataMonth.year <= baselineEndYear
    ) {
      candidateYearCounts.set(
        candidate.dataMonth.year,
        (candidateYearCounts.get(candidate.dataMonth.year) ?? 0) + 1
      );
    }
  }

  for (const candidate of baselineCandidates) {
    if (candidate.metricId !== targetObservation.metricId) {
      exclusions.wrongMetric += 1;
      continue;
    }
    if (!isCalendarMonth(candidate.dataMonth)) {
      exclusions.invalid += 1;
      continue;
    }
    if (candidate.dataMonth.month !== targetMonth) {
      exclusions.wrongCalendarMonth += 1;
      continue;
    }
    if (
      (options.baselineStartYear !== undefined &&
        candidate.dataMonth.year < options.baselineStartYear) ||
      candidate.dataMonth.year > baselineEndYear
    ) {
      exclusions.outOfBounds += 1;
      continue;
    }
    // Multiple source records for one calendar month are ambiguous. Exclude
    // the whole year so baseline membership cannot depend on input ordering.
    if ((candidateYearCounts.get(candidate.dataMonth.year) ?? 0) > 1) {
      exclusions.duplicateYear += 1;
      continue;
    }

    const summary = summarizeMonthlyClimate(candidate, availableThrough);
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
      summary.publicationLagMonths === null
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
      month: candidate.dataMonth,
      value: summary.observedValue,
      validFraction: summary.coverage.validFraction,
      publicationLagMonths: summary.publicationLagMonths,
    });
  }

  samples.sort((a, b) => a.month.year - b.month.year);

  const baseline = baselineStats(samples, minimumSamples, minimumValidFraction);
  const targetStatus = targetReadiness(target, minimumValidFraction);
  if (targetStatus.status !== "available") {
    return comparisonFor(
      targetStatus.status,
      target,
      bounds,
      baseline,
      exclusions,
      samples,
      targetStatus.reason ?? "target-not-available"
    );
  }
  if (
    coverageEligibleCount >= minimumSamples &&
    samples.length < minimumSamples
  ) {
    return comparisonFor(
      "insufficient-coverage",
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
      target,
      bounds,
      baseline,
      exclusions,
      samples,
      "too-few-same-calendar-month-samples"
    );
  }

  return {
    kind: "same-calendar-month-climate-baseline",
    isForecast: false,
    status: "available",
    metric: target.metric,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly: target.observedValue! - baseline.mean,
    anomalyUnit: target.metric.nativeUnit,
    samples,
    reason: null,
  };
}

function comparisonFor(
  status: SeasonalBaselineStatus,
  target: MonthlyClimateSummary,
  bounds: SeasonalBaselineBounds,
  baseline: SeasonalBaselineStatistics,
  exclusions: SeasonalBaselineExclusions,
  samples: SeasonalBaselineSample[],
  reason: string
): SeasonalBaselineComparison {
  return {
    kind: "same-calendar-month-climate-baseline",
    isForecast: false,
    status,
    metric: target.metric,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly: null,
    anomalyUnit: target.metric.nativeUnit,
    samples,
    reason,
  };
}

function targetReadiness(
  target: MonthlyClimateSummary,
  minimumValidFraction: number
): { status: SeasonalBaselineStatus; reason: string | null } {
  if (target.publicationStatus === "not-yet-published") {
    return { status: "not-yet-published", reason: "target-not-yet-published" };
  }
  if (target.publicationStatus === "invalid-reference-month") {
    return { status: "invalid", reason: "invalid-month" };
  }
  if (target.coverage.status === "invalid") {
    return { status: "invalid", reason: target.coverage.reason };
  }
  if (target.publicationStatus !== "published") {
    return {
      status: "unavailable",
      reason: `target-${target.publicationStatus}`,
    };
  }
  if (target.coverage.status === "no-data") {
    return { status: "no-data", reason: target.coverage.reason };
  }
  if (!meetsCoverage(target, minimumValidFraction)) {
    return {
      status: "insufficient-coverage",
      reason: "target-coverage-below-threshold",
    };
  }
  return { status: "available", reason: null };
}

function meetsCoverage(
  summary: MonthlyClimateSummary,
  minimumValidFraction: number
): summary is MonthlyClimateSummary & {
  coverage: { validFraction: number };
} {
  return (
    summary.coverage.validFraction !== null &&
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function baselineStats(
  samples: readonly SeasonalBaselineSample[],
  requiredSampleCount: number,
  requiredValidFraction: number
): SeasonalBaselineStatistics {
  if (samples.length === 0) {
    return emptyBaselineStats(requiredSampleCount, requiredValidFraction);
  }
  const values = samples.map((sample) => sample.value);
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const variance =
    values.length < 2
      ? null
      : values.reduce((sum, value) => sum + (value - mean) ** 2, 0) /
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
): SeasonalBaselineStatistics {
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

function emptyExclusions(): SeasonalBaselineExclusions {
  return {
    wrongMetric: 0,
    wrongCalendarMonth: 0,
    outOfBounds: 0,
    duplicateYear: 0,
    missing: 0,
    invalid: 0,
    notYetPublished: 0,
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

function validYearBound(year: number | undefined): boolean {
  return year === undefined || Number.isInteger(year);
}
