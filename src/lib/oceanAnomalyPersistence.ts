import { formatYm, type DatasetRef, type YearMonth } from "./timeline";
import { SEA_SURFACE_TEMPERATURE_METRIC } from "./oceanConditions";
import type {
  OceanSeasonalBaselineComparison,
  UsableSstFootprint,
} from "./oceanSeasonalBaseline";

/**
 * Persistence of a warm or cool sea-surface-temperature anomaly across a run of
 * monthly same-calendar-month baselines.
 *
 * `compareSstToSeasonalBaseline` compares ONE month's SST to prior same-
 * calendar-month, same-footprint observations and reports that month's anomaly
 * (in °C) and its standardized value. On its own each comparison is a single
 * snapshot. Neither it nor the anomaly-context helper answers the plainest
 * multi-month question about a probed point: has the sea surface stayed warmer
 * (or cooler) than its own seasonal history, and for how many consecutive most-
 * recent months? A one-month warm anomaly reads very differently from a point
 * that has sat above its seasonal baseline all window.
 *
 * This helper answers exactly that. Given a chronological run of completed
 * baseline comparisons, it takes the sign of each usable month's anomaly (warm /
 * cool / neutral) and reports the most-recent usable month's direction and the
 * length of the strictly calendar-adjacent, same-footprint, same-direction run
 * of usable months ending at it. It also tallies, over the usable window, how
 * many months fell warm, cool, or neutral. It is a purely descriptive reduction
 * of already-computed anomalies:
 *
 *  - Each month's anomaly is relative to its OWN same-calendar-month baseline,
 *    so a run is a *seasonally adjusted* persistence: "warmer than a typical
 *    May, then a typical June, then a typical July", never raw warmth. All the
 *    caveats of `oceanSeasonalBaseline` carry through — an anomaly here is an
 *    arithmetic difference from a short observed record, not a climate normal.
 *  - This is NOT a marine heatwave. The Hobday et al. (2016) definition needs
 *    daily SST above a seasonally varying 90th-percentile climatology for at
 *    least five consecutive days; monthly MODIS/Aqua SST at this resolution
 *    cannot resolve events, thresholds, or durations. Persistence here is a
 *    coarse count of consecutive months whose monthly anomaly shares a sign.
 *  - Open-water and land-mixed coastal footprints are never mixed: a footprint
 *    change ends the run, and the run's footprint is reported so consumers do
 *    not read across incomparable surfaces.
 *  - Only comparisons that actually produced an anomaly count. Land, no-data,
 *    insufficient-sample, and invalid comparisons are dropped from the usable
 *    subset (flagged via `hasGaps`) and break the calendar-adjacent run rather
 *    than being invented, interpolated, or silently bridged.
 *  - No forecast, trend, causation, or biological inference is added. A long run
 *    is not a claim that the anomaly will hold next month, nor about bleaching,
 *    abundance, habitat, ecosystem health, or hazard.
 *
 * Callers must supply the comparisons in ascending calendar order (oldest
 * first); `isConsecutiveRun` reports whether the supplied window is itself a
 * contiguous calendar run. Provenance is inherited from `oceanConditions`, so a
 * publication cites the SST dataset, not the picture. Pure, render-free logic
 * (see oceanAnomalyPersistence.test.ts).
 */

export type OceanAnomalyPersistenceStatus = "available" | "no-usable-months";

/** Sign of one month's SST anomaly relative to its own seasonal baseline. */
export type OceanAnomalyDirection = "warm" | "cool" | "neutral";

/** Direction of the trailing run; `none` when the latest month is neutral. */
export type OceanAnomalyRunDirection = "warm" | "cool" | "none";

/** Extra caveats specific to reducing a run of anomalies to a persistence count. */
export const OCEAN_ANOMALY_PERSISTENCE_LIMITATIONS = [
  "Each month's anomaly is an arithmetic difference from a short same-calendar-month, same-footprint observed record, not a climate-normal departure; persistence inherits every limitation of that baseline.",
  "This is not a marine heatwave: the Hobday et al. (2016) definition requires daily SST above a seasonally varying 90th-percentile climatology for at least five consecutive days, which monthly SST cannot resolve. A run here only counts consecutive months whose monthly anomaly shares a sign.",
  "Direction is the sign of the anomaly (with an optional neutral deadband); a different threshold or baseline would count a different run, and a near-zero month is reported neutral rather than forced warm or cool.",
  "Only comparisons that produced an anomaly count; land, no-data, insufficient-sample, and invalid months are dropped from the usable subset and break the calendar-adjacent run rather than being interpolated across.",
  "The run is measured within the supplied window only and may extend earlier than the earliest supplied month; it says nothing about months not provided, and never implies a forecast, cause, or any marine-biological outcome.",
] as const;

/** How many usable window months fell in one anomaly direction. */
export interface OceanAnomalyDirectionTenure {
  direction: OceanAnomalyDirection;
  /** Usable months of the window with this anomaly direction. */
  months: number;
  /** Share of usable months in this direction, in [0, 1]. */
  fractionOfUsableMonths: number;
}

export interface OceanAnomalyPersistence {
  kind: "sea-surface-temperature-anomaly-persistence";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: OceanAnomalyPersistenceStatus;
  /** SST dataset the underlying anomalies were derived from; always cited. */
  source: DatasetRef;
  /** Unit of `currentAnomaly`; the SST source unit (°C), never converted. */
  anomalyUnit: string;
  /** Neutral deadband (source unit); |anomaly| <= this is reported neutral. */
  neutralAnomalyThreshold: number;
  /** Number of supplied comparisons. */
  observedMonths: number;
  /** Supplied comparisons that yielded a usable anomaly. */
  usableMonths: number;
  /** True when some supplied comparison could not contribute a usable anomaly. */
  hasGaps: boolean;
  /** True when the supplied comparisons' months form a strict calendar run. */
  isConsecutiveRun: boolean;
  /** Footprint the current run is restricted to, or null when unavailable. */
  footprint: UsableSstFootprint | null;
  /** Most-recent usable month, or null when none are usable. */
  latestUsableMonth: YearMonth | null;
  /** Anomaly (source unit) of the most-recent usable month, or null. */
  currentAnomaly: number | null;
  /** Standardized anomaly of the most-recent usable month, when defined. */
  currentStandardizedAnomaly: number | null;
  /** Anomaly direction of the most-recent usable month, or null when none. */
  currentDirection: OceanAnomalyDirection | null;
  /**
   * Direction of the trailing run ending at `latestUsableMonth`. `none` when
   * that month is neutral (no warm or cool run is in progress).
   */
  runDirection: OceanAnomalyRunDirection;
  /**
   * Length of the strictly calendar-adjacent, same-footprint, same-direction run
   * of usable months ending at `latestUsableMonth`. 0 when no month is usable or
   * the latest month is neutral; 1 means the immediately prior calendar month
   * did not extend it (it flipped sign, changed footprint, was a gap, or was not
   * supplied).
   */
  runLength: number;
  /** Earliest month of the current run, or null when `runLength` is 0. */
  runStartMonth: YearMonth | null;
  /** True when the run reaches the earliest supplied usable month. */
  runSpansSuppliedRecord: boolean;
  /** Per-direction tally over usable months, most months first. */
  directionTenure: OceanAnomalyDirectionTenure[];
  /** Short machine-readable reason when no run is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface OceanAnomalyPersistenceOptions {
  /**
   * Deadband in the SST source unit (°C): a month whose |anomaly| is at or below
   * this is reported neutral and breaks a warm/cool run. Defaults to 0, so only
   * an exactly-zero anomaly is neutral. Must be a finite value >= 0.
   */
  neutralAnomalyThreshold?: number;
}

/** A usable month's already-computed anomaly, aligned to the supplied order. */
interface UsableAnomalyMonth {
  dataMonth: YearMonth;
  footprint: UsableSstFootprint;
  anomaly: number;
  standardizedAnomaly: number | null;
  direction: OceanAnomalyDirection;
}

/** Warm, then cool, then neutral: a deterministic tie-break for tenure order. */
const DIRECTION_ORDER: Record<OceanAnomalyDirection, number> = {
  warm: 0,
  cool: 1,
  neutral: 2,
};

/**
 * Reduce an ascending-ordered run of same-calendar-month SST baseline
 * comparisons to the current warm/cool anomaly direction and the length of the
 * consecutive, calendar-adjacent, same-footprint run of usable months that held
 * it. Each comparison is trusted only when its status is `available` (which
 * guarantees a non-null anomaly and footprint); every other status is a gap that
 * breaks the run rather than being bridged. The result describes anomaly-sign
 * persistence across the sampled months only — never a marine heatwave, a
 * forecast, or a biological claim.
 */
export function describeOceanAnomalyPersistence(
  comparisons: readonly OceanSeasonalBaselineComparison[],
  options: OceanAnomalyPersistenceOptions = {}
): OceanAnomalyPersistence {
  const rawThreshold = options.neutralAnomalyThreshold ?? 0;
  const neutralAnomalyThreshold =
    Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 0;

  // One entry per supplied comparison, aligned to the supplied order; null when
  // the comparison did not yield a usable anomaly (and therefore breaks a run).
  const entries: (UsableAnomalyMonth | null)[] = comparisons.map((comparison) =>
    toUsableMonth(comparison, neutralAnomalyThreshold)
  );

  const base = {
    kind: "sea-surface-temperature-anomaly-persistence" as const,
    isForecast: false as const,
    claimScope: "descriptive-sea-surface-temperature-only" as const,
    source: SEA_SURFACE_TEMPERATURE_METRIC.source,
    anomalyUnit: SEA_SURFACE_TEMPERATURE_METRIC.sourceUnit,
    neutralAnomalyThreshold,
    observedMonths: comparisons.length,
    isConsecutiveRun: isConsecutiveRun(comparisons),
    limitations: OCEAN_ANOMALY_PERSISTENCE_LIMITATIONS,
  };

  const usable = entries.filter((entry): entry is UsableAnomalyMonth =>
    Boolean(entry)
  );
  const usableMonths = usable.length;
  const hasGaps = usableMonths < comparisons.length;

  if (usableMonths === 0) {
    return {
      ...base,
      status: "no-usable-months",
      usableMonths: 0,
      hasGaps,
      footprint: null,
      latestUsableMonth: null,
      currentAnomaly: null,
      currentStandardizedAnomaly: null,
      currentDirection: null,
      runDirection: "none",
      runLength: 0,
      runStartMonth: null,
      runSpansSuppliedRecord: false,
      directionTenure: [],
      reason: comparisons.length === 0 ? "no-comparisons" : "no-usable-months",
    };
  }

  const directionTenure = tallyDirectionTenure(usable, usableMonths);

  // Walk from the most recent usable month backward through the supplied order.
  // The run is the maximal streak of usable months that share the latest month's
  // direction and footprint and are each exactly one calendar month apart; a
  // gap, sign flip, footprint change, or unusable month ends it.
  let endIndex = entries.length - 1;
  while (endIndex >= 0 && entries[endIndex] === null) endIndex -= 1;

  const latest = entries[endIndex] as UsableAnomalyMonth;
  const runDirection: OceanAnomalyRunDirection =
    latest.direction === "neutral" ? "none" : latest.direction;

  let runLength = 0;
  let runStartIndex = endIndex;
  if (runDirection !== "none") {
    runLength = 1;
    for (let i = endIndex - 1; i >= 0; i -= 1) {
      const entry = entries[i];
      const nextEntry = entries[i + 1];
      if (
        entry === null ||
        nextEntry === null ||
        entry.direction !== latest.direction ||
        entry.footprint !== latest.footprint ||
        monthDistance(entry.dataMonth, nextEntry.dataMonth) !== 1
      ) {
        break;
      }
      runLength += 1;
      runStartIndex = i;
    }
  }

  return {
    ...base,
    status: "available",
    usableMonths,
    hasGaps,
    footprint: latest.footprint,
    latestUsableMonth: latest.dataMonth,
    currentAnomaly: latest.anomaly,
    currentStandardizedAnomaly: latest.standardizedAnomaly,
    currentDirection: latest.direction,
    runDirection,
    runLength,
    runStartMonth:
      runLength > 0
        ? (entries[runStartIndex] as UsableAnomalyMonth).dataMonth
        : null,
    runSpansSuppliedRecord: runLength > 0 && runLength === usableMonths,
    directionTenure,
    reason: null,
  };
}

/**
 * A comparison contributes a usable anomaly only when it is `available` (its
 * anomaly and footprint are then guaranteed non-null) and its target month is a
 * real calendar month. Every other status — land, no-data, insufficient
 * samples/coverage, invalid — is a gap that breaks the run.
 */
function toUsableMonth(
  comparison: OceanSeasonalBaselineComparison,
  neutralAnomalyThreshold: number
): UsableAnomalyMonth | null {
  if (
    comparison.status !== "available" ||
    comparison.anomaly === null ||
    comparison.bounds.footprint === null
  ) {
    return null;
  }
  const dataMonth = comparison.target.dataMonth;
  if (!isCalendarMonth(dataMonth)) return null;

  return {
    dataMonth,
    footprint: comparison.bounds.footprint,
    anomaly: comparison.anomaly,
    standardizedAnomaly: comparison.standardizedAnomaly,
    direction: directionOf(comparison.anomaly, neutralAnomalyThreshold),
  };
}

/** Sign of the anomaly, with a symmetric neutral deadband around zero. */
function directionOf(
  anomaly: number,
  neutralAnomalyThreshold: number
): OceanAnomalyDirection {
  if (anomaly > neutralAnomalyThreshold) return "warm";
  if (anomaly < -neutralAnomalyThreshold) return "cool";
  return "neutral";
}

function tallyDirectionTenure(
  usable: readonly UsableAnomalyMonth[],
  usableMonths: number
): OceanAnomalyDirectionTenure[] {
  const counts = new Map<OceanAnomalyDirection, number>();
  for (const month of usable) {
    counts.set(month.direction, (counts.get(month.direction) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([direction, months]) => ({
      direction,
      months,
      fractionOfUsableMonths: months / usableMonths,
    }))
    .sort(
      (a, b) =>
        b.months - a.months ||
        DIRECTION_ORDER[a.direction] - DIRECTION_ORDER[b.direction]
    );
}

/**
 * True when each supplied comparison's target month is exactly one calendar
 * month after the prior one. A single comparison (or none) is trivially
 * consecutive; any malformed month or skipped step breaks the run. This only
 * inspects the supplied months' order, independent of whether each was usable.
 */
function isConsecutiveRun(
  comparisons: readonly OceanSeasonalBaselineComparison[]
): boolean {
  for (let i = 1; i < comparisons.length; i += 1) {
    const prev = comparisons[i - 1].target.dataMonth;
    const next = comparisons[i].target.dataMonth;
    if (
      !isCalendarMonth(prev) ||
      !isCalendarMonth(next) ||
      monthDistance(prev, next) !== 1
    ) {
      return false;
    }
  }
  return true;
}

function isCalendarMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}

const DIRECTION_PHRASES: Record<OceanAnomalyRunDirection, string> = {
  warm: "warmer than its same-calendar-month baseline",
  cool: "cooler than its same-calendar-month baseline",
  none: "neither clearly warmer nor cooler than its same-calendar-month baseline",
};

const FOOTPRINT_PHRASES: Record<UsableSstFootprint, string> = {
  water: "open-water",
  "land-mixed-coastal": "coastal (land-mixed)",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence for an anomaly-
 * persistence result. It states only the current run direction, its length in
 * consecutive months, and the sampling caveats; it never implies a marine
 * heatwave, a forecast, a cause, or any marine-biological outcome. The
 * no-usable-months case is stated honestly instead of inventing a run.
 */
export function narrateOceanAnomalyPersistence(
  persistence: OceanAnomalyPersistence
): string {
  const source = persistence.source;
  const provenance = `Source: ${source.shortName} v${source.version}. Monthly anomaly signs relative to each month's own same-calendar-month baseline; not a marine heatwave, forecast, or marine-biological claim.`;

  if (persistence.status !== "available") {
    return `No usable sea-surface-temperature anomaly run was available across the supplied months. ${provenance}`;
  }

  const footprint = persistence.footprint
    ? FOOTPRINT_PHRASES[persistence.footprint]
    : "the sampled";
  const latest = persistence.latestUsableMonth
    ? formatYm(persistence.latestUsableMonth)
    : "the latest month";

  if (persistence.runDirection === "none") {
    return `As of ${latest}, this ${footprint} footprint was ${DIRECTION_PHRASES.none}, so no warm or cool run is in progress. ${provenance}`;
  }

  const months = persistence.runLength === 1 ? "month" : "months";
  const start =
    persistence.runStartMonth && persistence.runLength > 1
      ? ` (since ${formatYm(persistence.runStartMonth)})`
      : "";
  const spanNote = persistence.runSpansSuppliedRecord
    ? " The run spans every usable supplied month and may extend earlier than the window."
    : "";

  return `As of ${latest}, this ${footprint} footprint has been ${DIRECTION_PHRASES[persistence.runDirection]} for ${persistence.runLength} consecutive ${months}${start}.${spanNote} ${provenance}`;
}
