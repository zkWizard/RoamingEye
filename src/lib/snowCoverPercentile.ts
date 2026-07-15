import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  SNOW_COVER_SOURCE_RESOLUTION,
  summarizeSnowCover,
  type SnowCoverObservation,
  type SnowCoverSummary,
} from "./snowCover";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Empirical percentile-of-record for a supplied monthly snow-cover value
 * (cryosphere).
 *
 * The snow layer renders MOD10CM: the per-cell monthly-average share of the
 * MODIS/Terra footprint flagged as snow, expressed as a percentage (0-100).
 * The plainest question a reader asks — *is this month's snow extent high or low
 * for here?* — cannot be answered from the raw percentage, because snow-covered
 * area carries a strong seasonal cycle: 30% in July and 30% in January mean very
 * different things at the same place. A percentage is only interpretable against
 * other percentages for the *same place and same calendar month*. Ranking snow
 * extent within its own same-month history is exactly how operational snow
 * monitoring frames a "low-snow" or "high-snow" month, for this reason.
 *
 * This helper describes only that empirical rank. It ranks one supplied target
 * observation against prior supplied observations for the same calendar month at
 * the same place. It gathers a same-calendar-month baseline with the same rigor
 * the climate baseline uses (deduplicates years, drops unpublished or low-
 * coverage months, excludes the target year, and enforces a minimum-sample
 * floor), then reports where the target falls as a non-exceedance percentile
 * plus the raw counts behind it. Snow is not a `ClimateMetric` — it is a bounded
 * fractional-area percentage rather than a native climate value — so the
 * gathering lives here rather than reusing seasonalBaseline.ts, but the
 * conventions match.
 *
 * It is a non-parametric descriptor — robust to a short or skewed record and
 * making no normality assumption — not an operational snow-cover percentile, a
 * climatological normal, or a probability of any future condition. Like every
 * snow helper it works on MOD10CM's monthly-average fractional snow-covered-area
 * percentage — never snow depth, snow-water-equivalent, melt or accumulation
 * rate, runoff, water volume, cause, or any future value. A `null` percentile
 * means "no rank can be stated", never "median".
 *
 * Pure, render-free logic (see snowCoverPercentile.test.ts). Provenance is
 * inherited from ./snowCover so a publication cites MOD10CM, not the picture.
 */

/** Ten same-calendar-month years is a conservative floor for a rank. */
export const MINIMUM_SNOW_PERCENTILE_SAMPLES = 10;

/** Require at least 60% usable sampled area when coverage is supplied. */
export const MINIMUM_SNOW_PERCENTILE_VALID_FRACTION = 0.6;

export const SNOW_COVER_PERCENTILE_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month observations for the same place — not an operational snow-cover percentile, a climatological normal, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same place because monthly-average snow-covered area carries a strong seasonal cycle; a cross-month or cross-place rank would be misleading.",
  "The non-exceedance percentile uses the mid-rank convention F = (below + tied/2) / n; the raw below/tied/above counts are reported so any other plotting-position convention can be recomputed.",
  "Empirical percentiles from a limited record are uncertain and cannot fall outside the sampled range; this description never infers snow depth, snow-water-equivalent, melt, accumulation, runoff, water volume, cause, or any future value.",
] as const;

export type SnowCoverPercentileStatus =
  | "available"
  | "not-yet-published"
  | "insufficient-samples"
  | "insufficient-coverage"
  | "no-data"
  | "invalid";

/** Why a same-calendar-month candidate was not counted, for auditability. */
export interface SnowCoverPercentileExclusions {
  wrongCalendarMonth: number;
  outOfBounds: number;
  duplicateYear: number;
  notYetPublished: number;
  missing: number;
  invalid: number;
  insufficientCoverage: number;
}

/** One retained prior same-calendar-month observation the target was ranked against. */
export interface SnowCoverPercentileSample {
  dataMonth: YearMonth;
  /** Monthly-average snow-covered-area percentage (0-100). */
  snowCoveredPercent: number;
  /** Usable share of the sampled area (0-1), or null when not supplied. */
  validFraction: number | null;
  publicationLagMonths: number;
}

export interface SnowCoverPercentileOptions {
  /** Minimum retained same-calendar-month observations needed for a rank. */
  minimumSamples?: number;
  /** Minimum valid spatial fraction for target and baseline observations. */
  minimumValidFraction?: number;
  /** Optional inclusive first year for the baseline candidate window. */
  baselineStartYear?: number;
  /** Optional inclusive last year; defaults to the year before the target. */
  baselineEndYear?: number;
}

export interface SnowCoverPercentileResult {
  kind: "snow-cover-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-place-same-calendar-month-record-only";
  dataset: DatasetRef;
  sourceResolution: string;
  status: SnowCoverPercentileStatus;
  /** Single-month summary of the ranked target, retained for provenance. */
  target: SnowCoverSummary;
  /** Calendar month (1-12) the rank is confined to, or null when invalid. */
  calendarMonth: number | null;
  /** Inclusive first baseline year considered, or null when unbounded. */
  baselineStartYear: number | null;
  /** Inclusive last baseline year considered, or null when target year invalid. */
  baselineEndYear: number | null;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  exclusions: SnowCoverPercentileExclusions;
  /** Retained baseline samples, sorted oldest to newest for auditability. */
  samples: SnowCoverPercentileSample[];
  /** Baseline months with strictly less snow-covered area than the target. */
  lowerRecordCount: number | null;
  /** Baseline months with strictly more snow-covered area than the target. */
  higherRecordCount: number | null;
  /** Baseline months whose value equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0-100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0-1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month has less snow (target at/below record minimum). */
  isLeastInRecord: boolean | null;
  /** True when no baseline month has more snow (target at/above record maximum). */
  isGreatestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly snow-cover observation within prior supplied
 * observations for the same calendar month at the same place.
 *
 * A percentile is reported only when the target is a published, usable month and
 * the record clears the sample and coverage floors; every other state passes
 * through with a `null` percentile and a machine-readable reason. A `null`
 * percentile therefore means "no rank can be stated", never "median".
 */
export function describeSnowCoverPercentile(
  targetObservation: SnowCoverObservation,
  priorSameMonthObservations: readonly SnowCoverObservation[],
  availableThrough: YearMonth,
  options: SnowCoverPercentileOptions = {}
): SnowCoverPercentileResult {
  const target = summarizeSnowCover(targetObservation, availableThrough);
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_SNOW_PERCENTILE_SAMPLES;
  const minimumValidFraction =
    options.minimumValidFraction ?? MINIMUM_SNOW_PERCENTILE_VALID_FRACTION;
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
  const rawEndYear =
    options.baselineEndYear ?? targetObservation.dataMonth.year - 1;
  const baselineEndYear = Number.isInteger(rawEndYear) ? rawEndYear : null;
  const exclusions = emptyExclusions();

  const base = {
    kind: "snow-cover-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-place-same-calendar-month-record-only",
    dataset: SNOW_COVER_DATASET,
    sourceResolution: SNOW_COVER_SOURCE_RESOLUTION,
    target,
    calendarMonth: targetMonth,
    baselineStartYear: options.baselineStartYear ?? null,
    baselineEndYear,
    limitations: SNOW_COVER_PERCENTILE_LIMITATIONS,
  } as const;

  const unavailable = (
    status: SnowCoverPercentileStatus,
    samples: SnowCoverPercentileSample[],
    reason: string
  ): SnowCoverPercentileResult => ({
    ...base,
    status,
    sampleCount: samples.length,
    exclusions,
    samples,
    lowerRecordCount: null,
    higherRecordCount: null,
    tiedRecordCount: null,
    percentileRank: null,
    exceedanceProbability: null,
    isLeastInRecord: null,
    isGreatestInRecord: null,
    reason,
  });

  if (!validOptions || targetMonth === null || baselineEndYear === null) {
    return unavailable("invalid", [], "invalid-baseline-configuration");
  }

  // Gather the same-calendar-month baseline with the same guards the climate
  // baseline uses: same month only, within the year window, one value per year,
  // published, usable, and clearing the coverage floor. The target year is
  // excluded via the default end year (target year − 1).
  const seenYears = new Set<number>();
  const samples: SnowCoverPercentileSample[] = [];
  let coverageEligibleCount = 0;

  for (const candidate of priorSameMonthObservations) {
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

    const summary = summarizeSnowCover(candidate, availableThrough);
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
      summary.snowCoveredPercent === null ||
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
      dataMonth: candidate.dataMonth,
      snowCoveredPercent: summary.snowCoveredPercent,
      validFraction: summary.coverage.validFraction,
      publicationLagMonths: summary.publicationLagMonths,
    });
  }

  samples.sort((a, b) => a.dataMonth.year - b.dataMonth.year);

  // The target must itself be a published, usable month before any rank.
  const targetStatus = targetReadiness(target, minimumValidFraction);
  if (targetStatus.status !== "available") {
    return unavailable(
      targetStatus.status,
      samples,
      targetStatus.reason ?? "target-not-available"
    );
  }

  // Distinguish "too few years even existed" from "years existed but coverage
  // thinned them below the floor", exactly as the climate baseline does.
  if (
    coverageEligibleCount >= minimumSamples &&
    samples.length < minimumSamples
  ) {
    return unavailable(
      "insufficient-coverage",
      samples,
      "baseline-coverage-below-threshold"
    );
  }
  if (samples.length < minimumSamples) {
    return unavailable(
      "insufficient-samples",
      samples,
      "too-few-same-calendar-month-samples"
    );
  }

  const value = target.snowCoveredPercent as number;
  const count = samples.length;
  let lower = 0;
  let higher = 0;
  let tied = 0;
  for (const sample of samples) {
    if (sample.snowCoveredPercent < value) lower += 1;
    else if (sample.snowCoveredPercent > value) higher += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target, splitting exact ties evenly. Symmetric to exceedance, so
  // percentileRank/100 + exceedanceProbability === 1 by construction.
  const nonExceedance = (lower + tied / 2) / count;
  return {
    ...base,
    status: "available",
    sampleCount: count,
    exclusions,
    samples,
    lowerRecordCount: lower,
    higherRecordCount: higher,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (higher + tied / 2) / count,
    isLeastInRecord: lower === 0,
    isGreatestInRecord: higher === 0,
    reason: null,
  };
}

function targetReadiness(
  target: SnowCoverSummary,
  minimumValidFraction: number
): { status: SnowCoverPercentileStatus; reason: string | null } {
  if (target.publicationStatus === "not-yet-published") {
    return { status: "not-yet-published", reason: "target-not-yet-published" };
  }
  if (target.publicationStatus === "invalid-reference-month") {
    return { status: "invalid", reason: "invalid-month" };
  }
  if (target.coverage.status === "invalid") {
    return { status: "invalid", reason: target.coverage.reason };
  }
  if (target.coverage.status === "no-data") {
    return { status: "no-data", reason: target.coverage.reason };
  }
  if (target.snowCoveredPercent === null) {
    return { status: "no-data", reason: "missing-value" };
  }
  if (!meetsCoverage(target, minimumValidFraction)) {
    return {
      status: "insufficient-coverage",
      reason: "target-coverage-below-threshold",
    };
  }
  return { status: "available", reason: null };
}

/**
 * True when a summary's supplied coverage clears the floor. A summary whose
 * sampler supplied no coverage (validFraction null) passes, mirroring the
 * climate baseline: absence of coverage is not treated as insufficient
 * coverage.
 */
function meetsCoverage(
  summary: SnowCoverSummary,
  minimumValidFraction: number
): boolean {
  return (
    summary.coverage.validFraction === null ||
    summary.coverage.validFraction >= minimumValidFraction
  );
}

function emptyExclusions(): SnowCoverPercentileExclusions {
  return {
    wrongCalendarMonth: 0,
    outOfBounds: 0,
    duplicateYear: 0,
    notYetPublished: 0,
    missing: 0,
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
