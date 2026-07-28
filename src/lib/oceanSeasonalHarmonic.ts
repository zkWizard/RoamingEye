import { neumaierSum } from "./numerics";
import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  type SeaSurfaceTemperatureObservation,
} from "./oceanConditions";
import type { UsableSstFootprint } from "./oceanSeasonalBaseline";
import {
  summarizeSstSeasonalCycle,
  type SstClimatologicalMonth,
  type SstSeasonalCycleExclusions,
  type SstSeasonalCycleOptions,
} from "./oceanSeasonalCycle";
import { MONTH_NAMES } from "./timeline";

/**
 * Annual-harmonic (first Fourier mode) description of the calendar-month SST
 * climatology — the *phase* companion to {@link summarizeSstSeasonalCycle}.
 *
 * The seasonal cycle reports the warmest and coldest climatological months as a
 * discrete argmax over the twelve monthly means and a peak-to-trough amplitude.
 * That argmax jumps between whole months and, by construction, "is an observed-
 * record cycle, not a fitted harmonic". A reader often wants the *timing* of the
 * thermal peak at finer-than-one-month resolution and a single number for how
 * sinusoidal the annual march actually is. Physical oceanography answers both
 * with the first annual harmonic: fit the climatology to
 *
 *     mean(m) ≈ level + A·cos(θ_m − φ),   θ_m = 2π·(m − 0.5) / 12
 *
 * by ordinary least squares over the qualifying calendar-month means. The phase
 * φ gives the continuous month the seasonal warming peaks (the maximum of the
 * fitted sinusoid), the harmonic amplitude A is half the annual sinusoid's peak-
 * to-trough swing, and the fraction of across-month variance the harmonic
 * explains says how well one annual sinusoid describes the cycle (near 1: a
 * clean single-peaked annual march; well below 1: a skewed or multi-peaked cycle
 * a single harmonic misrepresents).
 *
 * All footprint selection, per-month averaging across years, coverage filtering,
 * year-month deduplication, and the minimum-years-per-month floor are delegated
 * to {@link summarizeSstSeasonalCycle}; this helper adds only the harmonic fit on
 * top of that audited climatology, so open-water and land-mixed coastal
 * footprints are never combined and provenance is preserved.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - This is a least-squares fit of the *single* annual harmonic to an observed-
 *    record climatology. It is NOT an official climate normal, not a multi-
 *    harmonic decomposition, not an anomaly, not a marine-heatwave signal, not a
 *    trend, and not a forecast. Higher harmonics (a skewed or double-peaked
 *    cycle) are discarded — that is exactly what `varianceExplained` measures.
 *  - The phase is the timing of the fitted annual maximum at continuous-month
 *    resolution. It is a property of the *fit*, not a measured day-of-year the
 *    monthly data could not support; a low `amplitude` makes it ill-defined, so
 *    it is withheld there rather than reported as a spurious month.
 *  - Sea surface temperature is a physical observation; nothing here infers
 *    biological abundance, habitat quality, ecosystem health, thermal stress,
 *    causation, or future ocean conditions.
 *
 * Pure, render-free logic (see oceanSeasonalHarmonic.test.ts).
 */

/**
 * A three-parameter (level, cosine, sine) annual harmonic needs to be over-
 * determined and its months spread around the calendar; six qualifying calendar
 * months is a conservative floor below which a single annual sinusoid is too
 * weakly constrained to report honestly.
 */
export const MINIMUM_MONTHS_FOR_ANNUAL_HARMONIC = 6;

/**
 * Below this harmonic amplitude (in the source unit) the fitted annual sinusoid
 * is flat enough that its direction of maximum is numerically undefined; the
 * phase is withheld rather than reported as a spurious peak month.
 */
const AMPLITUDE_EPSILON = 1e-9;

/**
 * Relative floor for the 3×3 normal-equation determinant. When the qualifying
 * months are so clustered on the calendar circle that they cannot separate the
 * level, cosine, and sine terms, the determinant collapses toward zero and the
 * fit is reported as degenerate rather than solved into noise.
 */
const NORMAL_DETERMINANT_EPSILON = 1e-9;

const RADIANS_PER_MONTH = (2 * Math.PI) / 12;
const DEGREES_PER_MONTH = 360 / 12;

export type SstSeasonalHarmonicStatus =
  | "available"
  | "no-usable-observations"
  | "insufficient-qualified-months"
  | "degenerate-fit"
  | "invalid";

export interface SstSeasonalHarmonicOptions extends SstSeasonalCycleOptions {
  /**
   * Minimum distinct qualifying calendar months required to fit the harmonic.
   * Defaults to {@link MINIMUM_MONTHS_FOR_ANNUAL_HARMONIC}; must be an integer of
   * at least three (the parameter count of the fit).
   */
  minimumMonths?: number;
}

export interface SstSeasonalHarmonicSummary {
  kind: "derived-sst-seasonal-harmonic";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: SstSeasonalHarmonicStatus;
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** Footprint the climatology was built for, or null when none was usable. */
  footprint: UsableSstFootprint | null;
  requiredMonths: number;
  /** Distinct qualifying calendar months that entered the fit. */
  monthsUsed: number;
  /**
   * Fitted annual-mean level of the harmonic (the constant term), in the source
   * unit; the mean the sinusoid oscillates about. `null` when no fit was made.
   */
  meanLevel: number | null;
  /**
   * Harmonic amplitude A ≥ 0 — half the fitted annual peak-to-trough swing — in
   * `unit`. `null` when no fit was made. This is the amplitude of the *single*
   * annual sinusoid, not the observed warmest-minus-coldest range.
   */
  amplitude: number | null;
  /**
   * Phase of the fitted maximum in degrees [0, 360) from the Dec/Jan boundary
   * (0° = start of January, 90° = start of April). `null` when the amplitude is
   * too small to define a direction or no fit was made.
   */
  phaseDegrees: number | null;
  /**
   * Continuous month of the fitted thermal maximum in (0.5, 12.5]: 1.0 = mid-
   * January, 6.5 = end of June / start of July. `null` when withheld.
   */
  peakMonth: number | null;
  /**
   * Whole calendar month (1..12) nearest the fitted maximum, or `null` when
   * withheld. December and January are treated as adjacent, so the nearest month
   * is always in range.
   */
  peakCalendarMonth: number | null;
  /** Short English name of `peakCalendarMonth`, or `null` when withheld. */
  peakMonthName: string | null;
  /**
   * Fraction in [0, 1] of the across-month variance of the climatological means
   * that the single annual harmonic explains (its coefficient of determination):
   * near 1 a clean single-peaked annual cycle, well below 1 a skewed or multi-
   * peaked cycle a single harmonic misrepresents. `null` when the months carry no
   * across-month variance (a flat climatology) so the ratio is undefined.
   */
  varianceExplained: number | null;
  unit: string;
  /** Passed through from the underlying climatology for auditability. */
  exclusions: SstSeasonalHarmonicExclusions;
  limitations: typeof SST_SEASONAL_HARMONIC_LIMITATIONS;
  /** Short machine-readable reason when no phase or fit is reported. */
  reason: string | null;
}

/**
 * Exclusion tally forwarded from the underlying climatology, plus the count of
 * gathered calendar months that did not meet the per-month years floor and so
 * never entered the harmonic fit.
 */
export interface SstSeasonalHarmonicExclusions extends SstSeasonalCycleExclusions {
  /** Calendar months present in the record but below the years-per-month floor. */
  unqualifiedMonth: number;
}

export const SST_SEASONAL_HARMONIC_LIMITATIONS = [
  "The fit is an ordinary-least-squares single annual harmonic of the observed-record calendar-month SST climatology; it is not an official climate normal, a multi-harmonic decomposition, an anomaly, a trend, or a forecast.",
  "The phase is the timing of the fitted annual maximum at continuous-month resolution — a property of the fitted sinusoid, not a measured day-of-year; a near-zero amplitude leaves it undefined and it is withheld.",
  "Amplitude is half the fitted annual peak-to-trough swing in the source unit (°C); it is the amplitude of the single annual sinusoid, distinct from the observed warmest-minus-coldest monthly range.",
  "varianceExplained is the fraction of across-month climatological variance captured by the one annual harmonic; a value well below 1 means a skewed or multi-peaked cycle the single harmonic does not represent.",
  "Open-water and land-mixed coastal footprints are never combined; the fit describes one footprint's climatology, which rests on a short supplied record, not a bias-corrected climate normal.",
  "Sea surface temperature is a physical observation and never a marine-biological measurement; nothing here infers abundance, habitat, ecosystem condition, thermal stress, causation, or any future ocean temperature.",
] as const;

/**
 * Fit the first annual harmonic to the supplied observations' calendar-month SST
 * climatology and reduce it to a phase (peak-month timing), amplitude, and the
 * fraction of seasonal variance the harmonic explains.
 *
 * Returns an honest `insufficient-qualified-months` when fewer than
 * `minimumMonths` calendar months clear the underlying years-per-month floor,
 * and `degenerate-fit` when those months are so clustered on the calendar that
 * they cannot constrain the three parameters. The phase is withheld (but the
 * amplitude and variance-explained still reported) when the fitted sinusoid is
 * essentially flat.
 */
export function summarizeSstSeasonalHarmonic(
  observations: readonly SeaSurfaceTemperatureObservation[],
  options: SstSeasonalHarmonicOptions = {}
): SstSeasonalHarmonicSummary {
  const requiredMonths =
    options.minimumMonths ?? MINIMUM_MONTHS_FOR_ANNUAL_HARMONIC;
  const validRequiredMonths =
    Number.isInteger(requiredMonths) && requiredMonths >= 3;

  const cycle = summarizeSstSeasonalCycle(observations, options);
  const exclusions = withUnqualified(cycle.exclusions, cycle.months);

  if (!validRequiredMonths || cycle.status === "invalid") {
    return emptySummary(
      "invalid",
      cycle.footprint,
      requiredMonths,
      exclusions,
      "invalid-harmonic-configuration"
    );
  }

  if (cycle.footprint === null) {
    return emptySummary(
      "no-usable-observations",
      null,
      requiredMonths,
      exclusions,
      "no-usable-sst-observations"
    );
  }

  const qualified = cycle.months.filter((month) => month.qualified);
  if (qualified.length < requiredMonths) {
    return emptySummary(
      "insufficient-qualified-months",
      cycle.footprint,
      requiredMonths,
      exclusions,
      "too-few-qualified-calendar-months"
    );
  }

  const fit = fitAnnualHarmonic(qualified);
  if (fit === null) {
    return emptySummary(
      "degenerate-fit",
      cycle.footprint,
      requiredMonths,
      exclusions,
      "harmonic-normal-equations-degenerate"
    );
  }

  const amplitude = Math.hypot(fit.a, fit.b);
  const varianceExplained = fitVarianceExplained(qualified, fit);

  const base = {
    kind: "derived-sst-seasonal-harmonic" as const,
    isForecast: false as const,
    claimScope: "descriptive-sea-surface-temperature-only" as const,
    status: "available" as const,
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint: cycle.footprint,
    requiredMonths,
    monthsUsed: qualified.length,
    meanLevel: fit.level,
    amplitude,
    varianceExplained,
    unit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions,
    limitations: SST_SEASONAL_HARMONIC_LIMITATIONS,
  };

  // A flat fitted sinusoid has no defined direction of maximum; report the
  // (near-zero) amplitude but withhold a spurious peak month.
  if (amplitude <= AMPLITUDE_EPSILON) {
    return {
      ...base,
      phaseDegrees: null,
      peakMonth: null,
      peakCalendarMonth: null,
      peakMonthName: null,
      reason: "annual-harmonic-amplitude-negligible",
    };
  }

  // Maximum of level + a·cosθ + b·sinθ is at θ* = atan2(b, a).
  const phaseRadians = Math.atan2(fit.b, fit.a);
  const phaseDegrees = ((phaseRadians * 180) / Math.PI + 360) % 360;

  // Invert the mid-month placement θ_m = DEGREES_PER_MONTH·(m − 0.5): the
  // continuous peak month is phase/DEGREES_PER_MONTH + 0.5, wrapped to (0.5, 12.5].
  let peakMonth = phaseDegrees / DEGREES_PER_MONTH + 0.5;
  if (peakMonth <= 0.5) peakMonth += 12;

  const peakCalendarMonth = wrapCalendarMonth(Math.round(peakMonth));

  return {
    ...base,
    phaseDegrees,
    peakMonth,
    peakCalendarMonth,
    peakMonthName: MONTH_NAMES[peakCalendarMonth - 1],
    reason: null,
  };
}

interface AnnualHarmonicFit {
  /** Constant term (fitted annual-mean level). */
  level: number;
  /** Cosine coefficient. */
  a: number;
  /** Sine coefficient. */
  b: number;
}

/**
 * Ordinary-least-squares fit of `mean ≈ level + a·cos(θ) + b·sin(θ)` over the
 * qualifying months, solving the 3×3 normal equations by Cramer's rule. Returns
 * `null` when the normal matrix is too near-singular to invert reliably (months
 * too clustered on the calendar to separate the three terms).
 */
function fitAnnualHarmonic(
  months: readonly SstClimatologicalMonth[]
): AnnualHarmonicFit | null {
  const n = months.length;
  const cosTerms: number[] = [];
  const sinTerms: number[] = [];
  const ccTerms: number[] = [];
  const ssTerms: number[] = [];
  const csTerms: number[] = [];
  const yTerms: number[] = [];
  const ycTerms: number[] = [];
  const ysTerms: number[] = [];

  for (const month of months) {
    const angle = RADIANS_PER_MONTH * (month.calendarMonth - 0.5);
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const y = month.mean;
    cosTerms.push(c);
    sinTerms.push(s);
    ccTerms.push(c * c);
    ssTerms.push(s * s);
    csTerms.push(c * s);
    yTerms.push(y);
    ycTerms.push(y * c);
    ysTerms.push(y * s);
  }

  const sc = neumaierSum(cosTerms);
  const ss = neumaierSum(sinTerms);
  const scc = neumaierSum(ccTerms);
  const sss = neumaierSum(ssTerms);
  const scs = neumaierSum(csTerms);
  const sy = neumaierSum(yTerms);
  const syc = neumaierSum(ycTerms);
  const sys = neumaierSum(ysTerms);

  // Normal matrix M and right-hand side r for [level, a, b].
  //   | n   sc   ss  | | level |   | sy  |
  //   | sc  scc  scs | |   a   | = | syc |
  //   | ss  scs  sss | |   b   |   | sys |
  const det = determinant3(n, sc, ss, sc, scc, scs, ss, scs, sss);
  // The matrix entries scale with n, so the determinant scales with n³; gate on
  // that scale so the tolerance is dimensionless in the sample size.
  if (Math.abs(det) <= NORMAL_DETERMINANT_EPSILON * n * n * n) return null;

  const level = determinant3(sy, sc, ss, syc, scc, scs, sys, scs, sss) / det;
  const a = determinant3(n, sy, ss, sc, syc, scs, ss, sys, sss) / det;
  const b = determinant3(n, sc, sy, sc, scc, syc, ss, scs, sys) / det;

  if (!Number.isFinite(level) || !Number.isFinite(a) || !Number.isFinite(b)) {
    return null;
  }
  return { level, a, b };
}

/**
 * Coefficient of determination of the harmonic fit against the across-month
 * variance of the climatological means. Returns `null` when the means carry no
 * across-month variance (a flat climatology), where the ratio is undefined.
 */
function fitVarianceExplained(
  months: readonly SstClimatologicalMonth[],
  fit: AnnualHarmonicFit
): number | null {
  const means = months.map((month) => month.mean);
  const grandMean = neumaierSum(means) / means.length;

  const totalTerms: number[] = [];
  const residualTerms: number[] = [];
  for (const month of months) {
    const angle = RADIANS_PER_MONTH * (month.calendarMonth - 0.5);
    const fitted =
      fit.level + fit.a * Math.cos(angle) + fit.b * Math.sin(angle);
    const totalDev = month.mean - grandMean;
    const residual = month.mean - fitted;
    totalTerms.push(totalDev * totalDev);
    residualTerms.push(residual * residual);
  }

  const ssTotal = neumaierSum(totalTerms);
  if (ssTotal <= 0) return null;
  const ssResidual = neumaierSum(residualTerms);
  return clamp01(1 - ssResidual / ssTotal);
}

/** Determinant of the 3×3 matrix given in row-major order. */
function determinant3(
  a: number,
  b: number,
  c: number,
  d: number,
  e: number,
  f: number,
  g: number,
  h: number,
  i: number
): number {
  return a * (e * i - f * h) - b * (d * i - f * g) + c * (d * h - e * g);
}

/**
 * Carry the climatology's exclusion tally forward and add the count of gathered
 * calendar months that fell short of the per-month years floor.
 */
function withUnqualified(
  exclusions: SstSeasonalCycleExclusions,
  months: readonly SstClimatologicalMonth[]
): SstSeasonalHarmonicExclusions {
  return {
    ...exclusions,
    unqualifiedMonth: months.filter((month) => !month.qualified).length,
  };
}

function emptySummary(
  status: SstSeasonalHarmonicStatus,
  footprint: UsableSstFootprint | null,
  requiredMonths: number,
  exclusions: SstSeasonalHarmonicExclusions,
  reason: string
): SstSeasonalHarmonicSummary {
  return {
    kind: "derived-sst-seasonal-harmonic",
    isForecast: false,
    claimScope: "descriptive-sea-surface-temperature-only",
    status,
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    footprint,
    requiredMonths,
    monthsUsed: 0,
    meanLevel: null,
    amplitude: null,
    phaseDegrees: null,
    peakMonth: null,
    peakCalendarMonth: null,
    peakMonthName: null,
    varianceExplained: null,
    unit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    exclusions,
    limitations: SST_SEASONAL_HARMONIC_LIMITATIONS,
    reason,
  };
}

/** Clamp a value to [0, 1], guarding tiny floating-point overshoots. */
function clamp01(value: number): number {
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

/** Map a rounded month value onto 1..12, treating December and January as adjacent. */
function wrapCalendarMonth(month: number): number {
  return ((month - 1) % 12) + 1;
}
