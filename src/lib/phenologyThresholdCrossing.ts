import {
  NDVI_SOURCE,
  NDVI_UNIT,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
} from "./phenology";
import type { NdviChangeSummary, NdviMonthlyChange } from "./phenologyChange";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Amplitude-relative *threshold crossings* in a supplied monthly NDVI series:
 * the month pairs across which the index passes a level set part-way between
 * the window's observed trough and peak.
 *
 * The existing descriptors report where the extrema fall
 * ({@link summarizeAnnualNdviPhenology}), how large the peak-to-trough range is
 * ({@link summarizeNdviSeasonalAmplitude}), which way the index moves between
 * the two ({@link describeNdviAnnualLimb}), and how many interior turning points
 * the trace has ({@link summarizeNdviCycleModality}). None of them can say *when
 * the series passed a given greenness level* — the extrema are single months and
 * the limb spans the whole interval between them, so two traces with identical
 * extrema and identical amplitude can cross the half-amplitude level months
 * apart. This helper supplies exactly that missing feature.
 *
 * Method. The amplitude-fraction threshold is the long-standing convention in
 * the land-surface-phenology literature (the half-maximum level of White et al.,
 * *Global Biogeochem. Cycles* 11(2), 1997; the amplitude-fraction thresholds
 * used by TIMESAT, Jönsson & Eklundh, *Comput. Geosci.* 30(8), 2004). The level
 * is `trough + fraction * (peak - trough)`, with `fraction` defaulting to 0.5.
 * Reference extrema are taken from the endpoints of the retained
 * consecutive-month transitions of {@link summarizeNdviMonthlyChange} — exactly
 * the values across which a crossing is detectable — so the module re-parses
 * nothing and inherits that summary's coverage accounting, gap handling, and
 * NASA provenance. Transitions are grouped into maximal gap-free runs; a break
 * in the one-calendar-month chain starts a new run and is never bridged. Within
 * a run the side of the level is tracked, and a crossing is recorded at the
 * transition where that side flips. A value sitting exactly on the level keeps
 * the side it arrived with, so a series that touches the level and retreats
 * never fabricates a crossing pair.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - A crossing is bracketed by a *month pair*, never dated. MOD13A3 is a
 *    monthly composite, so the true crossing lies somewhere inside a ~30-day
 *    window; `linearFractionWithinInterval` is arithmetic on the two composite
 *    values, not an observed transition date.
 *  - This is NOT a start-of-season or end-of-season date, a green-up or
 *    senescence onset, a phenophase, or a growth stage. It is the month pair in
 *    which a unitless index passed an arithmetic level.
 *  - The level is *window-relative*: it is derived from the extrema of the
 *    supplied series, not from a fixed climatology. Crossings from different
 *    windows are therefore not directly comparable, and the reference extrema
 *    are always returned so a caller can check what the level meant.
 *  - Near-flat traces are refused rather than reported, because a level placed
 *    inside sensor noise produces crossings that describe the noise.
 *  - Gaps break runs instead of being interpolated across, so the crossing count
 *    is a floor on the true crossings, never an upper bound.
 *  - Nothing here infers biomass, productivity, canopy cover, habitat quality,
 *    ecosystem condition, land-cover type, causes, or future conditions.
 */

/** Half-maximum: the conventional default amplitude fraction. */
export const DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION = 0.5;

/**
 * Smallest observed peak-to-trough NDVI range for which a threshold crossing is
 * reported. Below this the level sits inside the composite's own variability,
 * so any crossing would describe noise rather than a seasonal transition.
 */
export const MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS = 0.1;

/** Honest scope limits for the derived NDVI threshold-crossing descriptor. */
export const NDVI_THRESHOLD_CROSSING_LIMITATIONS =
  "NDVI threshold crossings report the consecutive-month MOD13A3 pairs across " +
  "which the supplied index passes a level set a fraction of the way from the " +
  "window's observed trough to its observed peak, carrying the shared cited " +
  "provenance. Because the index is a monthly composite, a crossing is " +
  "bracketed by a month pair and never dated, and because gaps are never " +
  "bridged the count is a floor on the true crossings. The level is derived " +
  "from the supplied window's own extrema, so crossings from different windows " +
  "are not directly comparable. It is NOT a start-of-season or end-of-season " +
  "date, a green-up or senescence onset, a phenophase, a growth stage, a " +
  "productivity, biomass, canopy, or land-cover claim, a cause, or a forecast.";

export type NdviThresholdCrossingStatus =
  "available" | "no-transitions" | "insufficient-amplitude";

/** Which way the index moved across the level, in calendar order. */
export type NdviThresholdCrossingDirection = "upward" | "downward";

export interface NdviThresholdCrossing {
  direction: NdviThresholdCrossingDirection;
  /** Earlier month of the bracketing pair; not the crossing date. */
  from: YearMonth;
  /** Later month of the bracketing pair; not the crossing date. */
  to: YearMonth;
  /** Supplied NDVI at the earlier month, unitless. */
  fromNdvi: number;
  /** Supplied NDVI at the later month, unitless. */
  toNdvi: number;
  /**
   * Where the level falls between the two endpoint values under linear
   * interpolation: 0 sits on the earlier month, 1 on the later one. Arithmetic
   * on two monthly composites, not an observed sub-monthly date.
   */
  linearFractionWithinInterval: number;
  /** Calendar-season convention for the later month; not a growth phase. */
  toSeason: MeteorologicalSeason;
  /** Lowest reported valid fraction across the pair, inherited verbatim. */
  minimumValidFraction: number | null;
}

export interface NdviThresholdReference {
  /** Highest transition-endpoint NDVI in the supplied window. */
  peak: number;
  /** Month of that highest endpoint; ties keep the earliest month. */
  peakMonth: YearMonth;
  /** Lowest transition-endpoint NDVI in the supplied window. */
  trough: number;
  /** Month of that lowest endpoint; ties keep the earliest month. */
  troughMonth: YearMonth;
  /** peak - trough over the transition endpoints; always >= 0. */
  amplitude: number;
  /** trough + thresholdFraction * amplitude, the level actually tested. */
  level: number;
}

export interface NdviThresholdCrossingCoverage {
  /** Consecutive-month transitions supplied by the change summary. */
  transitionCount: number;
  /** Distinct observed months represented by transition endpoints. */
  observedMonthCount: number;
  /** Maximal gap-free runs those transitions form. */
  gapFreeRunCount: number;
  /** Breaks between those runs; a crossing inside a break is unobservable. */
  runBreakCount: number;
  /**
   * Gaps between adjacent usable months in the parent monthly series,
   * inherited rather than re-derived so isolated usable months stay counted.
   */
  gapCount: number;
  /** Distinct months with a usable value meeting the parent coverage floor. */
  usableMonthCount: number;
  /** Valid months with null NDVI or explicitly zero coverage. */
  missingMonthCount: number;
  /** Valid months excluded for falling below the required coverage floor. */
  lowCoverageMonthCount: number;
  /** Records rejected for invalid month, value, coverage, or duplicate month. */
  invalidRecordCount: number;
}

export interface NdviThresholdCrossingSummary {
  kind: "observed-ndvi-threshold-crossings";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  status: NdviThresholdCrossingStatus;
  /** Amplitude fraction actually applied after validation. */
  thresholdFraction: number;
  /** Amplitude floor actually applied after validation. */
  minimumAmplitude: number;
  /** Parent summary's minimum usable sampled fraction, preserved verbatim. */
  requiredValidFraction: number;
  coverage: NdviThresholdCrossingCoverage;
  /**
   * Extrema and level the crossings were tested against. Null when there are no
   * transitions to derive them from; present even when the amplitude was too
   * small, so a caller can see how flat the trace actually was.
   */
  reference: NdviThresholdReference | null;
  /** Crossings across every run, in calendar order. */
  crossings: NdviThresholdCrossing[];
  upwardCount: number;
  downwardCount: number;
  source: DatasetRef;
  /** Short machine-readable reason when no crossings can be reported. */
  reason: "no-consecutive-month-transitions" | "amplitude-below-floor" | null;
  unit: typeof NDVI_UNIT;
}

/** Absolute month index for one-calendar-month adjacency checks. */
function monthIndex(month: YearMonth): number {
  return month.year * 12 + (month.month - 1);
}

/**
 * Report where a monthly NDVI series crosses an amplitude-relative level.
 *
 * Reuses the validated transitions, hemisphere, coverage accounting, and NASA
 * provenance from {@link summarizeNdviMonthlyChange}; it re-parses nothing and
 * drops no dataset reference. The change summary's `little-change` dead band
 * deliberately plays no part here: that band exists to label a transition's
 * *direction*, whereas a level crossing is a question about the values
 * themselves, and suppressing it would let a series drift across the level
 * unreported.
 */
export function summarizeNdviThresholdCrossings(
  change: NdviChangeSummary,
  options: {
    /** Fraction of the observed amplitude, exclusive of 0 and 1; default 0.5. */
    thresholdFraction?: number;
    /** Smallest reportable amplitude; default 0.1 NDVI. */
    minimumAmplitude?: number;
  } = {}
): NdviThresholdCrossingSummary {
  const thresholdFraction = normalizeFraction(options.thresholdFraction);
  const minimumAmplitude = normalizeAmplitude(options.minimumAmplitude);

  const base = {
    kind: "observed-ndvi-threshold-crossings" as const,
    isForecast: false as const,
    hemisphere: change.hemisphere,
    thresholdFraction,
    minimumAmplitude,
    requiredValidFraction: change.requiredValidFraction,
    source: change.source ?? NDVI_SOURCE,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  const runs = groupIntoGapFreeRuns(change.changes);
  const coverage: NdviThresholdCrossingCoverage = {
    transitionCount: change.changes.length,
    observedMonthCount: countEndpointMonths(change.changes),
    gapFreeRunCount: runs.length,
    runBreakCount: runs.length > 0 ? runs.length - 1 : 0,
    gapCount: change.coverage.gapCount,
    usableMonthCount: change.coverage.usableMonthCount,
    missingMonthCount: change.coverage.missingMonthCount,
    lowCoverageMonthCount: change.coverage.lowCoverageMonthCount,
    invalidRecordCount: change.coverage.invalidRecordCount,
  };

  if (change.changes.length === 0) {
    return {
      ...base,
      status: "no-transitions",
      coverage,
      reference: null,
      crossings: [],
      upwardCount: 0,
      downwardCount: 0,
      reason: "no-consecutive-month-transitions",
    };
  }

  const reference = referenceFor(change.changes, thresholdFraction);

  // A level placed inside a near-flat trace tracks sensor noise, not a seasonal
  // transition, so the reference is still returned but no crossings are.
  if (reference.amplitude < minimumAmplitude) {
    return {
      ...base,
      status: "insufficient-amplitude",
      coverage,
      reference,
      crossings: [],
      upwardCount: 0,
      downwardCount: 0,
      reason: "amplitude-below-floor",
    };
  }

  const crossings: NdviThresholdCrossing[] = [];
  for (const run of runs) {
    crossings.push(...crossingsWithinRun(run, reference.level, change));
  }

  const upwardCount = crossings.filter((c) => c.direction === "upward").length;

  return {
    ...base,
    status: "available",
    coverage,
    reference,
    crossings,
    upwardCount,
    downwardCount: crossings.length - upwardCount,
    reason: null,
  };
}

/**
 * Split transitions into maximal runs of consecutive calendar months.
 *
 * Transitions more than one month apart already never appear in a change
 * summary, so grouping only has to detect where one transition's later month
 * fails to be the next one's earlier month — a genuine data gap — and start a
 * fresh run there rather than bridge it.
 */
function groupIntoGapFreeRuns(
  changes: readonly NdviMonthlyChange[]
): NdviMonthlyChange[][] {
  const runs: NdviMonthlyChange[][] = [];
  let current: NdviMonthlyChange[] = [];

  for (const change of changes) {
    const previous = current[current.length - 1];
    if (previous && monthIndex(previous.to) !== monthIndex(change.from)) {
      runs.push(current);
      current = [];
    }
    current.push(change);
  }
  if (current.length > 0) runs.push(current);

  return runs;
}

/** Distinct months appearing as a transition endpoint. */
function countEndpointMonths(changes: readonly NdviMonthlyChange[]): number {
  const months = new Set<number>();
  for (const change of changes) {
    months.add(monthIndex(change.from));
    months.add(monthIndex(change.to));
  }
  return months.size;
}

/**
 * Derive the reference extrema and level from transition endpoints. Ties keep
 * the earliest month, since `changes` is already ordered oldest to newest and
 * only a strictly more extreme value replaces the incumbent.
 */
function referenceFor(
  changes: readonly NdviMonthlyChange[],
  thresholdFraction: number
): NdviThresholdReference {
  const first = changes[0];
  let peak = first.fromNdvi;
  let peakMonth = first.from;
  let trough = first.fromNdvi;
  let troughMonth = first.from;

  for (const change of changes) {
    for (const [value, month] of [
      [change.fromNdvi, change.from],
      [change.toNdvi, change.to],
    ] as const) {
      if (value > peak) {
        peak = value;
        peakMonth = month;
      }
      if (value < trough) {
        trough = value;
        troughMonth = month;
      }
    }
  }

  const amplitude = peak - trough;
  return {
    peak,
    peakMonth,
    trough,
    troughMonth,
    amplitude,
    level: trough + thresholdFraction * amplitude,
  };
}

/**
 * Walk one gap-free run and record the transitions where the series changes
 * side of the level. A value exactly on the level inherits the side it arrived
 * with, so touching the level and retreating yields no crossing at all rather
 * than a spurious up-then-down pair.
 */
function crossingsWithinRun(
  run: readonly NdviMonthlyChange[],
  level: number,
  change: NdviChangeSummary
): NdviThresholdCrossing[] {
  const crossings: NdviThresholdCrossing[] = [];
  let side = sideOf(run[0].fromNdvi, level, "below");

  for (const transition of run) {
    const next = sideOf(transition.toNdvi, level, side);
    if (next !== side) {
      crossings.push({
        direction: next === "above" ? "upward" : "downward",
        from: transition.from,
        to: transition.to,
        fromNdvi: transition.fromNdvi,
        toNdvi: transition.toNdvi,
        linearFractionWithinInterval: interpolate(
          transition.fromNdvi,
          transition.toNdvi,
          level
        ),
        toSeason: meteorologicalSeasonForMonth(
          transition.to.month,
          change.hemisphere
        ),
        minimumValidFraction: transition.minimumValidFraction,
      });
      side = next;
    }
  }

  return crossings;
}

type LevelSide = "above" | "below";

/** Position relative to the level; a value on the level keeps the prior side. */
function sideOf(value: number, level: number, inherited: LevelSide): LevelSide {
  if (value > level) return "above";
  if (value < level) return "below";
  return inherited;
}

/**
 * Linear position of the level between two endpoint values. A crossing implies
 * the endpoints differ and the level lies within the closed interval they span,
 * so the result is always in [0, 1]; the `-0` case is normalized to 0.
 */
function interpolate(from: number, to: number, level: number): number {
  const fraction = (level - from) / (to - from);
  return fraction === 0 ? 0 : fraction;
}

function normalizeFraction(fraction: number | undefined): number {
  if (fraction === undefined) return DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION;
  if (!Number.isFinite(fraction) || fraction <= 0 || fraction >= 1) {
    // 0 and 1 land exactly on the extrema, where the side-tracking walk cannot
    // express a crossing, so they fall back rather than silently report none.
    return DEFAULT_NDVI_AMPLITUDE_THRESHOLD_FRACTION;
  }
  return fraction;
}

function normalizeAmplitude(amplitude: number | undefined): number {
  if (amplitude === undefined) return MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS;
  if (!Number.isFinite(amplitude) || amplitude < 0) {
    return MINIMUM_NDVI_AMPLITUDE_FOR_CROSSINGS;
  }
  return amplitude;
}
