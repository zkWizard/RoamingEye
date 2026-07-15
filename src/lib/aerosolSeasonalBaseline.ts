import {
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  summarizeAerosolLoading,
  type AerosolLoadingSummary,
  type AerosolObservation,
} from "./aerosolLoading";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Source-aware same-calendar-month aerosol optical depth (AOD) baselines.
 *
 * The atmosphere layer renders MERRA-2 total aerosol optical thickness at
 * 550 nm — a dimensionless, column-integrated extinction measure with a strong
 * seasonal cycle: dust seasons, biomass-burning seasons, and synoptic haze all
 * imprint a repeating within-year shape on column loading. Because of that
 * seasonality the plainest question a reader asks — *is this month hazy or clear
 * for here?* — cannot be read off the raw AOD alone; a value is only meaningful
 * against other values for the SAME calendar month at the SAME place.
 *
 * This helper describes one supplied monthly AOD observation relative to prior
 * supplied observations for the same calendar month, mirroring the audited
 * climate baseline machinery in seasonalBaseline.ts: it deduplicates years,
 * drops unpublished or low-coverage months, excludes the target year by default,
 * and enforces a minimum-sample floor. It reports the arithmetic anomaly
 * (target minus same-month mean) and a unitless standardized anomaly.
 *
 * Scientific honesty (kept in the code because callers surface it):
 *  - AOD at 550 nm is a whole-column optical thickness, NOT a surface
 *    concentration and NOT a regulatory air-quality or health index.
 *  - MERRA-2 is a reanalysis (a model constrained by assimilated observations),
 *    so a value is a modelled monthly mean, not a direct pixel measurement.
 *  - An anomaly here is an arithmetic difference from a short observed record,
 *    not a 30-year climate-normal departure. The standardized anomaly is a
 *    unitless framing of how unusual the month is within that short record, not
 *    a significance test, an exceedance probability, or a forecast.
 *  - Ranking is restricted to one calendar month at one place because the AOD
 *    seasonal cycle is large; a cross-month or cross-place anomaly would mislead.
 *    Same-place grouping is the caller's responsibility (as in seasonalBaseline);
 *    this helper never mixes months it is handed.
 *
 * Pure, render-free logic (see aerosolSeasonalBaseline.test.ts).
 */

/** Ten same-calendar-month years is a conservative floor for comparisons. */
export const MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES = 10;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_AEROSOL_SEASONAL_VALID_FRACTION = 0.6;

/** Honest scope limits shared by the aerosol baseline descriptors. */
export const AEROSOL_SEASONAL_BASELINE_LIMITATIONS = [
  "AOD at 550 nm is a whole-column optical thickness, not a surface concentration or a regulatory air-quality or health index.",
  "MERRA-2 is a reanalysis (a model constrained by assimilated observations), so a value is a modelled monthly mean, not a direct pixel measurement.",
  "The anomaly is target minus the mean of a short supplied record of prior same-calendar-month observations for the same place — not a 30-year climate-normal departure.",
  "The standardized anomaly divides that anomaly by the baseline sample standard deviation; it is a unitless framing of how unusual the month is within the short record, not a significance test, an exceedance probability, or a forecast.",
  "Comparison is restricted to one calendar month at one place because the aerosol seasonal cycle is large; same-place grouping is the caller's responsibility and this helper never borrows adjacent months or fills missing years.",
] as const;

export type AerosolSeasonalBaselineStatus =
  | "available"
  | "unavailable"
  | "not-yet-published"
  | "insufficient-samples"
  | "insufficient-coverage"
  | "no-data"
  | "invalid";

export interface AerosolSeasonalBaselineOptions {
  /** Minimum retained same-calendar-month observations needed for an anomaly. */
  minimumSamples?: number;
  /** Minimum valid spatial fraction for target and baseline observations. */
  minimumValidFraction?: number;
  /** Optional inclusive first year for the baseline candidate window. */
  baselineStartYear?: number;
  /** Optional inclusive last year; defaults to the year before the target. */
  baselineEndYear?: number;
}

export interface AerosolSeasonalBaselineBounds {
  startYear: number | null;
  endYear: number | null;
  calendarMonth: number | null;
}

export interface AerosolSeasonalBaselineExclusions {
  wrongCalendarMonth: number;
  outOfBounds: number;
  duplicateYear: number;
  missing: number;
  invalid: number;
  notYetPublished: number;
  insufficientCoverage: number;
}

export interface AerosolSeasonalBaselineSample {
  month: YearMonth;
  /** Dimensionless AOD at 550 nm. */
  value: number;
  validFraction: number;
  publicationLagMonths: number;
}

export interface AerosolSeasonalBaselineStatistics {
  sampleCount: number;
  requiredSampleCount: number;
  /** Dimensionless AOD; no display conversion is done. */
  mean: number | null;
  min: number | null;
  max: number | null;
  sampleStandardDeviation: number | null;
  standardErrorOfMean: number | null;
  minimumValidFraction: number | null;
  requiredValidFraction: number;
}

export interface AerosolSeasonalBaselineComparison {
  kind: "same-calendar-month-aerosol-baseline";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-column-aerosol-optical-depth-only";
  status: AerosolSeasonalBaselineStatus;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  target: AerosolLoadingSummary;
  bounds: AerosolSeasonalBaselineBounds;
  baseline: AerosolSeasonalBaselineStatistics;
  exclusions: AerosolSeasonalBaselineExclusions;
  /** Target observed AOD minus same-calendar-month baseline mean. */
  anomaly: number | null;
  /** Dimensionless, matching the column optical-thickness product. */
  anomalyUnit: string;
  /**
   * Anomaly divided by the baseline sample standard deviation, when it is
   * defined and non-zero. A unitless framing of how unusual this month is within
   * the short observed record, not a significance test.
   */
  standardizedAnomaly: number | null;
  /** Retained baseline samples, sorted oldest to newest for auditability. */
  samples: AerosolSeasonalBaselineSample[];
  /** Short machine-readable reason when no anomaly is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Compare one supplied monthly AOD observation to prior supplied observations
 * from the same calendar month. The baseline never borrows adjacent months,
 * never fills missing years, and excludes the target year by default. Both the
 * target and every baseline sample must be a published month with usable
 * coverage; a `null` anomaly always means "no anomaly can be stated", never
 * "average".
 */
export function compareAerosolToSeasonalBaseline(
  targetObservation: AerosolObservation,
  baselineCandidates: readonly AerosolObservation[],
  availableThrough: YearMonth,
  options: AerosolSeasonalBaselineOptions = {}
): AerosolSeasonalBaselineComparison {
  const target = summarizeAerosolLoading(targetObservation, availableThrough);
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_AEROSOL_SEASONAL_BASELINE_SAMPLES;
  const minimumValidFraction =
    options.minimumValidFraction ?? MINIMUM_AEROSOL_SEASONAL_VALID_FRACTION;
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
  const bounds: AerosolSeasonalBaselineBounds = {
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

  const seenYears = new Set<number>();
  const samples: AerosolSeasonalBaselineSample[] = [];
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

    const summary = summarizeAerosolLoading(candidate, availableThrough);
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

  const anomaly = (target.observedValue as number) - baseline.mean;
  return {
    kind: "same-calendar-month-aerosol-baseline",
    isForecast: false,
    claimScope: "descriptive-column-aerosol-optical-depth-only",
    status: "available",
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly,
    anomalyUnit: AEROSOL_UNIT,
    standardizedAnomaly: standardize(anomaly, baseline.sampleStandardDeviation),
    samples,
    reason: null,
    limitations: AEROSOL_SEASONAL_BASELINE_LIMITATIONS,
  };
}

function comparisonFor(
  status: AerosolSeasonalBaselineStatus,
  target: AerosolLoadingSummary,
  bounds: AerosolSeasonalBaselineBounds,
  baseline: AerosolSeasonalBaselineStatistics,
  exclusions: AerosolSeasonalBaselineExclusions,
  samples: AerosolSeasonalBaselineSample[],
  reason: string
): AerosolSeasonalBaselineComparison {
  return {
    kind: "same-calendar-month-aerosol-baseline",
    isForecast: false,
    claimScope: "descriptive-column-aerosol-optical-depth-only",
    status,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    target,
    bounds,
    baseline,
    exclusions,
    anomaly: null,
    anomalyUnit: AEROSOL_UNIT,
    standardizedAnomaly: null,
    samples,
    reason,
    limitations: AEROSOL_SEASONAL_BASELINE_LIMITATIONS,
  };
}

function targetReadiness(
  target: AerosolLoadingSummary,
  minimumValidFraction: number
): { status: AerosolSeasonalBaselineStatus; reason: string | null } {
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
  summary: AerosolLoadingSummary,
  minimumValidFraction: number
): summary is AerosolLoadingSummary & {
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
  samples: readonly AerosolSeasonalBaselineSample[],
  requiredSampleCount: number,
  requiredValidFraction: number
): AerosolSeasonalBaselineStatistics {
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
): AerosolSeasonalBaselineStatistics {
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

function emptyExclusions(): AerosolSeasonalBaselineExclusions {
  return {
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
