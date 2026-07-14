import { type DatasetRef, type YearMonth } from "./timeline";
import {
  AEROSOL_LOADING_LIMITATIONS,
  AEROSOL_SOURCE,
  AEROSOL_UNIT,
  AEROSOL_WAVELENGTH_NM,
  summarizeAerosolLoading,
  type AerosolLoadingCategory,
  type AerosolLoadingSummary,
  type AerosolObservation,
} from "./aerosolLoading";

/**
 * Loading-tier *persistence* across a run of monthly aerosol observations.
 *
 * `summarizeAerosolLoading` bins one month's column AOD into a descriptive
 * loading tier, and `describeAerosolLoadingChange` compares two adjacent
 * months. Neither answers the plainest multi-month question about a probed
 * point: across the months we actually have, has the loading tier *held*, and
 * for how many consecutive most-recent months? Episodic aerosol (a dust or
 * smoke season) reads very differently from a point that has sat in the same
 * tier all window.
 *
 * This helper answers exactly that. It bins each supplied month, then reports
 * the most-recent usable month's tier and the length of the strictly
 * calendar-adjacent run of usable months, ending at that latest month, that all
 * held that same tier. It also tallies, per tier, how many usable months of the
 * window fell in it. It is a purely descriptive reduction of already-binned
 * observations:
 *
 *  - The tiers are the descriptive column-loading bands of `aerosolLoading`
 *    (reading aids with commonly cited break points, NOT standardized
 *    thresholds and NOT an air-quality or health index). Persistence of a tier
 *    is persistence of that descriptive label, nothing more.
 *  - A run is measured within the supplied window only. It may extend earlier
 *    than the earliest supplied month; the helper never assumes anything about
 *    months it was not given.
 *  - Only *published* months with usable coverage count. Not-yet-published,
 *    invalid, and no-data months are dropped from the usable subset (flagged via
 *    `hasGaps`) and break the calendar-adjacent run rather than being invented,
 *    interpolated, or silently bridged.
 *  - No forecast, trend, causation, or diagnosis is added. A long run is not a
 *    claim that the tier will hold next month, nor about surface air quality.
 *
 * Callers must supply the observations in ascending calendar order (oldest
 * first); `isConsecutiveRun` reports whether the supplied window is itself a
 * contiguous calendar run. Provenance is inherited from `aerosolLoading`, so a
 * publication cites MERRA-2, not the picture. Pure, render-free logic (see
 * aerosolLoadingPersistence.test.ts).
 */

export type AerosolLoadingPersistenceStatus = "available" | "no-usable-months";

/** Extra caveats specific to reducing a run of months to a persistence tally. */
export const AEROSOL_LOADING_PERSISTENCE_LIMITATIONS = [
  ...AEROSOL_LOADING_LIMITATIONS,
  "Persistence counts a descriptive loading tier holding across consecutive months; the tiers are reading conventions, not standardized thresholds, so a different tier scheme would count a different run.",
  "The current-tier run is measured within the supplied window only and may extend earlier than the earliest supplied month; it says nothing about months not provided.",
  "Only published months with usable coverage count; not-yet-published or no-data months are dropped from the usable subset and break the calendar-adjacent run rather than being interpolated across.",
] as const;

/** How many usable window months fell in one descriptive loading tier. */
export interface AerosolLoadingTierTenure {
  category: AerosolLoadingCategory;
  label: string;
  /** Usable months of the window that fell in this tier. */
  months: number;
  /** Share of usable months held by this tier, in [0, 1]. */
  fractionOfUsableMonths: number;
}

export interface AerosolLoadingPersistence {
  kind: "observed-aerosol-loading-persistence";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  status: AerosolLoadingPersistenceStatus;
  source: DatasetRef;
  wavelengthNm: number;
  unit: string;
  /** One summary per supplied observation, kept in the supplied order. */
  summaries: AerosolLoadingSummary[];
  /** Number of supplied observations. */
  observedMonths: number;
  /** Supplied months that are published with usable coverage and a tier. */
  usableMonths: number;
  /** True when some supplied month could not contribute a usable tier. */
  hasGaps: boolean;
  /** True when the supplied months form a strictly consecutive calendar run. */
  isConsecutiveRun: boolean;
  /** Most-recent usable month, or null when none are usable. */
  latestUsableMonth: YearMonth | null;
  /** Loading tier of the most-recent usable month, or null when none usable. */
  currentCategory: AerosolLoadingCategory | null;
  /** Human-readable label for `currentCategory`, or null. */
  currentLabel: string | null;
  /**
   * Length of the strictly calendar-adjacent run of usable months, ending at
   * `latestUsableMonth`, that all held `currentCategory`. 0 when no month is
   * usable; 1 means the immediately prior calendar month did not hold the tier
   * (it changed tier, was a gap, or was not supplied).
   */
  currentTierRunLength: number;
  /** Earliest month of the current-tier run, or null when no month is usable. */
  currentRunStartMonth: YearMonth | null;
  /** Per-tier tally over usable months, most months first then clean-to-loaded. */
  tierTenure: AerosolLoadingTierTenure[];
  /** Short machine-readable reason when no run is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/** Clean-to-loaded order, used to break tenure ties deterministically. */
const CATEGORY_ORDER: Record<AerosolLoadingCategory, number> = {
  "very-low": 0,
  low: 1,
  moderate: 2,
  high: 3,
  "very-high": 4,
};

/**
 * Reduce an ascending-ordered run of monthly MERRA-2 AOD observations to its
 * current loading tier and the length of the consecutive, calendar-adjacent
 * run of usable months that held it. Each month is validated independently
 * through `summarizeAerosolLoading`; only published months with usable coverage
 * (and therefore a non-null tier) enter `usableMonths` and the run. The helper
 * never spans or fills a gap: a missing, unpublished, or off-tier month ends the
 * run, and `hasGaps` / `isConsecutiveRun` let callers judge whether the run
 * reads as a contiguous-window duration or sits inside a scattered sample. The
 * result describes tier persistence across the sampled months only.
 */
export function describeAerosolLoadingPersistence(
  observations: readonly AerosolObservation[],
  availableThrough: YearMonth
): AerosolLoadingPersistence {
  const summaries = observations.map((observation) =>
    summarizeAerosolLoading(observation, availableThrough)
  );

  const base = {
    kind: "observed-aerosol-loading-persistence" as const,
    isForecast: false as const,
    source: AEROSOL_SOURCE,
    wavelengthNm: AEROSOL_WAVELENGTH_NM,
    unit: AEROSOL_UNIT,
    summaries,
    observedMonths: observations.length,
    isConsecutiveRun: isConsecutiveRun(summaries),
    limitations: AEROSOL_LOADING_PERSISTENCE_LIMITATIONS,
  };

  // A usable month is published, has usable coverage, and therefore a tier.
  const usableFlags = summaries.map(isUsableTierMonth);
  const usableMonths = usableFlags.filter(Boolean).length;
  const hasGaps = usableMonths < summaries.length;

  if (usableMonths === 0) {
    return {
      ...base,
      status: "no-usable-months",
      usableMonths: 0,
      hasGaps,
      latestUsableMonth: null,
      currentCategory: null,
      currentLabel: null,
      currentTierRunLength: 0,
      currentRunStartMonth: null,
      tierTenure: [],
      reason:
        observations.length === 0 ? "no-observations" : "no-usable-months",
    };
  }

  const tierTenure = tallyTierTenure(summaries, usableFlags, usableMonths);

  // Walk from the most recent month backward. The run is the maximal streak of
  // usable, same-tier months that are each exactly one calendar month before the
  // month after them — a gap, tier change, or unusable month ends it.
  const lastIndex = summaries.length - 1;
  let runEndIndex = lastIndex;
  while (runEndIndex >= 0 && !usableFlags[runEndIndex]) runEndIndex -= 1;

  const latest = summaries[runEndIndex];
  const currentCategory = latest.loading!.category;
  let runLength = 1;
  let runStartIndex = runEndIndex;
  for (let i = runEndIndex - 1; i >= 0; i -= 1) {
    const summary = summaries[i];
    if (
      !usableFlags[i] ||
      summary.loading!.category !== currentCategory ||
      monthDistance(summary.dataMonth, summaries[i + 1].dataMonth) !== 1
    ) {
      break;
    }
    runLength += 1;
    runStartIndex = i;
  }

  return {
    ...base,
    status: "available",
    usableMonths,
    hasGaps,
    latestUsableMonth: latest.dataMonth,
    currentCategory,
    currentLabel: latest.loading!.label,
    currentTierRunLength: runLength,
    currentRunStartMonth: summaries[runStartIndex].dataMonth,
    tierTenure,
    reason: null,
  };
}

/**
 * A summary contributes a usable tier only when its month is published with
 * usable coverage. This mirrors the `usableEndpointValue` gate the change
 * helper applies, so an unpublished future month never counts toward a run even
 * though `summarizeAerosolLoading` may carry a tentative value for it.
 */
function isUsableTierMonth(summary: AerosolLoadingSummary): boolean {
  return (
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.loading !== null
  );
}

function tallyTierTenure(
  summaries: readonly AerosolLoadingSummary[],
  usableFlags: readonly boolean[],
  usableMonths: number
): AerosolLoadingTierTenure[] {
  const counts = new Map<
    AerosolLoadingCategory,
    { label: string; months: number }
  >();
  summaries.forEach((summary, index) => {
    if (!usableFlags[index]) return;
    const loading = summary.loading!;
    const entry = counts.get(loading.category) ?? {
      label: loading.label,
      months: 0,
    };
    entry.months += 1;
    counts.set(loading.category, entry);
  });

  return [...counts.entries()]
    .map(([category, entry]) => ({
      category,
      label: entry.label,
      months: entry.months,
      fractionOfUsableMonths: entry.months / usableMonths,
    }))
    .sort(
      (a, b) =>
        b.months - a.months ||
        CATEGORY_ORDER[a.category] - CATEGORY_ORDER[b.category]
    );
}

/**
 * True when each supplied summary's data month is exactly one calendar month
 * after the prior one. A single summary (or none) is trivially consecutive; any
 * malformed month or skipped step breaks the run. This only inspects the
 * supplied months' order, independent of whether each carried a usable tier.
 */
function isConsecutiveRun(
  summaries: readonly AerosolLoadingSummary[]
): boolean {
  for (let i = 1; i < summaries.length; i += 1) {
    const prev = summaries[i - 1].dataMonth;
    const next = summaries[i].dataMonth;
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
