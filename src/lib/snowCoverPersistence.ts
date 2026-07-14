import type { DatasetRef, YearMonth } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_EXTENT_BINS,
  SNOW_COVER_LIMITATIONS,
  summarizeSnowCover,
  type SnowCoverObservation,
  type SnowCoverSummary,
} from "./snowCover";

/**
 * Snow-cover *persistence* across a run of months (cryosphere).
 *
 * `describeSnowSeasonSeries` in ./snowSeason.ts reports the *shape* of a run
 * (advancing, peak, trough, net change, amplitude). This module answers the
 * complementary duration question: across the sampled months, *in how many was
 * snow actually present* — a monthly-average proxy for how long snow lingered.
 * That count, and its fraction of the usable months, is the persistence
 * descriptor here; it is deliberately orthogonal to the progression shape.
 *
 * "Present" means the monthly-average snow-covered-area value sat at or above a
 * reporting threshold, defaulting to the `patchy` extent floor (see
 * SNOW_COVER_EXTENT_BINS) — i.e. anything the extent classifier would call more
 * than effectively-snow-free. The boundary is a reporting convention, not a
 * physical threshold, so callers may override it.
 *
 * Like every snow helper it works on MOD10CM's monthly-average fractional
 * snow-covered-area percentage (0-100) — never depth, snow-water-equivalent,
 * melt or accumulation rate, runoff, water volume, cause, or any future value.
 * The tally counts *sampled* usable months only: unpublished or no-data months
 * are dropped from the usable subset and flagged via `hasGaps`, never invented
 * or interpolated. Callers can read `isConsecutiveRun` to see whether the
 * supplied months form a contiguous window (so the fraction reads as a duration
 * proxy) or a scattered set (so it does not).
 *
 * Pure, render-free logic (see snowCoverPersistence.test.ts). Provenance is
 * inherited from ./snowCover so a publication cites MOD10CM, not the picture.
 */

/**
 * Default monthly-average covered-area percentage at or above which a month is
 * counted as snow-present. Bound to the `patchy` extent floor so "present" means
 * exactly "more than effectively-snow-free" under the shared extent bins.
 */
export const SNOW_PRESENT_THRESHOLD_PERCENT =
  SNOW_COVER_EXTENT_BINS.find((bin) => bin.id === "patchy")?.minPercent ?? 5;

export type SnowCoverPersistenceStatus =
  "available" | "no-usable-months" | "unavailable";

/** Extra caveats specific to reducing a run of months to a persistence tally. */
export const SNOW_COVER_PERSISTENCE_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "Persistence counts sampled usable months at or above the present threshold; it is a monthly-average snow-presence proxy, not a snow-season length in days.",
  "The present threshold is a reporting convention over a continuous percentage; a different threshold would count a different set of months.",
  "No-data or unpublished months are dropped from the usable subset, not interpolated, so the fraction describes only the months actually sampled.",
] as const;

export interface SnowCoverPersistence {
  kind: "observed-snow-cover-persistence";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SnowCoverPersistenceStatus;
  dataset: DatasetRef;
  /** One summary per supplied observation, kept in the supplied order. */
  summaries: SnowCoverSummary[];
  /** Number of supplied observations. */
  observedMonths: number;
  /** Number of those that are published with usable coverage. */
  usableMonths: number;
  /** Usable months whose value sat at or above the present threshold; null when none usable. */
  snowPresentMonths: number | null;
  /** `snowPresentMonths / usableMonths` in [0, 1]; null when no usable months. */
  snowPresentFraction: number | null;
  /** Covered-area percentage at or above which a month counts as present. */
  presentThresholdPercent: number;
  /** True when the supplied months form a strictly consecutive calendar run. */
  isConsecutiveRun: boolean;
  /** True when some supplied month could not contribute a usable value. */
  hasGaps: boolean;
  /** Short machine-readable reason when no fraction is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface SnowCoverPersistenceOptions {
  /**
   * Covered-area percentage (0-100) at or above which a month counts as
   * snow-present. Defaults to the `patchy` extent floor.
   */
  presentThresholdPercent?: number;
}

/**
 * Count how many of an ordered run of monthly MOD10CM observations had snow
 * present at or above a reporting threshold, and report that as a fraction of
 * the usable months. Each month is validated independently through
 * `summarizeSnowCover`; only published months with usable coverage contribute
 * to `usableMonths`, and among those only ones at or above the threshold count
 * as present. The helper never spans or fills a gap: it flags `hasGaps` and
 * `isConsecutiveRun` so callers can judge whether the fraction reads as a
 * contiguous-window duration proxy or a scattered-sample rate. The result
 * describes snow presence across the sampled months only.
 */
export function describeSnowCoverPersistence(
  observations: readonly SnowCoverObservation[],
  availableThrough: YearMonth,
  options: SnowCoverPersistenceOptions = {}
): SnowCoverPersistence {
  const summaries = observations.map((observation) =>
    summarizeSnowCover(observation, availableThrough)
  );
  const threshold =
    options.presentThresholdPercent ?? SNOW_PRESENT_THRESHOLD_PERCENT;
  const validThreshold =
    Number.isFinite(threshold) && threshold >= 0 && threshold <= 100;

  const usable = summaries.filter(
    (summary): summary is SnowCoverSummary =>
      summary.snowCoveredPercent !== null
  );

  const base = {
    kind: "observed-snow-cover-persistence" as const,
    isForecast: false as const,
    dataset: SNOW_COVER_DATASET,
    summaries,
    observedMonths: observations.length,
    usableMonths: usable.length,
    presentThresholdPercent: validThreshold
      ? threshold
      : SNOW_PRESENT_THRESHOLD_PERCENT,
    isConsecutiveRun: isConsecutiveRun(observations),
    hasGaps: usable.length < observations.length,
    limitations: SNOW_COVER_PERSISTENCE_LIMITATIONS,
  };

  if (!validThreshold) {
    return {
      ...base,
      status: "unavailable",
      snowPresentMonths: null,
      snowPresentFraction: null,
      reason: "invalid-threshold",
    };
  }
  if (usable.length === 0) {
    return {
      ...base,
      status: "no-usable-months",
      snowPresentMonths: null,
      snowPresentFraction: null,
      reason:
        observations.length === 0 ? "no-observations" : "no-usable-months",
    };
  }

  const snowPresentMonths = usable.filter(
    (summary) => (summary.snowCoveredPercent as number) >= threshold
  ).length;

  return {
    ...base,
    status: "available",
    snowPresentMonths,
    snowPresentFraction: snowPresentMonths / usable.length,
    reason: null,
  };
}

/**
 * True when each supplied observation is exactly one calendar month after the
 * prior one. A single observation (or none) is trivially consecutive; any
 * malformed month or skipped step breaks the run. This only inspects the
 * supplied months' order, independent of whether each carried a usable value.
 */
function isConsecutiveRun(
  observations: readonly SnowCoverObservation[]
): boolean {
  for (let i = 1; i < observations.length; i += 1) {
    const prev = observations[i - 1].dataMonth;
    const next = observations[i].dataMonth;
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
