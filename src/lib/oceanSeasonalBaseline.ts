import {
  summarizeOceanConditions,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureObservation,
  type SstFootprint,
} from "./oceanConditions";
import type { YearMonth } from "./timeline";

/**
 * Source-aware same-calendar-month sea-surface-temperature anomalies.
 *
 * These helpers describe one supplied MODIS/Aqua SST observation relative to
 * prior supplied SST observations for the SAME calendar month at the SAME
 * surface footprint (open water vs. land-mixed coastal). They retain the source
 * unit, sampling coverage, and sampling uncertainty; they never borrow adjacent
 * months, fill missing years, mix open-water and coastal footprints, infer
 * biological abundance or ecosystem health, attribute causes, score risk, or
 * forecast future ocean temperatures. An anomaly here is an arithmetic
 * difference from a short observed record, not a climate-normal departure.
 */

/** Ten same-calendar-month years is a conservative floor for comparisons. */
export const MINIMUM_OCEAN_SEASONAL_BASELINE_SAMPLES = 10;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_OCEAN_SEASONAL_VALID_FRACTION = 0.6;

export type OceanSeasonalBaselineStatus =
  | "available"
  | "land"
  | "no-data"
  | "insufficient-samples"
  | "insufficient-coverage"
  | "invalid";

/** Footprints whose coverage yields a usable SST value for comparison. */
export type UsableSstFootprint = "water" | "land-mixed-coastal";

export interface OceanSeasonalBaselineOptions {
  /** Minimum retained same-calendar-month observations needed for an anomaly. */
  minimumSamples?: number;
  /** Minimum valid spatial fraction for target and baseline observations. */
  minimumValidFraction?: number;
  /** Optional inclusive first year for the baseline candidate window. */
  baselineStartYear?: number;
  /** Optional inclusive last year; defaults to the year before the target. */
  baselineEndYear?: number;
}

export interface OceanSeasonalBaselineBounds {
  startYear: number | null;
  endYear: number | null;
  calendarMonth: number | null;
  /** Footprint the baseline is restricted to, echoing the target when usable. */
  footprint: UsableSstFootprint | null;
}

export interface OceanSeasonalBaselineExclusions {
  wrongCalendarMonth: number;
  outOfBounds: number;
  duplicateYear: number;
  /** Land, missing, invalid, or a footprint that differs from the target. */
  footprintMismatch: number;
  invalid: number;
  insufficientCoverage: number;
}

export interface OceanSeasonalBaselineSample {
  month: YearMonth;
  value: number;
  validFraction: number;
  footprint: UsableSstFootprint;
}

export interface OceanSeasonalBaselineStatistics {
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

export interface OceanSeasonalBaselineComparison {
  kind: "same-calendar-month-sst-baseline";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: OceanSeasonalBaselineStatus;
  metric: OceanConditionSummary["metric"];
  target: OceanConditionSummary;
  bounds: OceanSeasonalBaselineBounds;
  baseline: OceanSeasonalBaselineStatistics;
  exclusions: OceanSeasonalBaselineExclusions;
  /** Target observed SST minus same-calendar-month, same-footprint mean. */
  anomaly: number | null;
  /** Same unit as `metric.sourceUnit`; no display conversion is done. */
  anomalyUnit: string;
  /**
   * Anomaly divided by the baseline sample standard deviation, when it is
   * defined and non-zero. A unitless framing of how unusual this month is
   * within the short observed record, not a significance test.
   */
  standardizedAnomaly: number | null;
  /** Retained baseline samples, sorted oldest to newest for auditability. */
  samples: OceanSeasonalBaselineSample[];
  /** Short machine-readable reason when no anomaly is reported. */
  reason: string | null;
}

/**
 * Compare one supplied monthly SST observation to prior supplied SST
 * observations from the same calendar month and the same surface footprint.
 * The baseline excludes the target year by default, never fills missing years,
 * and never mixes open-water with land-mixed coastal footprints.
 */
export function compareSstToSeasonalBaseline(
  targetObservation: SeaSurfaceTemperatureObservation,
  baselineCandidates: readonly SeaSurfaceTemperatureObservation[],
  options: OceanSeasonalBaselineOptions = {}
): OceanSeasonalBaselineComparison {
  const target = summarizeOceanConditions(targetObservation);
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_OCEAN_SEASONAL_BASELINE_SAMPLES;
  const minimumValidFraction =
    options.minimumValidFraction ?? MINIMUM_OCEAN_SEASONAL_VALID_FRACTION;
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
  const targetFootprint = usableFootprint(target);
  const baselineEndYear =
    options.baselineEndYear ?? targetObservation.dataMonth.year - 1;
  const bounds: OceanSeasonalBaselineBounds = {
    startYear: options.baselineStartYear ?? null,
    endYear: Number.isInteger(baselineEndYear) ? baselineEndYear : null,
    calendarMonth: targetMonth,
    footprint: targetFootprint,
  };
  const exclusions = emptyExclusions();
  const empty = emptyBaselineStats(minimumSamples, minimumValidFraction);

  if (!validOptions || targetMonth === null || bounds.endYear === null) {
    return comparisonFor(
      "invalid",
      target,
      bounds,
      empty,
      exclusions,
      [],
      "invalid-baseline-configuration"
    );
  }

  const targetStatus = targetReadiness(target, minimumValidFraction);
  if (targetStatus.status !== "available") {
    // Without a usable target footprint there is nothing to compare against.
    return comparisonFor(
      targetStatus.status,
      target,
      bounds,
      empty,
      exclusions,
      [],
      targetStatus.reason
    );
  }

  const seenYears = new Set<number>();
  const samples: OceanSeasonalBaselineSample[] = [];
  let coverageEligibleCount = 0;

  for (const candidate of baselineCandidates) {
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
    if (seenYears.has(candidate.dataMonth.year)) {
      exclusions.duplicateYear += 1;
      continue;
    }
    seenYears.add(candidate.dataMonth.year);

    const summary = summarizeOceanConditions(candidate);
    const footprint = usableFootprint(summary);
    if (footprint === null || footprint !== targetFootprint) {
      // Land, missing, invalid, or a footprint that differs from the target:
      // mixing open water with land-mixed coastal would not be like-for-like.
      exclusions.footprintMismatch += 1;
      continue;
    }

    coverageEligibleCount += 1;
    if (!meetsCoverage(summary, minimumValidFraction)) {
      exclusions.insufficientCoverage += 1;
      continue;
    }

    samples.push({
      month: candidate.dataMonth,
      value: summary.observedValue as number,
      validFraction: summary.coverage.validFraction as number,
      footprint,
    });
  }

  samples.sort((a, b) => a.month.year - b.month.year);

  const baseline = baselineStats(samples, minimumSamples, minimumValidFraction);
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

  const anomaly = (target.observedValue as number) - baseline.mean;
  return {
    kind: "same-calendar-month-sst-baseline",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status: "available",
    metric: target.metric,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly,
    anomalyUnit: target.metric.sourceUnit,
    standardizedAnomaly: standardize(anomaly, baseline.sampleStandardDeviation),
    samples,
    reason: null,
  };
}

function comparisonFor(
  status: OceanSeasonalBaselineStatus,
  target: OceanConditionSummary,
  bounds: OceanSeasonalBaselineBounds,
  baseline: OceanSeasonalBaselineStatistics,
  exclusions: OceanSeasonalBaselineExclusions,
  samples: OceanSeasonalBaselineSample[],
  reason: string
): OceanSeasonalBaselineComparison {
  return {
    kind: "same-calendar-month-sst-baseline",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status,
    metric: target.metric,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly: null,
    anomalyUnit: target.metric.sourceUnit,
    standardizedAnomaly: null,
    samples,
    reason,
  };
}

function targetReadiness(
  target: OceanConditionSummary,
  minimumValidFraction: number
): { status: OceanSeasonalBaselineStatus; reason: string } {
  switch (target.coverage.status) {
    case "invalid":
      return { status: "invalid", reason: target.coverage.reason ?? "invalid" };
    case "land":
      return { status: "land", reason: "target-land-footprint" };
    case "missing":
      return { status: "no-data", reason: "target-missing-sst" };
    case "water":
    case "land-mixed-coastal":
      if (!meetsCoverage(target, minimumValidFraction)) {
        return {
          status: "insufficient-coverage",
          reason: "target-coverage-below-threshold",
        };
      }
      return { status: "available", reason: "" };
  }
}

/**
 * The footprint whose coverage yields a usable SST value, or null when the
 * summary is land, missing, or invalid. Coastal and open-water SST are kept
 * distinct so a baseline never averages across them.
 */
function usableFootprint(
  summary: OceanConditionSummary
): UsableSstFootprint | null {
  if (summary.observedValue === null) return null;
  if (
    summary.coverage.status === "water" ||
    summary.coverage.status === "land-mixed-coastal"
  ) {
    return summary.coverage.status;
  }
  return null;
}

function meetsCoverage(
  summary: OceanConditionSummary,
  minimumValidFraction: number
): summary is OceanConditionSummary & {
  coverage: { validFraction: number };
} {
  return (
    summary.coverage.validFraction !== null &&
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function standardize(
  anomaly: number,
  sampleStandardDeviation: number | null
): number | null {
  if (sampleStandardDeviation === null || sampleStandardDeviation === 0) {
    return null;
  }
  return anomaly / sampleStandardDeviation;
}

function baselineStats(
  samples: readonly OceanSeasonalBaselineSample[],
  requiredSampleCount: number,
  requiredValidFraction: number
): OceanSeasonalBaselineStatistics {
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
): OceanSeasonalBaselineStatistics {
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

function emptyExclusions(): OceanSeasonalBaselineExclusions {
  return {
    wrongCalendarMonth: 0,
    outOfBounds: 0,
    duplicateYear: 0,
    footprintMismatch: 0,
    invalid: 0,
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

// Re-exported for consumers that already work with the SST footprint union.
export type { SstFootprint };
