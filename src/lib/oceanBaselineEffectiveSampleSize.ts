import { neumaierSum } from "./numerics";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type {
  OceanSeasonalBaselineComparison,
  OceanSeasonalBaselineSample,
  UsableSstFootprint,
} from "./oceanSeasonalBaseline";

/**
 * Serial-correlation cost of a same-calendar-month sea-surface-temperature
 * baseline.
 *
 * {@link compareSstToSeasonalBaseline} builds its baseline from one SST value
 * per year for a single calendar month at a single footprint, then publishes
 * `standardErrorOfMean = sampleStandardDeviation / sqrt(sampleCount)`. That
 * divisor is only correct when the contributing years are statistically
 * independent, and for sea surface temperature they are not: the ocean's mixed
 * layer carries thermal anomalies for months to years, and the same-month
 * record is additionally organised by interannual modes (ENSO, PDO, IOD) and by
 * a secular warming trend. Consecutive Augusts at one point therefore resemble
 * each other more than two Augusts drawn at random would, so `sqrt(n)` divides
 * the spread by more independent information than the record actually holds and
 * the reported uncertainty in the baseline mean comes out too small.
 *
 * This helper quantifies that gap instead of leaving it implicit. It estimates
 * the lag-1 autocorrelation of the retained baseline samples and converts it to
 * an effective sample size with the standard variance-inflation relation
 *
 *   n_eff = n * (1 - r1) / (1 + r1)
 *
 * (Bretherton et al. 1999, "The effective number of spatial degrees of freedom
 * of a time-varying field", J. Climate 12, 1990–2009; see also Wilks,
 * *Statistical Methods in the Atmospheric Sciences*, §5.2.4), and republishes
 * the standard error of the baseline mean over `sqrt(n_eff)`.
 *
 * What it deliberately does not do:
 *
 *  - It does not modify, replace, or re-derive any value the baseline already
 *    reported. The naive standard error is echoed alongside the effective one
 *    so a reader can see exactly what the correction cost.
 *  - It never *reduces* the reported uncertainty. A negative estimated `r1`
 *    formally implies `n_eff > n`, but at these record lengths that is far more
 *    likely sampling noise than genuine extra information, so `n_eff` is capped
 *    at `n` and the naive standard error stands.
 *  - Lag-1 is estimated only across calendar-*adjacent* year pairs. The
 *    baseline legitimately drops years (cloud, coverage, footprint change), and
 *    a 2011-to-2014 step is not a one-year lag. Gapped pairs contribute nothing
 *    to the numerator rather than being bridged or interpolated.
 *  - `r1` from a two-decade monthly record is itself poorly determined; its
 *    rule-of-thumb sampling standard error (`1 / sqrt(n)`) and a flag for
 *    whether the estimate clears its own noise level are both reported, so the
 *    correction is never mistaken for a precise one.
 *  - Nothing here is a significance test, a trend, a climate-normal departure,
 *    a forecast, or any claim about marine organisms, habitat, ecosystem
 *    health, heat stress, or causation. It is an uncertainty descriptor over
 *    already-computed physical SST statistics.
 *
 * Provenance is inherited from `oceanConditions`, so a publication cites the
 * MODIS/Aqua SST dataset rather than the rendered picture. Pure, render-free
 * logic (see oceanBaselineEffectiveSampleSize.test.ts).
 */

/**
 * Below three calendar-adjacent year pairs the lag-1 estimate is essentially a
 * single product term and carries no usable information about persistence, so
 * the assessment declines rather than emitting a number that looks measured.
 */
export const MINIMUM_ADJACENT_YEAR_PAIRS_FOR_LAG1 = 3;

export type OceanBaselineEffectiveSampleStatus =
  | "available"
  | "baseline-unavailable"
  | "insufficient-adjacent-pairs"
  | "insufficient-variance";

export interface OceanBaselineEffectiveSampleAssessment {
  kind: "sst-baseline-effective-sample-size";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: OceanBaselineEffectiveSampleStatus;
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** Calendar month the baseline was built for; null when unavailable. */
  calendarMonth: number | null;
  /** Footprint the baseline was restricted to; never mixed across surfaces. */
  footprint: UsableSstFootprint | null;
  /** Retained same-calendar-month years, as counted by the baseline. */
  sampleCount: number;
  /** Retained year pairs exactly one calendar year apart. */
  adjacentYearPairCount: number;
  /**
   * Years inside the retained span that carry no sample. Reported so a low pair
   * count is legible as a gappy record rather than merely a short one.
   */
  omittedYearsWithinSpan: number;
  /** Lag-1 autocorrelation over adjacent pairs, clamped to [-1, 1]. */
  lag1Autocorrelation: number | null;
  /** Rule-of-thumb sampling standard error of `r1` (1 / sqrt(n)). */
  lag1StandardError: number | null;
  /**
   * Whether |r1| clears twice its own sampling standard error. False means the
   * correction below is still applied (it errs toward more uncertainty, never
   * less) but should not be read as a measured persistence.
   */
  lag1DistinguishableFromZero: boolean | null;
  /** `n * (1 - r1) / (1 + r1)`, capped at `n` and floored at 1. */
  effectiveSampleCount: number | null;
  /** `effectiveSampleCount / sampleCount`; 1 means no independence was lost. */
  independenceRatio: number | null;
  /** The baseline's own `sampleStandardDeviation`, echoed unchanged. */
  sampleStandardDeviation: number | null;
  /** The baseline's own `sd / sqrt(n)`, echoed unchanged. */
  naiveStandardErrorOfMean: number | null;
  /** `sd / sqrt(n_eff)` — the standard error the serial correlation implies. */
  effectiveStandardErrorOfMean: number | null;
  /** `sqrt(n / n_eff)`; 1 means the naive standard error already stood. */
  uncertaintyInflationFactor: number | null;
  /** Same unit as `metric.sourceUnit`; no display conversion is done. */
  standardErrorUnit: string;
  /** Short machine-readable reason when no correction is reported. */
  reason: string | null;
}

/**
 * Estimate how many independent years a completed same-calendar-month SST
 * baseline actually holds, and restate the uncertainty in its mean accordingly.
 */
export function assessSstBaselineEffectiveSampleSize(
  comparison: OceanSeasonalBaselineComparison
): OceanBaselineEffectiveSampleAssessment {
  const { baseline, bounds, samples } = comparison;
  const base = {
    kind: "sst-baseline-effective-sample-size",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    calendarMonth: bounds.calendarMonth,
    footprint: bounds.footprint,
    sampleCount: baseline.sampleCount,
    standardErrorUnit: comparison.metric.sourceUnit,
  } as const;

  const years = orderedSampleYears(samples);
  const adjacentYearPairCount = countAdjacentYearPairs(years);
  const omittedYearsWithinSpan =
    years.length < 2
      ? 0
      : years[years.length - 1] - years[0] + 1 - years.length;
  const spans = { adjacentYearPairCount, omittedYearsWithinSpan };

  if (comparison.status !== "available" || baseline.mean === null) {
    // No usable baseline mean means there is no standard error to correct.
    return declined(
      base,
      spans,
      "baseline-unavailable",
      "baseline-unavailable"
    );
  }

  const sampleStandardDeviation = baseline.sampleStandardDeviation;
  const sumOfSquares = centredSumOfSquares(samples, baseline.mean);
  if (
    sampleStandardDeviation === null ||
    sampleStandardDeviation === 0 ||
    sumOfSquares === 0
  ) {
    // Identical years leave nothing for a lag-1 product to correlate; the
    // standard error is already zero, so inflating it would change nothing.
    return declined(
      base,
      spans,
      "insufficient-variance",
      "zero-baseline-variance"
    );
  }
  if (adjacentYearPairCount < MINIMUM_ADJACENT_YEAR_PAIRS_FOR_LAG1) {
    return declined(
      base,
      spans,
      "insufficient-adjacent-pairs",
      "too-few-calendar-adjacent-year-pairs"
    );
  }

  const lag1Autocorrelation = lag1Over(samples, baseline.mean, sumOfSquares);
  const lag1StandardError = 1 / Math.sqrt(baseline.sampleCount);
  // Only positive persistence costs independence. A negative estimate is capped
  // out rather than credited, so this never reports less uncertainty than the
  // baseline already did.
  const effectiveSampleCount =
    lag1Autocorrelation <= 0
      ? baseline.sampleCount
      : Math.min(
          baseline.sampleCount,
          Math.max(
            1,
            (baseline.sampleCount * (1 - lag1Autocorrelation)) /
              (1 + lag1Autocorrelation)
          )
        );
  const naiveStandardErrorOfMean =
    sampleStandardDeviation / Math.sqrt(baseline.sampleCount);
  const effectiveStandardErrorOfMean =
    sampleStandardDeviation / Math.sqrt(effectiveSampleCount);

  return {
    ...base,
    ...spans,
    status: "available",
    lag1Autocorrelation,
    lag1StandardError,
    lag1DistinguishableFromZero:
      Math.abs(lag1Autocorrelation) > 2 * lag1StandardError,
    effectiveSampleCount,
    independenceRatio: effectiveSampleCount / baseline.sampleCount,
    sampleStandardDeviation,
    naiveStandardErrorOfMean,
    effectiveStandardErrorOfMean,
    uncertaintyInflationFactor: Math.sqrt(
      baseline.sampleCount / effectiveSampleCount
    ),
    reason: null,
  };
}

/**
 * Build a provenance-tagged, screen-reader-ready sentence for an effective
 * sample size assessment. It reports only the independence accounting and the
 * uncertainty it implies; it never infers marine biology, ecosystem health,
 * hazard, causation, or any forecast, and declined cases say so plainly rather
 * than substituting a number.
 */
export function describeSstBaselineEffectiveSampleSize(
  assessment: OceanBaselineEffectiveSampleAssessment
): string {
  const source = assessment.metric.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is a sampling-uncertainty descriptor over physical sea-surface-temperature statistics, not a marine-biology, ecosystem, hazard, or forecast claim.`;
  const lead = "Baseline independence:";

  if (assessment.status !== "available") {
    const body =
      assessment.status === "baseline-unavailable"
        ? "the baseline reported no mean, so there is no standard error to correct."
        : assessment.status === "insufficient-variance"
          ? "every retained year holds the same SST, so the baseline mean already carries no sampling spread."
          : `only ${assessment.adjacentYearPairCount} calendar-adjacent year pair(s) were retained, below the ${MINIMUM_ADJACENT_YEAR_PAIRS_FOR_LAG1} needed to estimate year-to-year persistence.`;
    return `${lead} ${body} ${provenance}`;
  }

  const unit = assessment.standardErrorUnit;
  const r1 = (assessment.lag1Autocorrelation as number).toFixed(2);
  const effective = (assessment.effectiveSampleCount as number).toFixed(1);
  const naive = (assessment.naiveStandardErrorOfMean as number).toFixed(2);
  const corrected = (assessment.effectiveStandardErrorOfMean as number).toFixed(
    2
  );
  const determination = assessment.lag1DistinguishableFromZero
    ? ""
    : ` That autocorrelation does not clear twice its own sampling standard error (±${(assessment.lag1StandardError as number).toFixed(2)}), so treat it as indicative rather than measured.`;
  const cost =
    assessment.effectiveSampleCount === assessment.sampleCount
      ? "no year-to-year persistence was credited, so the baseline's standard error stands"
      : `that leaves about ${effective} independent years of ${assessment.sampleCount}, widening the standard error of the baseline mean from ${naive}${unit} to ${corrected}${unit}`;

  return `${lead} lag-1 autocorrelation across ${assessment.adjacentYearPairCount} calendar-adjacent year pair(s) is ${r1}; ${cost}.${determination} ${provenance}`;
}

function declined(
  base: {
    kind: "sst-baseline-effective-sample-size";
    isForecast: false;
    claimScope: "descriptive-sea-surface-temperature-only";
    metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
    calendarMonth: number | null;
    footprint: UsableSstFootprint | null;
    sampleCount: number;
    standardErrorUnit: string;
  },
  spans: { adjacentYearPairCount: number; omittedYearsWithinSpan: number },
  status: OceanBaselineEffectiveSampleStatus,
  reason: string
): OceanBaselineEffectiveSampleAssessment {
  return {
    ...base,
    ...spans,
    status,
    lag1Autocorrelation: null,
    lag1StandardError: null,
    lag1DistinguishableFromZero: null,
    effectiveSampleCount: null,
    independenceRatio: null,
    sampleStandardDeviation: null,
    naiveStandardErrorOfMean: null,
    effectiveStandardErrorOfMean: null,
    uncertaintyInflationFactor: null,
    reason,
  };
}

/** Sample years, ascending. The baseline already sorts and de-duplicates. */
function orderedSampleYears(
  samples: readonly OceanSeasonalBaselineSample[]
): number[] {
  return samples.map((sample) => sample.month.year).sort((a, b) => a - b);
}

function countAdjacentYearPairs(years: readonly number[]): number {
  let pairs = 0;
  for (let index = 1; index < years.length; index++) {
    if (years[index] - years[index - 1] === 1) pairs += 1;
  }
  return pairs;
}

function centredSumOfSquares(
  samples: readonly OceanSeasonalBaselineSample[],
  mean: number
): number {
  return neumaierSum(samples.map((sample) => (sample.value - mean) ** 2));
}

/**
 * Lag-1 autocorrelation with the numerator restricted to calendar-adjacent year
 * pairs and the denominator over every retained year — the standard estimator
 * for a gapped series. Clamped to [-1, 1] so a short record's rounding cannot
 * produce an out-of-range coefficient.
 */
function lag1Over(
  samples: readonly OceanSeasonalBaselineSample[],
  mean: number,
  sumOfSquares: number
): number {
  // The baseline already sorts its samples oldest to newest; sort a copy anyway
  // so a hand-built comparison cannot silently reorder the lag.
  const ordered = [...samples].sort((a, b) => a.month.year - b.month.year);
  const products: number[] = [];
  for (let index = 1; index < ordered.length; index++) {
    const previous = ordered[index - 1];
    const current = ordered[index];
    if (current.month.year - previous.month.year !== 1) continue;
    products.push((previous.value - mean) * (current.value - mean));
  }
  return Math.max(-1, Math.min(1, neumaierSum(products) / sumOfSquares));
}
