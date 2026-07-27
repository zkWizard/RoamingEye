import { CLIMATE_METRICS, type ClimateMetric } from "./climate";
import {
  compareMonthlyClimateToSeasonalBaseline,
  type SeasonalBaselineComparison,
  type SeasonalBaselineOptions,
  type SeasonalBaselineStatus,
} from "./seasonalBaseline";
import type { PrecipitationObservation } from "./precipitationPercentile";
import type { YearMonth } from "./timeline";

/**
 * Standardized Precipitation Index (SPI) for a supplied monthly precipitation
 * value against its own same-calendar-month record.
 *
 * The precipitation layer renders GLDAS monthly-mean precipitation as a rate in
 * kg/m²/s. The plainest hydrologic question a reader asks — *was this month wet
 * or dry for here?* — is answered elsewhere by an empirical percentile-of-record
 * (precipitationPercentile.ts), which makes no distributional assumption. This
 * helper answers the same question with the complementary *parametric* index
 * that operational drought monitoring standardizes on: the SPI of McKee, Doesken
 * & Kleist (1993), recommended by the WMO as the reference meteorological-drought
 * index (WMO-No. 1090, 2012).
 *
 * SPI is built precisely because a plain Gaussian anomaly is the wrong tool for
 * precipitation. Monthly precipitation is strongly right-skewed and bounded at
 * zero, so a z-score around the arithmetic mean (seasonalAnomalyContext.ts)
 * misrepresents both tails. SPI instead fits a two-parameter gamma distribution
 * — the classic model for precipitation totals — to the same-calendar-month
 * record, evaluates the target's cumulative probability under that fit
 * (mixing in the empirical probability of a zero-precipitation month), and then
 * maps that probability through the inverse standard-normal CDF. The result is
 * an equiprobability transform: SPI is the number of standard deviations a
 * *normal* variable would need to reach the same cumulative probability, so
 * −1.0 and +1.0 are genuinely symmetric in likelihood even though the raw rates
 * are not. Values follow the McKee classification (|SPI| ≥ 2 extreme, etc.).
 *
 * What this is NOT: SPI is a descriptive standing of one month within its own
 * fitted climatology, not a probability of any future condition, a forecast, a
 * drought declaration, a soil-moisture or streamflow state, a runoff or
 * water-balance quantity, or a cause. The gamma fit is a *sample* fit from a
 * limited number of years (the WMO recommends ≥ 30; short records give an
 * uncertain fit), the fit deliberately excludes the target year so the month is
 * scored against an independent same-month reference, and the index inherits all
 * the model-product caveats of the underlying GLDAS rate.
 *
 * Pure, render-free logic (see precipitationSpi.test.ts).
 */

/** Cited GLDAS precipitation metric backing every SPI description. */
export const PRECIPITATION_SPI_METRIC: ClimateMetric =
  CLIMATE_METRICS["precipitation-rate"];

/**
 * Number of positive (non-zero) same-calendar-month years required before a
 * two-parameter gamma is fitted. Two is the bare arithmetic floor for a shape
 * estimate; the audited baseline separately enforces its own (larger) sample
 * floor, so in practice the positive count is well above this.
 */
export const MINIMUM_SPI_POSITIVE_SAMPLES = 2;

/**
 * SPI is clamped to this magnitude. The inverse-normal transform diverges as the
 * cumulative probability approaches 0 or 1 (e.g. a target drier than every fitted
 * year), which would otherwise yield an unbounded, unstable index off the tail of
 * a short sample fit. ±3.0 spans the full McKee "extreme" band; any target beyond
 * it is reported at the clamp with `clampedToExtreme: true`.
 */
export const SPI_CLAMP_MAGNITUDE = 3;

export const PRECIPITATION_SPI_LIMITATIONS = [
  "Values are GLDAS monthly-mean precipitation rates in kg/m²/s, a land-model product, not a rain-gauge or radar measurement.",
  "SPI fits a two-parameter gamma distribution to a short supplied record of prior same-calendar-month observations for the same place, then maps the target's cumulative probability through the inverse standard-normal CDF; it is a descriptive standing within that fitted climatology, not a probability of future conditions, a forecast, or a drought declaration.",
  "The gamma fit is a sample fit: the WMO recommends at least 30 years, and a short or near-degenerate record yields an uncertain fit. The positive-sample count is reported so the fit's strength can be judged.",
  "The fit excludes the target year, so the month is scored against an independent same-month reference; operational SPI that includes every year will differ slightly.",
  "SPI is computed from the monthly-mean rate. Because a calendar month has the same length across years apart from leap-year Februaries and the probability transform is invariant to a common positive scale, this is all but identical to an SPI of accumulated depth.",
  "The index is clamped to |SPI| ≤ 3 because the inverse-normal transform diverges at the tails of a finite sample fit; a clamped value flags a target beyond the fitted record, not a precise magnitude.",
  "SPI never infers soil moisture, runoff, streamflow, water-balance closure, drought or flood impact, cause, or any future value.",
] as const;

/** SPI status mirrors the underlying same-calendar-month baseline, plus fit-specific withholding. */
export type PrecipitationSpiStatus =
  SeasonalBaselineStatus | "insufficient-fit";

/** Sign of the target relative to its fitted climatology. */
export type SpiDirection = "wet" | "dry" | "normal";

/**
 * McKee, Doesken & Kleist (1993) wetness/dryness classification, defined strictly
 * as ranges of the SPI value. These are descriptive labels, not probabilities of
 * impact.
 * - `extremely-wet`   —  SPI ≥ 2.0
 * - `severely-wet`    —  1.5 ≤ SPI < 2.0
 * - `moderately-wet`  —  1.0 ≤ SPI < 1.5
 * - `near-normal`     — −1.0 < SPI < 1.0
 * - `moderately-dry`  — −1.5 < SPI ≤ −1.0
 * - `severely-dry`    — −2.0 < SPI ≤ −1.5
 * - `extremely-dry`   —  SPI ≤ −2.0
 */
export type SpiCategory =
  | "extremely-wet"
  | "severely-wet"
  | "moderately-wet"
  | "near-normal"
  | "moderately-dry"
  | "severely-dry"
  | "extremely-dry";

/** The fitted mixed gamma model behind an SPI value, retained for auditability. */
export interface SpiGammaFit {
  /** Gamma shape parameter α (Thom 1958 maximum-likelihood approximation). */
  shape: number;
  /** Gamma scale parameter β in native kg/m²/s, so mean = α·β. */
  scale: number;
  /** Positive (non-zero) same-calendar-month years the gamma was fitted to. */
  positiveSampleCount: number;
  /** Same-calendar-month years recorded as exactly zero precipitation. */
  zeroSampleCount: number;
  /** Empirical probability of a zero-precipitation month, q = zeros / total. */
  zeroProbability: number;
}

export interface PrecipitationSpiResult {
  kind: "precipitation-standardized-precipitation-index";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single index from being read as a trend. */
  isTrend: false;
  claimScope: "standardized-index-within-supplied-same-place-same-calendar-month-record-only";
  metric: ClimateMetric;
  status: PrecipitationSpiStatus;
  /** Full audited same-calendar-month baseline, retained for provenance. */
  baseline: SeasonalBaselineComparison;
  /** Prior same-calendar-month observations the fit was formed from. */
  sampleCount: number;
  /** The fitted mixed gamma model, or null when no fit was formed. */
  fit: SpiGammaFit | null;
  /**
   * Cumulative probability of the target under the fitted mixed model, H(x) ∈
   * (0,1); the value the inverse-normal transform is applied to.
   */
  cumulativeProbability: number | null;
  /** The Standardized Precipitation Index, clamped to |SPI| ≤ 3. */
  spi: number | null;
  /** True when the target fell beyond the fitted record and SPI was clamped. */
  clampedToExtreme: boolean;
  direction: SpiDirection | null;
  category: SpiCategory | null;
  /** Short machine-readable reason when no SPI is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Describe one supplied monthly precipitation observation as an SPI within prior
 * supplied observations for the same calendar month at the same place.
 *
 * The candidate list and the target are forced onto the precipitation-rate
 * metric so a non-precipitation layer cannot be scored through this helper. All
 * sample gathering, validation, deduplication, coverage filtering, target-year
 * exclusion, and the minimum-sample floor are delegated to
 * `compareMonthlyClimateToSeasonalBaseline`; an SPI is reported only when that
 * comparison is itself `available` AND the retained record supports a
 * non-degenerate gamma fit. A `null` SPI therefore means "no index can be
 * stated", never "zero / near-normal".
 */
export function describePrecipitationSpi(
  targetObservation: PrecipitationObservation,
  priorSameMonthObservations: readonly PrecipitationObservation[],
  availableThrough: YearMonth,
  options: SeasonalBaselineOptions = {}
): PrecipitationSpiResult {
  const baseline = compareMonthlyClimateToSeasonalBaseline(
    { ...targetObservation, metricId: "precipitation-rate" },
    priorSameMonthObservations.map((observation) => ({
      ...observation,
      metricId: "precipitation-rate" as const,
    })),
    availableThrough,
    options
  );

  const base = {
    kind: "precipitation-standardized-precipitation-index",
    isForecast: false,
    isTrend: false,
    claimScope:
      "standardized-index-within-supplied-same-place-same-calendar-month-record-only",
    metric: PRECIPITATION_SPI_METRIC,
    status: baseline.status,
    baseline,
    sampleCount: baseline.samples.length,
    limitations: PRECIPITATION_SPI_LIMITATIONS,
  } as const;

  const withheld = (
    status: PrecipitationSpiStatus,
    reason: string,
    fit: SpiGammaFit | null = null
  ): PrecipitationSpiResult => ({
    ...base,
    status,
    fit,
    cumulativeProbability: null,
    spi: null,
    clampedToExtreme: false,
    direction: null,
    category: null,
    reason,
  });

  // An index is only meaningful once the audited baseline is available: the
  // target is a published, usable observation and the record clears the sample
  // and coverage floors. Every other status passes through with a null SPI.
  if (
    baseline.status !== "available" ||
    baseline.target.observedValue === null
  ) {
    return withheld(baseline.status, baseline.reason ?? "spi-unavailable");
  }

  // The target and every retained sample are already sign- and finiteness-checked
  // upstream: summarizeMonthlyClimate rejects any non-physical (negative or
  // non-finite) precipitation as `invalid-value`, and coverage-invalid baseline
  // years never reach `samples`. So values here are guaranteed finite and ≥ 0.
  const target = baseline.target.observedValue;
  const values = baseline.samples.map((sample) => sample.value);
  const positives = values.filter((value) => value > 0);
  const zeroSampleCount = values.length - positives.length;
  if (positives.length < MINIMUM_SPI_POSITIVE_SAMPLES) {
    return withheld("insufficient-fit", "too-few-positive-months");
  }

  const gamma = fitGammaByThom(positives);
  if (gamma === null) {
    // A perfectly flat positive record has no spread to fit a shape to.
    return withheld("insufficient-fit", "no-precipitation-variability");
  }

  const zeroProbability = zeroSampleCount / values.length;
  const fit: SpiGammaFit = {
    shape: gamma.shape,
    scale: gamma.scale,
    positiveSampleCount: positives.length,
    zeroSampleCount,
    zeroProbability,
  };

  // Mixed cumulative distribution: the empirical mass at zero, plus the gamma
  // mass below the target for the positive part. gammaCdf(0) === 0, so a target
  // of exactly zero collapses to H = q without a special case.
  const gammaProbability = gammaCdf(target, gamma.shape, gamma.scale);
  const cumulativeProbability =
    zeroProbability + (1 - zeroProbability) * gammaProbability;

  const raw = inverseStandardNormalCdf(cumulativeProbability);
  const clampedToExtreme = Math.abs(raw) > SPI_CLAMP_MAGNITUDE;
  const spi = clampedToExtreme ? Math.sign(raw) * SPI_CLAMP_MAGNITUDE : raw;

  return {
    ...base,
    status: "available",
    fit,
    cumulativeProbability,
    spi,
    clampedToExtreme,
    direction: directionOf(spi),
    category: categoryOf(spi),
    reason: null,
  };
}

function directionOf(spi: number): SpiDirection {
  if (spi >= 1) return "wet";
  if (spi <= -1) return "dry";
  return "normal";
}

function categoryOf(spi: number): SpiCategory {
  if (spi >= 2) return "extremely-wet";
  if (spi >= 1.5) return "severely-wet";
  if (spi >= 1) return "moderately-wet";
  if (spi > -1) return "near-normal";
  if (spi > -1.5) return "moderately-dry";
  if (spi > -2) return "severely-dry";
  return "extremely-dry";
}

/**
 * Fit a two-parameter gamma to strictly positive values via the Thom (1958)
 * maximum-likelihood approximation used by the operational SPI:
 *
 *   A = ln(mean) − (Σ ln xᵢ) / m
 *   α̂ = (1 + √(1 + 4A/3)) / (4A)
 *   β̂ = mean / α̂
 *
 * A is non-negative by the arithmetic-mean/geometric-mean inequality and is zero
 * only when every value is identical, which has no spread to fit a shape to. A is
 * dimensionless (invariant to a common scale), so a fixed floor cleanly separates
 * a genuine degenerate/near-degenerate record — where floating-point rounding
 * leaves A at ~1e-15 rather than exactly 0 — from any real precipitation spread
 * (A ≳ 1e-3). Below the floor, or on non-finite input, the fit returns null so the
 * caller withholds rather than emitting a spike from a division by ~0. Callers
 * must pass ≥ 1 positive value; the SPI entry point enforces its own
 * positive-sample floor upstream.
 */
export const MINIMUM_THOM_LOG_MEAN_GAP = 1e-10;

export function fitGammaByThom(
  positiveValues: readonly number[]
): { shape: number; scale: number } | null {
  const m = positiveValues.length;
  if (m === 0) return null;
  let sum = 0;
  let logSum = 0;
  for (const value of positiveValues) {
    if (!(value > 0) || !Number.isFinite(value)) return null;
    sum += value;
    logSum += Math.log(value);
  }
  const mean = sum / m;
  const a = Math.log(mean) - logSum / m;
  // Guard the degenerate/near-degenerate fit: A at/below the floor means no
  // usable spread (a flat record, up to rounding noise).
  if (!(a > MINIMUM_THOM_LOG_MEAN_GAP) || !Number.isFinite(a)) return null;
  const shape = (1 + Math.sqrt(1 + (4 * a) / 3)) / (4 * a);
  const scale = mean / shape;
  if (!Number.isFinite(shape) || !Number.isFinite(scale) || scale <= 0) {
    return null;
  }
  return { shape, scale };
}

/**
 * Gamma cumulative distribution function G(x; shape, scale) = P(shape, x/scale),
 * the regularized lower incomplete gamma. Returns 0 for x ≤ 0 (the fitted mass
 * below zero is empty; the mixed model handles the empirical zero mass
 * separately).
 */
export function gammaCdf(x: number, shape: number, scale: number): number {
  if (!(x > 0)) return 0;
  return regularizedLowerIncompleteGamma(shape, x / scale);
}

/**
 * Regularized lower incomplete gamma P(a, x) = γ(a, x) / Γ(a), via the series
 * expansion for x < a + 1 and the Lentz continued fraction otherwise (Press et
 * al., *Numerical Recipes*, §6.2). Accurate to near machine precision across the
 * range SPI exercises.
 */
export function regularizedLowerIncompleteGamma(a: number, x: number): number {
  if (!(a > 0) || x < 0 || !Number.isFinite(x)) return Number.NaN;
  if (x === 0) return 0;
  if (x < a + 1) {
    return lowerGammaSeries(a, x);
  }
  return 1 - upperGammaContinuedFraction(a, x);
}

const GAMMA_ITERATION_LIMIT = 300;
const GAMMA_EPSILON = 1e-14;
const GAMMA_TINY = 1e-300;

/** Series representation of P(a, x), used for x < a + 1. */
function lowerGammaSeries(a: number, x: number): number {
  let ap = a;
  let del = 1 / a;
  let sum = del;
  for (let n = 0; n < GAMMA_ITERATION_LIMIT; n++) {
    ap += 1;
    del *= x / ap;
    sum += del;
    if (Math.abs(del) < Math.abs(sum) * GAMMA_EPSILON) break;
  }
  return sum * Math.exp(-x + a * Math.log(x) - logGamma(a));
}

/** Lentz continued fraction for Q(a, x) = 1 − P(a, x), used for x ≥ a + 1. */
function upperGammaContinuedFraction(a: number, x: number): number {
  let b = x + 1 - a;
  let c = 1 / GAMMA_TINY;
  let d = 1 / b;
  let h = d;
  for (let i = 1; i <= GAMMA_ITERATION_LIMIT; i++) {
    const an = -i * (i - a);
    b += 2;
    d = an * d + b;
    if (Math.abs(d) < GAMMA_TINY) d = GAMMA_TINY;
    c = b + an / c;
    if (Math.abs(c) < GAMMA_TINY) c = GAMMA_TINY;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < GAMMA_EPSILON) break;
  }
  return Math.exp(-x + a * Math.log(x) - logGamma(a)) * h;
}

const LANCZOS_COEFFICIENTS = [
  0.99999999999980993, 676.5203681218851, -1259.1392167224028,
  771.32342877765313, -176.61502916214059, 12.507343278686905,
  -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7,
] as const;
const LANCZOS_G = 7;
const LOG_SQRT_2PI = 0.5 * Math.log(2 * Math.PI);

/**
 * Natural log of the gamma function via the Lanczos approximation (g = 7),
 * accurate to ~1e-15 for the strictly positive arguments SPI uses.
 */
export function logGamma(z: number): number {
  let x = LANCZOS_COEFFICIENTS[0];
  const shifted = z - 1;
  for (let i = 1; i < LANCZOS_COEFFICIENTS.length; i++) {
    x += LANCZOS_COEFFICIENTS[i] / (shifted + i);
  }
  const t = shifted + LANCZOS_G + 0.5;
  return LOG_SQRT_2PI + (shifted + 0.5) * Math.log(t) - t + Math.log(x);
}

// Acklam's rational approximation of the inverse standard-normal CDF; the
// relative error is below 1.15e-9 across (0,1). Standard published coefficients.
const ACKLAM_A = [
  -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
  1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
] as const;
const ACKLAM_B = [
  -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
  6.680131188771972e1, -1.328068155288572e1,
] as const;
const ACKLAM_C = [
  -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
  -2.549732539343734, 4.374664141464968, 2.938163982698783,
] as const;
const ACKLAM_D = [
  7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
  3.754408661907416,
] as const;
const ACKLAM_LOW = 0.02425;
const ACKLAM_HIGH = 1 - ACKLAM_LOW;

/**
 * Inverse standard-normal CDF (probit), Peter Acklam's algorithm. Maps a
 * cumulative probability p ∈ (0,1) to the standard-normal deviate z with
 * Φ(z) = p — the transform that turns SPI's cumulative probability into an index.
 * Inputs at or beyond {0,1} return ±∞, which the caller clamps.
 */
export function inverseStandardNormalCdf(p: number): number {
  if (!(p > 0)) return Number.NEGATIVE_INFINITY;
  if (!(p < 1)) return Number.POSITIVE_INFINITY;
  if (p < ACKLAM_LOW) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q +
        ACKLAM_C[3]) *
        q +
        ACKLAM_C[4]) *
        q +
        ACKLAM_C[5]) /
      ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) *
        q +
        1)
    );
  }
  if (p <= ACKLAM_HIGH) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((ACKLAM_A[0] * r + ACKLAM_A[1]) * r + ACKLAM_A[2]) * r +
        ACKLAM_A[3]) *
        r +
        ACKLAM_A[4]) *
        r +
        ACKLAM_A[5]) *
        q) /
      (((((ACKLAM_B[0] * r + ACKLAM_B[1]) * r + ACKLAM_B[2]) * r +
        ACKLAM_B[3]) *
        r +
        ACKLAM_B[4]) *
        r +
        1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(
      ((((ACKLAM_C[0] * q + ACKLAM_C[1]) * q + ACKLAM_C[2]) * q + ACKLAM_C[3]) *
        q +
        ACKLAM_C[4]) *
        q +
      ACKLAM_C[5]
    ) /
    ((((ACKLAM_D[0] * q + ACKLAM_D[1]) * q + ACKLAM_D[2]) * q + ACKLAM_D[3]) *
      q +
      1)
  );
}
