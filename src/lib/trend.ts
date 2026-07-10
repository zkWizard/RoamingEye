import type { YearMonth } from "./timeline";
import type { ProbeScale } from "./probe";

/**
 * Nonparametric trend detection for the probe's monthly time series.
 *
 * Two field-standard estimators, chosen because they suit colormap-inverted
 * values that don't follow a clean distribution:
 *
 *  - **Seasonal Mann-Kendall** (Hirsch & Slack 1982) for significance. The
 *    plain MK test, applied to seasonal data, inflates false positives —
 *    high-summer values always outrank low-winter ones regardless of any
 *    trend. The seasonal variant compares values *only within the same
 *    calendar month across years* and sums the twelve per-month statistics,
 *    so the seasonal cycle can't masquerade as a trend.
 *  - **Sen's slope** for magnitude: the median of all within-season pairwise
 *    slopes — robust to outliers, no linearity assumption — with the
 *    rank-based confidence interval (Gilbert 1987).
 *
 * Pure and unit-tested (trend.test.ts); no rendering. See METHODS.md for the
 * write-up and the seasonal-correction rationale.
 */

/** A month's value paired with a continuous time coordinate in years. */
interface Point {
  /** Fractional year: year + (month−1)/12. Slopes come out per-year. */
  t: number;
  v: number;
}

/** Group valid (month, value) samples by calendar month (1–12). */
function bySeason(
  months: YearMonth[],
  values: (number | null)[]
): Map<number, Point[]> {
  const seasons = new Map<number, Point[]>();
  for (let i = 0; i < months.length; i++) {
    const v = values[i];
    if (v === null || v === undefined || !Number.isFinite(v)) continue;
    const { year, month } = months[i];
    const point: Point = { t: year + (month - 1) / 12, v };
    const bucket = seasons.get(month);
    if (bucket) bucket.push(point);
    else seasons.set(month, [point]);
  }
  // Each season sorted by time — Mann-Kendall walks pairs in time order.
  for (const bucket of seasons.values()) bucket.sort((a, b) => a.t - b.t);
  return seasons;
}

/**
 * Mann-Kendall S for one season: Σ sign(v_j − v_i) over all i < j in time
 * order, plus the tie-corrected variance term this season contributes.
 */
function seasonS(points: Point[]): { S: number; varTerm: number } {
  const n = points.length;
  let S = 0;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      S += Math.sign(points[j].v - points[i].v);
    }
  }
  // Variance n(n−1)(2n+5), reduced by tied groups: Σ t(t−1)(2t+5).
  const counts = new Map<number, number>();
  for (const p of points) counts.set(p.v, (counts.get(p.v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) tieTerm += t * (t - 1) * (2 * t + 5);
  const varTerm = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;
  return { S, varTerm };
}

/** Standard normal upper-tail → two-sided p (Abramowitz & Stegun 26.2.17). */
function twoSidedP(z: number): number {
  const a = Math.abs(z);
  const t = 1 / (1 + 0.2316419 * a);
  const d = 0.3989422804014327 * Math.exp(-(a * a) / 2);
  const poly =
    t *
    (0.31938153 +
      t *
        (-0.356563782 +
          t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
  const upper = d * poly;
  return Math.min(1, Math.max(0, 2 * upper));
}

export interface MannKendallResult {
  /** Sum of per-season Mann-Kendall S. */
  S: number;
  /** Tie-corrected variance of S. */
  varS: number;
  /** Continuity-corrected z statistic (0 when varS is 0). */
  z: number;
  /** Kendall's τ effect size in [−1, 1] over the compared within-season pairs. */
  tau: number;
  /** Two-sided p-value for H0: no monotonic trend. */
  pValue: number;
  /** Seasons (calendar months) that had ≥ 2 observations. */
  nSeasons: number;
  /** Total valid observations across all seasons. */
  n: number;
}

/**
 * Seasonal Mann-Kendall over a monthly series. Seasons with fewer than two
 * observations contribute nothing (no pair to compare); a series with no
 * comparable pair returns S = 0, p = 1.
 */
export function seasonalMannKendall(
  months: YearMonth[],
  values: (number | null)[]
): MannKendallResult {
  const seasons = bySeason(months, values);
  let S = 0;
  let varS = 0;
  let pairs = 0;
  let n = 0;
  let usedSeasons = 0;
  for (const points of seasons.values()) {
    n += points.length;
    if (points.length < 2) continue;
    usedSeasons++;
    const { S: s, varTerm } = seasonS(points);
    S += s;
    varS += varTerm;
    pairs += (points.length * (points.length - 1)) / 2;
  }
  // Continuity correction: pull |S| toward 0 by 1 before standardizing.
  const z = varS > 0 ? (S - Math.sign(S)) / Math.sqrt(varS) : 0;
  const tau = pairs > 0 ? S / pairs : 0;
  const pValue = varS > 0 ? twoSidedP(z) : 1;
  return { S, varS, z, tau, pValue, nSeasons: usedSeasons, n };
}

export interface SensSlopeResult {
  /** Median within-season pairwise slope, in value-units per year. */
  slopePerYear: number;
  /** Lower/upper bounds of the 95% rank-based CI (per year). */
  lowerPerYear: number;
  upperPerYear: number;
  /** Number of pairwise slopes the median is taken over. */
  nPairs: number;
}

/** Median of a numeric array (caller guarantees non-empty). */
function median(sorted: number[]): number {
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Seasonal Sen's slope: the median of all within-season pairwise slopes
 * (Δvalue / Δyear). The 95% CI uses the Mann-Kendall variance to pick the
 * rank offsets around the median slope (Gilbert 1987, §16.4.2).
 */
export function sensSlope(
  months: YearMonth[],
  values: (number | null)[],
  varS = seasonalMannKendall(months, values).varS
): SensSlopeResult {
  const seasons = bySeason(months, values);
  const slopes: number[] = [];
  for (const points of seasons.values()) {
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const dt = points[j].t - points[i].t;
        if (dt > 0) slopes.push((points[j].v - points[i].v) / dt);
      }
    }
  }
  if (slopes.length === 0) {
    return { slopePerYear: 0, lowerPerYear: 0, upperPerYear: 0, nPairs: 0 };
  }
  slopes.sort((a, b) => a - b);
  const nPairs = slopes.length;
  const slope = median(slopes);

  // Rank-based CI: half-width C = z_{0.975}·√varS spans around the median rank.
  const cAlpha = 1.959963984540054 * Math.sqrt(varS);
  const lowerRank = Math.round((nPairs - cAlpha) / 2);
  const upperRank = Math.round((nPairs + cAlpha) / 2) + 1;
  const clamp = (r: number): number => Math.min(nPairs - 1, Math.max(0, r));
  return {
    slopePerYear: slope,
    lowerPerYear: varS > 0 ? slopes[clamp(lowerRank - 1)] : slope,
    upperPerYear: varS > 0 ? slopes[clamp(upperRank - 1)] : slope,
    nPairs,
  };
}

export interface TrendSummary extends MannKendallResult {
  /** Sen's slope and CI, per year. */
  slopePerYear: number;
  lowerPerYear: number;
  upperPerYear: number;
  nPairs: number;
  /** Sen's slope × 10, for readable reporting ("per decade"). */
  perDecade: number;
  /** Significant at α = 0.05 with enough record to test. */
  significant: boolean;
  /** "rising" | "falling" | "flat" — the reportable direction. */
  direction: "rising" | "falling" | "flat";
  /** Units for the slope, from the layer scale (e.g. "K", "" for NDVI). */
  unit: string;
}

/** α for the significance verdict, and the minimum record to attempt a test. */
export const TREND_ALPHA = 0.05;
export const MIN_SEASONS_FOR_TREND = 1;
export const MIN_YEARS_PER_SEASON = 3;

/**
 * The full reportable trend: seasonal Mann-Kendall + Sen's slope, plus a
 * significance verdict and direction. `significant` requires both a low
 * p-value and enough record that the test is meaningful (≥ 3 years in at
 * least one season) — a two-point series can be "significant" by the formula
 * but says nothing.
 */
export function trendSummary(
  months: YearMonth[],
  values: (number | null)[],
  scale: ProbeScale
): TrendSummary {
  const mk = seasonalMannKendall(months, values);
  const sen = sensSlope(months, values, mk.varS);

  const longestSeason = Math.max(
    0,
    ...[...bySeason(months, values).values()].map((p) => p.length)
  );
  const enoughRecord =
    mk.nSeasons >= MIN_SEASONS_FOR_TREND &&
    longestSeason >= MIN_YEARS_PER_SEASON;
  const significant = enoughRecord && mk.pValue < TREND_ALPHA;

  const direction: TrendSummary["direction"] = !significant
    ? "flat"
    : sen.slopePerYear > 0
      ? "rising"
      : "falling";

  return {
    ...mk,
    slopePerYear: sen.slopePerYear,
    lowerPerYear: sen.lowerPerYear,
    upperPerYear: sen.upperPerYear,
    nPairs: sen.nPairs,
    perDecade: sen.slopePerYear * 10,
    significant,
    direction,
    unit: scale.unit,
  };
}
