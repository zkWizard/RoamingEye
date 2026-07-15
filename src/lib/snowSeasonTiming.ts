import type { DatasetRef, YearMonth } from "./timeline";
import {
  SNOW_COVER_DATASET,
  SNOW_COVER_LIMITATIONS,
  summarizeSnowCover,
  type SnowCoverObservation,
  type SnowCoverSummary,
} from "./snowCover";
import { SNOW_PRESENT_THRESHOLD_PERCENT } from "./snowCoverPersistence";

/**
 * Snow-cover season *timing* across a run of months (cryosphere).
 *
 * `describeSnowSeasonSeries` (./snowSeason.ts) reports the *shape* of a run and
 * the months of its magnitude extremes (peak, trough), and
 * `describeSnowCoverPersistence` (./snowCoverPersistence.ts) counts *how many*
 * months carried snow. This module answers the complementary *when* question:
 * across the sampled months, *when did snow appear and when did it go* — the
 * onset and melt-out threshold crossings of a snow-present span.
 *
 * "Present" reuses the same reporting floor as the persistence tally (the
 * monthly-average covered-area value at or above a threshold, defaulting to the
 * `patchy` extent floor). The onset is the first up-crossing — the first usable
 * month at or above the floor immediately preceded, in the usable subsequence,
 * by a month below it. The melt-out is the last down-crossing — the first usable
 * month below the floor immediately preceded by one at or above it. Because a
 * transition is located at monthly resolution, each crossing names a *month*,
 * not a day; the true snow-on / snow-off moment falls somewhere within it.
 *
 * The peak of extent (magnitude) and the onset/melt-out (timing) are distinct:
 * a season can reach its greatest covered area in one month yet have appeared
 * months earlier and lingered months later. This helper reports only the timing
 * of the observed crossings.
 *
 * Season boundaries can lie outside the sampled window: if snow is already
 * present at the first sampled month, that onset is not observed here (left-
 * censored); if it is still present at the last, that melt-out is not observed
 * (right-censored). Those cases are flagged via `snowPresentAtStart` /
 * `snowPresentAtEnd` and the corresponding crossing is reported as `null` rather
 * than guessed. Interior no-data or unpublished months are dropped from the
 * usable subsequence and flagged via `hasGaps`, never interpolated, so a
 * crossing may straddle a gap. `presentEpisodeCount` counts the maximal
 * present spans so a caller can tell a single clean season from a window that
 * crossed the floor more than once.
 *
 * Like every snow helper it works on MOD10CM's monthly-average fractional
 * snow-covered-area percentage (0-100) — never depth, snow-water-equivalent,
 * melt or accumulation rate, runoff, water volume, cause, or any future value.
 *
 * Pure, render-free logic (see snowSeasonTiming.test.ts). Provenance is
 * inherited from ./snowCover so a publication cites MOD10CM, not the picture.
 */

export type SnowSeasonTimingStatus =
  "available" | "no-usable-months" | "unavailable";

/** Extra caveats specific to reducing a run of months to onset/melt-out timing. */
export const SNOW_SEASON_TIMING_LIMITATIONS = [
  ...SNOW_COVER_LIMITATIONS,
  "Onset and melt-out are monthly-resolution crossings of the MOD10CM monthly-average snow-covered-area percentage against a reporting floor, not a snow-on/snow-off date; the true transition can fall anywhere within the named month.",
  "The present threshold is a reporting convention over a continuous percentage; a different threshold would place the crossings in different months.",
  "Crossings are located on the usable subsequence; an interior no-data or unpublished month is skipped, not interpolated, so a crossing may straddle a gap (see hasGaps).",
  "Snow present at the first or last sampled month leaves that season boundary outside the window (censored); snowPresentAtStart/snowPresentAtEnd flag this and the corresponding crossing is reported as null.",
  "The descriptor locates observed transitions only; it never infers melt or accumulation rate, snow-water-equivalent, depth, runoff, water volume, cause, or any future or between-month value.",
] as const;

export interface SnowSeasonTiming {
  kind: "observed-snow-cover-season-timing";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: SnowSeasonTimingStatus;
  dataset: DatasetRef;
  /** One summary per supplied observation, kept in the supplied order. */
  summaries: SnowCoverSummary[];
  /** Number of supplied observations. */
  observedMonths: number;
  /** Number of those that are published with usable coverage. */
  usableMonths: number;
  /** Covered-area percentage at or above which a month counts as snow-present. */
  presentThresholdPercent: number;
  /** Whether the first usable month was snow-present; null when none usable. */
  snowPresentAtStart: boolean | null;
  /** Whether the last usable month was snow-present; null when none usable. */
  snowPresentAtEnd: boolean | null;
  /**
   * First up-crossing: the first usable month at/above the floor immediately
   * preceded by a usable month below it. `null` when no such transition is
   * observed (never present, present throughout, or present already at start
   * with no later re-appearance).
   */
  onsetMonth: YearMonth | null;
  /**
   * Last down-crossing: the last usable month below the floor immediately
   * preceded by a usable month at/above it. `null` when no such transition is
   * observed (never present, present throughout, or still present at the end).
   */
  meltOutMonth: YearMonth | null;
  /** Number of maximal consecutive-in-usable-subsequence snow-present spans. */
  presentEpisodeCount: number;
  /** True when the window crossed the floor into more than one present span. */
  hasMultiplePresentEpisodes: boolean;
  /** True when the supplied months form a strictly consecutive calendar run. */
  isConsecutiveRun: boolean;
  /** True when some supplied month could not contribute a usable value. */
  hasGaps: boolean;
  /** Short machine-readable reason when no crossing is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface SnowSeasonTimingOptions {
  /**
   * Covered-area percentage (0-100) at or above which a month counts as
   * snow-present. Defaults to the `patchy` extent floor (shared with the
   * persistence tally so the two descriptors agree on "present").
   */
  presentThresholdPercent?: number;
}

/**
 * Locate the onset and melt-out crossings of a snow-present span across an
 * ordered run of monthly MOD10CM observations. Each month is validated
 * independently through `summarizeSnowCover`; only published months with usable
 * coverage contribute to `usableMonths`, and crossings are read off that usable
 * subsequence in the supplied order. The helper never spans or fills a gap: it
 * flags `hasGaps` and `isConsecutiveRun` so callers can judge whether a crossing
 * reads across a contiguous window or straddles a skipped month. The result
 * describes the timing of observed transitions across the sampled months only.
 */
export function describeSnowSeasonTiming(
  observations: readonly SnowCoverObservation[],
  availableThrough: YearMonth,
  options: SnowSeasonTimingOptions = {}
): SnowSeasonTiming {
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
    kind: "observed-snow-cover-season-timing" as const,
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
    limitations: SNOW_SEASON_TIMING_LIMITATIONS,
  };

  if (!validThreshold) {
    return {
      ...base,
      status: "unavailable",
      snowPresentAtStart: null,
      snowPresentAtEnd: null,
      onsetMonth: null,
      meltOutMonth: null,
      presentEpisodeCount: 0,
      hasMultiplePresentEpisodes: false,
      reason: "invalid-threshold",
    };
  }
  if (usable.length === 0) {
    return {
      ...base,
      status: "no-usable-months",
      snowPresentAtStart: null,
      snowPresentAtEnd: null,
      onsetMonth: null,
      meltOutMonth: null,
      presentEpisodeCount: 0,
      hasMultiplePresentEpisodes: false,
      reason:
        observations.length === 0 ? "no-observations" : "no-usable-months",
    };
  }

  // Boolean snow-present flag for each usable month, in supplied order.
  const present = usable.map(
    (summary) => (summary.snowCoveredPercent as number) >= threshold
  );

  // A maximal run of `true` values is one present episode.
  let presentEpisodeCount = 0;
  for (let i = 0; i < present.length; i += 1) {
    if (present[i] && (i === 0 || !present[i - 1])) {
      presentEpisodeCount += 1;
    }
  }

  // Onset = first up-crossing (absent -> present); melt-out = last down-crossing
  // (present -> absent). Both are read only across adjacent usable months, so a
  // season boundary that lies at the very start or end of the window is left as
  // `null` and disclosed through snowPresentAtStart / snowPresentAtEnd instead.
  let onsetMonth: YearMonth | null = null;
  let meltOutMonth: YearMonth | null = null;
  for (let i = 1; i < present.length; i += 1) {
    if (present[i] && !present[i - 1] && onsetMonth === null) {
      onsetMonth = usable[i].dataMonth;
    }
    if (!present[i] && present[i - 1]) {
      meltOutMonth = usable[i].dataMonth;
    }
  }

  const neverPresent = presentEpisodeCount === 0;
  const presentThroughout = present.every((flag) => flag);
  const reason = neverPresent
    ? "no-snow-present"
    : presentThroughout
      ? "present-throughout-window"
      : onsetMonth === null && meltOutMonth === null
        ? "no-crossing-observed"
        : null;

  return {
    ...base,
    status: "available",
    snowPresentAtStart: present[0],
    snowPresentAtEnd: present[present.length - 1],
    onsetMonth,
    meltOutMonth,
    presentEpisodeCount,
    hasMultiplePresentEpisodes: presentEpisodeCount > 1,
    reason,
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
