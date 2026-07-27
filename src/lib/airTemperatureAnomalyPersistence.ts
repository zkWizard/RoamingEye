import { CLIMATE_METRICS, type ClimateMetric } from "./climate";
import type { SeasonalBaselineComparison } from "./seasonalBaseline";
import { formatYm, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Persistence of a warm or cool 2 m air-temperature anomaly across a run of
 * monthly same-calendar-month baseline comparisons.
 *
 * `compareMonthlyClimateToSeasonalBaseline` compares ONE month's 2 m air
 * temperature to prior same-calendar-month observations for the same place and
 * reports that month's anomaly (target minus same-month mean, in kelvin). On its
 * own each comparison is a single snapshot, and `describeAirTemperaturePercentile`
 * ranks one month without reference to its neighbours. Neither answers the plainest
 * multi-month question about a probed point: has the near-surface air stayed warmer
 * (or cooler) than its own seasonal history, and for how many consecutive most-
 * recent months? A one-month warm anomaly reads very differently from a point that
 * has sat above its seasonal baseline all window.
 *
 * This helper answers exactly that. Given a chronological run of completed
 * same-calendar-month comparisons, it takes the sign of each usable month's anomaly
 * (warm / cool / neutral) and reports the most-recent usable month's direction and
 * the length of the strictly calendar-adjacent, same-direction run of usable months
 * ending at it. It also tallies, over the usable window, how many months fell warm,
 * cool, or neutral. It is a purely descriptive reduction of already-computed
 * anomalies:
 *
 *  - Each month's anomaly is relative to its OWN same-calendar-month baseline, so a
 *    run is a *seasonally adjusted* persistence: "warmer than a typical May, then a
 *    typical June, then a typical July", never raw warmth. Every caveat of
 *    seasonalBaseline.ts carries through — an anomaly here is an arithmetic
 *    difference from a short observed record, not a climate normal.
 *  - This is NOT a heatwave or cold spell. WMO/operational warm- and cold-spell
 *    definitions need daily data crossing a percentile threshold on consecutive
 *    days; monthly MERRA-2 means cannot resolve events, thresholds, or durations.
 *    Persistence here is a coarse count of consecutive months whose monthly anomaly
 *    shares a sign.
 *  - Only the 2 m air-temperature metric is reduced. A comparison for any other
 *    metric, or one that did not produce an anomaly (not-yet-published, no-data,
 *    insufficient-sample/coverage, invalid), is dropped from the usable subset
 *    (flagged via `hasGaps`) and BREAKS the calendar-adjacent run rather than being
 *    invented, interpolated, or silently bridged.
 *  - No forecast, trend, or attribution is added. A long run is not a claim that the
 *    anomaly will hold next month, nor about cause, hazard, or any impact; the run
 *    is measured within the supplied window only and may extend earlier than the
 *    earliest supplied month.
 *
 * Callers must supply the comparisons in ascending calendar order (oldest first);
 * `isConsecutiveRun` reports whether the supplied window is itself a contiguous
 * calendar run. Provenance is inherited from the cited MERRA-2 air-temperature
 * product. Pure, render-free logic (see airTemperatureAnomalyPersistence.test.ts).
 */

/** Cited MERRA-2 air-temperature metric backing every persistence description. */
export const AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC: ClimateMetric =
  CLIMATE_METRICS["air-temperature-2m"];

export type AirTemperatureAnomalyPersistenceStatus =
  "available" | "no-usable-months";

/** Sign of one month's air-temperature anomaly relative to its own baseline. */
export type AirTemperatureAnomalyDirection = "warm" | "cool" | "neutral";

/** Direction of the trailing run; `none` when the latest month is neutral. */
export type AirTemperatureAnomalyRunDirection = "warm" | "cool" | "none";

/** Extra caveats specific to reducing a run of anomalies to a persistence count. */
export const AIR_TEMPERATURE_ANOMALY_PERSISTENCE_LIMITATIONS = [
  "Each month's anomaly is an arithmetic difference from a short same-calendar-month observed record for the same place, not a climate-normal departure; persistence inherits every limitation of that baseline.",
  "This is not a heatwave or cold spell: WMO/operational warm- and cold-spell definitions require daily temperatures crossing a percentile threshold on consecutive days, which monthly MERRA-2 means cannot resolve. A run here only counts consecutive months whose monthly anomaly shares a sign.",
  "Direction is the sign of the anomaly (with an optional neutral deadband); a different threshold or baseline would count a different run, and a near-zero month is reported neutral rather than forced warm or cool.",
  "Only available 2 m air-temperature comparisons count; a wrong-metric, not-yet-published, no-data, insufficient-sample/coverage, or invalid month is dropped from the usable subset and breaks the calendar-adjacent run rather than being interpolated across.",
  "Values are area-mean reanalysis (MERRA-2), not station data; the run is measured within the supplied window only, may extend earlier than the earliest supplied month, and never implies a forecast, trend, cause, or impact.",
] as const;

/** How many usable window months fell in one anomaly direction. */
export interface AirTemperatureAnomalyDirectionTenure {
  direction: AirTemperatureAnomalyDirection;
  /** Usable months of the window with this anomaly direction. */
  months: number;
  /** Share of usable months in this direction, in [0, 1]. */
  fractionOfUsableMonths: number;
}

export interface AirTemperatureAnomalyPersistence {
  kind: "air-temperature-anomaly-persistence";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a persistence run from being read as a trend. */
  isTrend: false;
  claimScope: "descriptive-2m-air-temperature-anomaly-sign-persistence-only";
  status: AirTemperatureAnomalyPersistenceStatus;
  metric: ClimateMetric;
  /** Air-temperature dataset the underlying anomalies were derived from; cited. */
  source: DatasetRef;
  /** Unit of `currentAnomaly`; the air-temperature source unit (K), never converted. */
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
  /** Most-recent usable month, or null when none are usable. */
  latestUsableMonth: YearMonth | null;
  /** Anomaly (source unit, K) of the most-recent usable month, or null. */
  currentAnomaly: number | null;
  /** Standardized anomaly of the most-recent usable month, when the baseline spread is defined and positive. */
  currentStandardizedAnomaly: number | null;
  /** Anomaly direction of the most-recent usable month, or null when none. */
  currentDirection: AirTemperatureAnomalyDirection | null;
  /**
   * Direction of the trailing run ending at `latestUsableMonth`. `none` when that
   * month is neutral (no warm or cool run is in progress).
   */
  runDirection: AirTemperatureAnomalyRunDirection;
  /**
   * Length of the strictly calendar-adjacent, same-direction run of usable months
   * ending at `latestUsableMonth`. 0 when no month is usable or the latest month is
   * neutral; 1 means the immediately prior calendar month did not extend it (it
   * flipped sign, was a gap, or was not supplied).
   */
  runLength: number;
  /** Earliest month of the current run, or null when `runLength` is 0. */
  runStartMonth: YearMonth | null;
  /** True when the run reaches the earliest supplied usable month. */
  runSpansSuppliedRecord: boolean;
  /** Per-direction tally over usable months, most months first. */
  directionTenure: AirTemperatureAnomalyDirectionTenure[];
  /** Short machine-readable reason when no run is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface AirTemperatureAnomalyPersistenceOptions {
  /**
   * Deadband in the air-temperature source unit (K): a month whose |anomaly| is at
   * or below this is reported neutral and breaks a warm/cool run. Defaults to 0, so
   * only an exactly-zero anomaly is neutral. Must be a finite value >= 0; any other
   * value falls back to 0.
   */
  neutralAnomalyThreshold?: number;
}

/** A usable month's already-computed anomaly, aligned to the supplied order. */
interface UsableAnomalyMonth {
  dataMonth: YearMonth;
  anomaly: number;
  standardizedAnomaly: number | null;
  direction: AirTemperatureAnomalyDirection;
}

/** Warm, then cool, then neutral: a deterministic tie-break for tenure order. */
const DIRECTION_ORDER: Record<AirTemperatureAnomalyDirection, number> = {
  warm: 0,
  cool: 1,
  neutral: 2,
};

/**
 * Reduce an ascending-ordered run of same-calendar-month air-temperature baseline
 * comparisons to the current warm/cool anomaly direction and the length of the
 * consecutive, calendar-adjacent run of usable months that held it. A comparison is
 * trusted only when it is `available` for the 2 m air-temperature metric (which
 * guarantees a non-null anomaly); every other status — a wrong metric, not-yet-
 * published, no-data, insufficient samples/coverage, or invalid — is a gap that
 * breaks the run rather than being bridged. The result describes anomaly-sign
 * persistence across the sampled months only — never a heatwave, cold spell,
 * forecast, or trend.
 */
export function describeAirTemperatureAnomalyPersistence(
  comparisons: readonly SeasonalBaselineComparison[],
  options: AirTemperatureAnomalyPersistenceOptions = {}
): AirTemperatureAnomalyPersistence {
  const rawThreshold = options.neutralAnomalyThreshold ?? 0;
  const neutralAnomalyThreshold =
    Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 0;

  // One entry per supplied comparison, aligned to the supplied order; null when the
  // comparison did not yield a usable anomaly (and therefore breaks a run).
  const entries: (UsableAnomalyMonth | null)[] = comparisons.map((comparison) =>
    toUsableMonth(comparison, neutralAnomalyThreshold)
  );

  const base = {
    kind: "air-temperature-anomaly-persistence" as const,
    isForecast: false as const,
    isTrend: false as const,
    claimScope:
      "descriptive-2m-air-temperature-anomaly-sign-persistence-only" as const,
    metric: AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC,
    source: AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC.source,
    anomalyUnit: AIR_TEMPERATURE_ANOMALY_PERSISTENCE_METRIC.nativeUnit,
    neutralAnomalyThreshold,
    observedMonths: comparisons.length,
    isConsecutiveRun: isConsecutiveRun(comparisons),
    limitations: AIR_TEMPERATURE_ANOMALY_PERSISTENCE_LIMITATIONS,
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
  // direction and are each exactly one calendar month apart; a gap, sign flip, or
  // unusable month ends it.
  let endIndex = entries.length - 1;
  while (endIndex >= 0 && entries[endIndex] === null) endIndex -= 1;

  const latest = entries[endIndex] as UsableAnomalyMonth;
  const runDirection: AirTemperatureAnomalyRunDirection =
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
 * A comparison contributes a usable anomaly only when it is `available` for the 2 m
 * air-temperature metric (its anomaly is then guaranteed non-null) and its target
 * month is a real calendar month. Every other case — a comparison for another
 * metric, land/no-data, insufficient samples/coverage, not-yet-published, or
 * invalid — is a gap that breaks the run.
 */
function toUsableMonth(
  comparison: SeasonalBaselineComparison,
  neutralAnomalyThreshold: number
): UsableAnomalyMonth | null {
  if (
    comparison.status !== "available" ||
    comparison.anomaly === null ||
    comparison.metric.id !== "air-temperature-2m"
  ) {
    return null;
  }
  const dataMonth = comparison.target.dataMonth;
  if (!isCalendarMonth(dataMonth)) return null;

  return {
    dataMonth,
    anomaly: comparison.anomaly,
    standardizedAnomaly: standardizedAnomalyOf(comparison),
    direction: directionOf(comparison.anomaly, neutralAnomalyThreshold),
  };
}

/**
 * Standardized anomaly (anomaly divided by the baseline's sample standard
 * deviation), when that spread is defined and strictly positive. Returns null when
 * the baseline has fewer than two samples or a zero spread, so a degenerate
 * baseline never yields a divide-by-zero or an infinite z-score.
 */
function standardizedAnomalyOf(
  comparison: SeasonalBaselineComparison
): number | null {
  const spread = comparison.baseline.sampleStandardDeviation;
  if (spread === null || !Number.isFinite(spread) || spread <= 0) return null;
  return (comparison.anomaly as number) / spread;
}

/** Sign of the anomaly, with a symmetric neutral deadband around zero. */
function directionOf(
  anomaly: number,
  neutralAnomalyThreshold: number
): AirTemperatureAnomalyDirection {
  if (anomaly > neutralAnomalyThreshold) return "warm";
  if (anomaly < -neutralAnomalyThreshold) return "cool";
  return "neutral";
}

function tallyDirectionTenure(
  usable: readonly UsableAnomalyMonth[],
  usableMonths: number
): AirTemperatureAnomalyDirectionTenure[] {
  const counts = new Map<AirTemperatureAnomalyDirection, number>();
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
 * True when each supplied comparison's target month is exactly one calendar month
 * after the prior one. A single comparison (or none) is trivially consecutive; any
 * malformed month or skipped step breaks the run. This only inspects the supplied
 * months' order, independent of whether each was usable.
 */
function isConsecutiveRun(
  comparisons: readonly SeasonalBaselineComparison[]
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

const DIRECTION_PHRASES: Record<AirTemperatureAnomalyRunDirection, string> = {
  warm: "warmer than its same-calendar-month baseline",
  cool: "cooler than its same-calendar-month baseline",
  none: "neither clearly warmer nor cooler than its same-calendar-month baseline",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence for an anomaly-
 * persistence result. It states only the current run direction, its length in
 * consecutive months, and the sampling caveats; it never implies a heatwave, a cold
 * spell, a forecast, a trend, or a cause. The no-usable-months case is stated
 * honestly instead of inventing a run.
 */
export function narrateAirTemperatureAnomalyPersistence(
  persistence: AirTemperatureAnomalyPersistence
): string {
  const source = persistence.source;
  const provenance = `Source: ${source.shortName} v${source.version}. Monthly anomaly signs relative to each month's own same-calendar-month baseline; not a heatwave, cold spell, forecast, or trend.`;

  if (persistence.status !== "available") {
    return `No usable 2 m air-temperature anomaly run was available across the supplied months. ${provenance}`;
  }

  const latest = persistence.latestUsableMonth
    ? formatYm(persistence.latestUsableMonth)
    : "the latest month";

  if (persistence.runDirection === "none") {
    return `As of ${latest}, this point was ${DIRECTION_PHRASES.none}, so no warm or cool run is in progress. ${provenance}`;
  }

  const months = persistence.runLength === 1 ? "month" : "months";
  const start =
    persistence.runStartMonth && persistence.runLength > 1
      ? ` (since ${formatYm(persistence.runStartMonth)})`
      : "";
  const spanNote = persistence.runSpansSuppliedRecord
    ? " The run spans every usable supplied month and may extend earlier than the window."
    : "";

  return `As of ${latest}, this point has been ${DIRECTION_PHRASES[persistence.runDirection]} for ${persistence.runLength} consecutive ${months}${start}.${spanNote} ${provenance}`;
}
