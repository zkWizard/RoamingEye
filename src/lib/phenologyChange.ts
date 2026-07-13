import {
  NDVI_SOURCE,
  NDVI_UNIT,
  hemisphereForLatitude,
  meteorologicalSeasonForMonth,
  type Hemisphere,
  type MeteorologicalSeason,
  type NdviMonthlyObservation,
} from "./phenology";
import { type DatasetRef, type YearMonth } from "./timeline";

/**
 * Month-over-month direction descriptors for already-calibrated NDVI series.
 *
 * A "greening"/"browning" label here describes the direction of the MOD13A3
 * NDVI index between two supplied consecutive calendar months. It is not a
 * verified green-up or senescence event, nor a claim about plant growth
 * stages, crop performance, ecosystem condition, biomass, or causes. Changes
 * are only formed between observations exactly one calendar month apart;
 * missing months break the chain and are never interpolated across.
 */

/** Default |ΔNDVI| at or below which a transition is reported as little change. */
export const DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD = 0.05;

export interface NdviMonthlyChangeOptions {
  /** Index-difference magnitude treated as "little-change"; default 0.05. */
  stabilityThreshold?: number;
  /** Minimum reported valid fraction for an endpoint to count; default 0. */
  minimumValidFraction?: number;
}

/** Index-direction label between two months; never a biological determination. */
export type NdviChangeDirection = "greening" | "browning" | "little-change";

export interface NdviMonthlyChange {
  from: YearMonth;
  to: YearMonth;
  fromNdvi: number;
  toNdvi: number;
  /** toNdvi minus fromNdvi, in unitless NDVI. */
  delta: number;
  direction: NdviChangeDirection;
  /** Lowest reported valid fraction across the two endpoints, or null. */
  minimumValidFraction: number | null;
  /** Calendar-season convention for the later month; not a growth phase. */
  toSeason: MeteorologicalSeason;
}

export interface NdviChangeCoverage {
  /** Records supplied by the caller, including missing and invalid ones. */
  observationCount: number;
  /** Distinct valid months with a usable, in-range NDVI meeting coverage. */
  usableMonthCount: number;
  /** Valid distinct months whose value was missing or had zero coverage. */
  missingMonthCount: number;
  /** Distinct valid months dropped for reporting below the coverage floor. */
  lowCoverageMonthCount: number;
  /** Records rejected for invalid month, value, coverage, or duplicate month. */
  invalidRecordCount: number;
  /** Adjacent one-calendar-month pairs with a usable value at both endpoints. */
  transitionCount: number;
  /** Adjacent usable observations that were more than one month apart. */
  gapCount: number;
}

export interface NdviChangeSummary {
  kind: "observed-monthly-ndvi-change";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  stabilityThreshold: number;
  requiredValidFraction: number;
  coverage: NdviChangeCoverage;
  /** Consecutive-month transitions, sorted oldest to newest. */
  changes: NdviMonthlyChange[];
  greeningCount: number;
  browningCount: number;
  littleChangeCount: number;
  /** Transition with the largest positive delta, or null when none greened. */
  steepestGreening: NdviMonthlyChange | null;
  /** Transition with the largest-magnitude negative delta, or null. */
  steepestBrowning: NdviMonthlyChange | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
}

interface UsableObservation {
  /** Absolute month index (year * 12 + month - 1) for adjacency checks. */
  index: number;
  month: YearMonth;
  ndvi: number;
  validFraction: number | null;
}

/**
 * Describe the direction of a supplied monthly NDVI series month by month.
 * Duplicate months are rejected rather than averaged, and a transition is
 * reported only when two usable observations fall in consecutive calendar
 * months, so a data gap can never be silently bridged into a false trend.
 */
export function summarizeNdviMonthlyChange(
  observations: readonly NdviMonthlyObservation[],
  latitude: number,
  options: NdviMonthlyChangeOptions = {}
): NdviChangeSummary {
  const hemisphere = hemisphereForLatitude(latitude);
  const stabilityThreshold = normalizeThreshold(options.stabilityThreshold);
  const requiredValidFraction = normalizeFraction(options.minimumValidFraction);

  const seenMonths = new Set<number>();
  const usable: UsableObservation[] = [];
  let missingMonthCount = 0;
  let lowCoverageMonthCount = 0;
  let invalidRecordCount = 0;

  for (const observation of observations) {
    if (!isCalendarMonth(observation.month)) {
      invalidRecordCount += 1;
      continue;
    }
    const index = monthIndex(observation.month);
    if (seenMonths.has(index)) {
      invalidRecordCount += 1;
      continue;
    }
    seenMonths.add(index);

    const fraction = observation.validFraction;
    if (
      fraction !== undefined &&
      (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
    ) {
      invalidRecordCount += 1;
      continue;
    }
    if (observation.ndvi === null || fraction === 0) {
      missingMonthCount += 1;
      continue;
    }
    if (
      !Number.isFinite(observation.ndvi) ||
      observation.ndvi < -1 ||
      observation.ndvi > 1
    ) {
      invalidRecordCount += 1;
      continue;
    }
    if (fraction !== undefined && fraction < requiredValidFraction) {
      lowCoverageMonthCount += 1;
      continue;
    }

    usable.push({
      index,
      month: observation.month,
      ndvi: observation.ndvi,
      validFraction: fraction ?? null,
    });
  }

  usable.sort((a, b) => a.index - b.index);

  const changes: NdviMonthlyChange[] = [];
  let gapCount = 0;
  for (let i = 1; i < usable.length; i += 1) {
    const previous = usable[i - 1];
    const current = usable[i];
    if (current.index - previous.index !== 1) {
      gapCount += 1;
      continue;
    }
    const delta = current.ndvi - previous.ndvi;
    changes.push({
      from: previous.month,
      to: current.month,
      fromNdvi: previous.ndvi,
      toNdvi: current.ndvi,
      delta,
      direction: directionFor(delta, stabilityThreshold),
      minimumValidFraction: minFraction(
        previous.validFraction,
        current.validFraction
      ),
      toSeason: meteorologicalSeasonForMonth(current.month.month, hemisphere),
    });
  }

  const greeningCount = changes.filter(
    (c) => c.direction === "greening"
  ).length;
  const browningCount = changes.filter(
    (c) => c.direction === "browning"
  ).length;
  const littleChangeCount = changes.length - greeningCount - browningCount;

  return {
    kind: "observed-monthly-ndvi-change",
    isForecast: false,
    hemisphere,
    stabilityThreshold,
    requiredValidFraction,
    coverage: {
      observationCount: observations.length,
      usableMonthCount: usable.length,
      missingMonthCount,
      lowCoverageMonthCount,
      invalidRecordCount,
      transitionCount: changes.length,
      gapCount,
    },
    changes,
    greeningCount,
    browningCount,
    littleChangeCount,
    steepestGreening: steepest(changes, "greening"),
    steepestBrowning: steepest(changes, "browning"),
    source: NDVI_SOURCE,
    unit: NDVI_UNIT,
  };
}

function directionFor(
  delta: number,
  stabilityThreshold: number
): NdviChangeDirection {
  if (Math.abs(delta) <= stabilityThreshold) return "little-change";
  return delta > 0 ? "greening" : "browning";
}

/**
 * Return the transition with the most extreme delta in the requested
 * direction. Ties keep the earliest transition, since `changes` is already
 * ordered oldest to newest and only a strictly larger magnitude replaces it.
 */
function steepest(
  changes: readonly NdviMonthlyChange[],
  direction: Extract<NdviChangeDirection, "greening" | "browning">
): NdviMonthlyChange | null {
  let best: NdviMonthlyChange | null = null;
  for (const change of changes) {
    if (change.direction !== direction) continue;
    if (best === null || Math.abs(change.delta) > Math.abs(best.delta)) {
      best = change;
    }
  }
  return best;
}

function minFraction(a: number | null, b: number | null): number | null {
  if (a === null) return b;
  if (b === null) return a;
  return Math.min(a, b);
}

function normalizeThreshold(threshold: number | undefined): number {
  if (threshold === undefined) return DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD;
  if (!Number.isFinite(threshold) || threshold < 0) {
    return DEFAULT_NDVI_CHANGE_STABILITY_THRESHOLD;
  }
  return threshold;
}

function normalizeFraction(fraction: number | undefined): number {
  if (fraction === undefined || !Number.isFinite(fraction) || fraction < 0) {
    return 0;
  }
  return fraction > 1 ? 1 : fraction;
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function monthIndex(month: YearMonth): number {
  return month.year * 12 + (month.month - 1);
}
