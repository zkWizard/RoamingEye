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
 * Descriptive *cycle modality* of a supplied monthly NDVI series: how many times
 * the observed month-to-month trend reverses direction, and therefore whether
 * the trace reads as a single-peak (unimodal) run or a multi-peak run.
 *
 * {@link summarizeAnnualNdviPhenology} reduces a year to just its highest (peak)
 * and lowest (trough) supplied monthly MOD13A3 NDVI observation. Two years with
 * an identical peak and trough can still trace very different annual shapes: one
 * rising once to a single greenest month and falling back (a single-season,
 * unimodal trace), the other rising, falling, and rising again to a second
 * maximum (a two-peak trace, as commonly seen where two wet seasons or two crop
 * cycles fall in one year). The extrema-based descriptors cannot express that
 * distinction because it lives in the *interior* turning points, not the global
 * maximum and minimum. This helper supplies exactly that missing shape feature.
 *
 * Method. It consumes the already-validated, gap-aware consecutive-month
 * transitions from {@link summarizeNdviMonthlyChange} — reusing that module's
 * coverage accounting, NASA provenance, and, crucially, its `little-change`
 * dead-band, which absorbs sub-threshold sensor wiggles so they do not fabricate
 * turning points. Transitions are grouped into maximal gap-free runs (a break in
 * the one-calendar-month chain starts a new run; gaps are never bridged). Within
 * each run the signed trend is walked with a dead band: a `greening` transition
 * after a falling trend marks a local *greenness minimum* (down→up reversal); a
 * `browning` transition after a rising trend marks a local *greenness maximum*
 * (up→down reversal); `little-change` transitions continue the current trend and
 * never, on their own, count as a reversal. The turning point is placed at the
 * shared month where the two runs meet (the reversing transition's earlier
 * month).
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - Reversals are counted in the *supplied* unitless index series only. They
 *    are NOT growing-season counts, cropping cycles, green-up/senescence onset
 *    dates, phenophases, a productivity, biomass, canopy, or land-cover claim,
 *    an anomaly against any climatology, a cause, or a forecast. A two-maximum
 *    trace is not "more productive" than a one-maximum trace.
 *  - The count depends on the inherited `little-change` dead band: a larger
 *    stability threshold suppresses more interior wiggles, so the threshold is
 *    always reported alongside the counts.
 *  - A monthly index is coarse; sub-monthly reversals are unobservable and
 *    missing months break a run rather than being interpolated across, so the
 *    reversal count is a floor on the true turning points, never an upper bound.
 *  - Segment/modality labels are presentation aids for reading the maxima count;
 *    the counts and reversal list themselves are the measurement and are always
 *    returned for auditability.
 */

/** Honest scope limits for the derived NDVI cycle-modality descriptor. */
export const NDVI_CYCLE_MODALITY_LIMITATIONS =
  "NDVI cycle modality counts how many times the supplied consecutive-month " +
  "MOD13A3 NDVI series reverses trend within each gap-free run — up→down " +
  "reversals are local greenness maxima, down→up reversals are local minima — " +
  "using the inherited little-change dead band to ignore sub-threshold wiggles. " +
  "It describes only the shape of the observed index trace (single-peak vs " +
  "multi-peak) and carries the shared cited provenance. It is NOT a count of " +
  "growing seasons or cropping cycles, a green-up or senescence date, a " +
  "phenophase, a productivity, biomass, or land-cover claim, a cause, or a " +
  "forecast. Because the index is monthly and gaps are never bridged, the count " +
  "is a floor on the true turning points, not an upper bound.";

export type NdviCycleModalityStatus = "available" | "no-transitions";

/** A turning point is either a local greenness maximum or minimum. */
export type NdviReversalKind = "greenness-maximum" | "greenness-minimum";

export interface NdviDirectionReversal {
  kind: NdviReversalKind;
  /** Calendar month at which the observed trend reversed (the turning point). */
  month: YearMonth;
  /** Calendar-season convention for the turning-point month; not a growth phase. */
  meteorologicalSeason: MeteorologicalSeason;
  /** Supplied NDVI at the turning-point month, unitless. */
  ndvi: number;
}

/**
 * Reading of a single gap-free run, by its count of interior greenness maxima.
 * A "maximum" here is an up→down trend reversal, never a global annual peak.
 */
export type NdviSegmentModality =
  "no-interior-maximum" | "single-maximum" | "multiple-maxima";

export interface NdviContiguousSegment {
  /** First month of the gap-free run of consecutive-month transitions. */
  startMonth: YearMonth;
  /** Last month of the gap-free run. */
  endMonth: YearMonth;
  /** Consecutive-month transitions forming this run (always >= 1). */
  transitionCount: number;
  /** Turning points within the run, in calendar order. */
  reversals: NdviDirectionReversal[];
  /** Up→down reversals: interior local greenness maxima. */
  greennessMaximaCount: number;
  /** Down→up reversals: interior local greenness minima. */
  greennessMinimaCount: number;
  modality: NdviSegmentModality;
}

export interface NdviCycleModalityCoverage {
  /** Consecutive-month transitions supplied by the change summary. */
  transitionCount: number;
  /** Maximal gap-free runs those transitions form. */
  segmentCount: number;
  /** Breaks between gap-free runs (data gaps within the monthly series). */
  gapCount: number;
  /** Little-change transitions treated as dead-band trend continuations. */
  littleChangeCount: number;
}

export interface NdviCycleModalitySummary {
  kind: "observed-ndvi-cycle-modality";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  status: NdviCycleModalityStatus;
  /** Dead band inherited from the change summary that suppressed noise wiggles. */
  stabilityThreshold: number;
  coverage: NdviCycleModalityCoverage;
  /** Gap-free runs, in calendar order. */
  segments: NdviContiguousSegment[];
  /** All turning points across every run, in calendar order. */
  reversals: NdviDirectionReversal[];
  /** Total up→down reversals (interior greenness maxima) across all runs. */
  totalGreennessMaximaCount: number;
  /** Total down→up reversals (interior greenness minima) across all runs. */
  totalGreennessMinimaCount: number;
  /** Run with the most greenness maxima; ties keep the earliest run. */
  mostMultimodalSegment: NdviContiguousSegment | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no reversals can be reported. */
  reason: "no-consecutive-month-transitions" | null;
}

/** Absolute month index for one-calendar-month adjacency checks. */
function monthIndex(month: YearMonth): number {
  return month.year * 12 + (month.month - 1);
}

/**
 * Summarize the trend-reversal modality of an NDVI change summary.
 *
 * Reuses the validated transitions, hemisphere, dead-band threshold, and NASA
 * provenance from {@link summarizeNdviMonthlyChange}; it re-parses nothing and
 * drops no dataset reference. Transitions that are more than one calendar month
 * apart already never appear in the change summary, so grouping only needs to
 * detect where one run's later month fails to equal the next run's earlier
 * month — a genuine data gap — and start a fresh run there rather than bridge it.
 */
export function summarizeNdviCycleModality(
  change: NdviChangeSummary
): NdviCycleModalitySummary {
  const base = {
    kind: "observed-ndvi-cycle-modality" as const,
    isForecast: false as const,
    hemisphere: change.hemisphere,
    stabilityThreshold: change.stabilityThreshold,
    source: change.source ?? NDVI_SOURCE,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  const transitions = change.changes;
  const littleChangeCount = transitions.filter(
    (t) => t.direction === "little-change"
  ).length;

  if (transitions.length === 0) {
    return {
      ...base,
      status: "no-transitions",
      coverage: {
        transitionCount: 0,
        segmentCount: 0,
        gapCount: 0,
        littleChangeCount: 0,
      },
      segments: [],
      reversals: [],
      totalGreennessMaximaCount: 0,
      totalGreennessMinimaCount: 0,
      mostMultimodalSegment: null,
      reason: "no-consecutive-month-transitions",
    };
  }

  const runs = groupContiguousRuns(transitions);
  const segments = runs.map((run) => describeSegment(run, change.hemisphere));

  const reversals = segments.flatMap((segment) => segment.reversals);
  const totalGreennessMaximaCount = segments.reduce(
    (sum, segment) => sum + segment.greennessMaximaCount,
    0
  );
  const totalGreennessMinimaCount = segments.reduce(
    (sum, segment) => sum + segment.greennessMinimaCount,
    0
  );

  return {
    ...base,
    status: "available",
    coverage: {
      transitionCount: transitions.length,
      segmentCount: segments.length,
      gapCount: segments.length - 1,
      littleChangeCount,
    },
    segments,
    reversals,
    totalGreennessMaximaCount,
    totalGreennessMinimaCount,
    mostMultimodalSegment: mostMultimodal(segments),
    reason: null,
  };
}

/**
 * Split ordered consecutive-month transitions into maximal gap-free runs. A run
 * continues only while each transition's earlier month equals the previous
 * transition's later month; any break (a data gap) starts a new run.
 */
function groupContiguousRuns(
  transitions: readonly NdviMonthlyChange[]
): NdviMonthlyChange[][] {
  const runs: NdviMonthlyChange[][] = [];
  let current: NdviMonthlyChange[] = [];
  for (const transition of transitions) {
    const previous = current[current.length - 1];
    if (previous && monthIndex(transition.from) !== monthIndex(previous.to)) {
      runs.push(current);
      current = [];
    }
    current.push(transition);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Walk one gap-free run's signed directions with a dead band and record every
 * trend reversal. `little-change` transitions never reset the trend, so a flat
 * top between a rise and a fall still resolves to a single greenness maximum.
 */
function describeSegment(
  run: readonly NdviMonthlyChange[],
  hemisphere: Hemisphere
): NdviContiguousSegment {
  const reversals: NdviDirectionReversal[] = [];
  let trend: "up" | "down" | null = null;

  for (const transition of run) {
    if (transition.direction === "greening") {
      if (trend === "down") {
        reversals.push(reversalAt(transition, "greenness-minimum", hemisphere));
      }
      trend = "up";
    } else if (transition.direction === "browning") {
      if (trend === "up") {
        reversals.push(reversalAt(transition, "greenness-maximum", hemisphere));
      }
      trend = "down";
    }
    // `little-change`: dead-band continuation; leaves the trend untouched.
  }

  const greennessMaximaCount = reversals.filter(
    (reversal) => reversal.kind === "greenness-maximum"
  ).length;
  const greennessMinimaCount = reversals.length - greennessMaximaCount;

  return {
    startMonth: run[0].from,
    endMonth: run[run.length - 1].to,
    transitionCount: run.length,
    reversals,
    greennessMaximaCount,
    greennessMinimaCount,
    modality: modalityFor(greennessMaximaCount),
  };
}

/** A reversal is placed at the reversing transition's earlier month. */
function reversalAt(
  transition: NdviMonthlyChange,
  kind: NdviReversalKind,
  hemisphere: Hemisphere
): NdviDirectionReversal {
  return {
    kind,
    month: transition.from,
    meteorologicalSeason: meteorologicalSeasonForMonth(
      transition.from.month,
      hemisphere
    ),
    ndvi: transition.fromNdvi,
  };
}

function modalityFor(greennessMaximaCount: number): NdviSegmentModality {
  if (greennessMaximaCount === 0) return "no-interior-maximum";
  if (greennessMaximaCount === 1) return "single-maximum";
  return "multiple-maxima";
}

/**
 * The run with the most interior greenness maxima. `segments` is ordered oldest
 * to newest and only a strictly larger count replaces the running best, so ties
 * resolve to the earliest run.
 */
function mostMultimodal(
  segments: readonly NdviContiguousSegment[]
): NdviContiguousSegment | null {
  let best: NdviContiguousSegment | null = null;
  for (const segment of segments) {
    if (
      best === null ||
      segment.greennessMaximaCount > best.greennessMaximaCount
    ) {
      best = segment;
    }
  }
  return best;
}
