import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Summarize the *sequencing* of dry and wet months across a consecutive run of
 * monthly precipitation accumulations — a dry-/wet-spell descriptor.
 *
 * Each month is labelled a *dry month* when its accumulated depth (see
 * precipitationAccumulation.ts) falls below the Köppen–Geiger dry-month
 * threshold of 60 mm, the canonical monthly-depth break used to identify
 * tropical wet-and-dry (Aw/As) regimes and the seasonal dry period; the
 * threshold is exposed as an option for arid or humid contexts.
 *
 * This descriptor is deliberately *order-dependent*, which is exactly what makes
 * it new information here. Every other whole-window precipitation index in this
 * codebase — the Herfindahl Precipitation Concentration Index
 * (precipitationConcentrationIndex.ts), the Walsh & Lawler Seasonality Index
 * (precipitationSeasonalityIndex.ts), the wettest/driest two-month shares
 * (precipitationWindowConcentration.ts) — is *permutation-invariant*: it reads
 * the same for a year whose dry months are one contiguous block and for a year
 * whose dry months are scattered. Run lengths distinguish the two. It answers
 * the plain question those indices cannot: *did the dry months arrive as a
 * single dry season, or in separate spells?*
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The 60 mm break is the tropical dry-month convention. These counts do NOT
 *    constitute a Köppen climate-type assignment, which additionally requires
 *    annual totals, air temperature, and the driest-month-versus-annual rule.
 *  - Run lengths and counts describe only *this window's* observed sequence.
 *    For a full 12-month window (`isAnnualWindow`), `longestDryRun` approximates
 *    the length of the dry season and `dryMonthCount` is the Köppen dry-month
 *    count; for any other length the counts stay valid but carry no annual
 *    dry-season meaning.
 *  - Unlike the concentration and seasonality indices, this is well-defined for
 *    a bone-dry window: every month is simply a dry month, so a zero-total run
 *    is a valid *maximally dry* description, never a `null`.
 *  - It adds no anomaly, climatology, normal, drought index, runoff,
 *    water-balance, causation, or forecast — only a descriptive re-expression of
 *    an observed sequence, carrying the shared cited provenance.
 *  - A `null` return means "no window can be stated" (empty input, a gap, an
 *    overlap, mixed provenance, a non-finite/negative total, or an invalid
 *    threshold), never "no dry months".
 */

/**
 * Köppen–Geiger dry-month threshold in mm of monthly accumulated depth: a month
 * receiving less than this is a *dry month*. The canonical value used to define
 * tropical wet-and-dry regimes and dry seasons.
 */
export const KOPPEN_DRY_MONTH_MM = 60;

/** Honest scope limits for the derived dry-/wet-spell descriptor. */
export const PRECIP_DRY_SPELL_LIMITATIONS =
  "The dry-/wet-spell descriptor labels each month a dry month when its GLDAS " +
  "accumulated depth is below the Köppen–Geiger dry-month threshold (60 mm by " +
  "default, configurable), then reports how many dry and wet months a " +
  "consecutive, non-overlapping single-source run held and the longest run of " +
  "each. Unlike the concentration or seasonality indices it is order-dependent " +
  "by design: it distinguishes a single contiguous dry season from scattered " +
  "dry months. The 60 mm break is the tropical dry-month convention and these " +
  "counts do NOT constitute a Köppen climate-type assignment, which also needs " +
  "annual totals, temperature, and the driest-month rule. Over a full 12-month " +
  "window the longest dry run approximates the dry-season length and the " +
  "dry-month count is the Köppen dry-month count; for other lengths the counts " +
  "describe only that window. A bone-dry window is a valid maximally-dry " +
  "description, not a null; a null means no window can be stated (empty input, " +
  "a gap, overlap, mixed source, invalid total, or invalid threshold). It " +
  "inherits the land-model product's resolution and biases and is a plain " +
  "descriptive statistic of observations — not a rain-gauge total, climate " +
  "classification, drought index, runoff estimate, water-balance, or forecast.";

/** Options for classifying dry months. */
export interface PrecipitationDrySpellOptions {
  /**
   * Monthly accumulated depth below which a month is a dry month, in mm. Must be
   * finite and positive. Defaults to the Köppen dry-month threshold (60 mm).
   */
  dryMonthThresholdMm?: number;
}

export interface PrecipitationDrySpell {
  kind: "derived-precip-dry-spell";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Dry-month threshold applied, in mm (dry month = total strictly below it). */
  dryMonthThresholdMm: number;
  /** First (oldest) month covered by the window. */
  startMonth: YearMonth;
  /** Last (newest) month covered by the window. */
  endMonth: YearMonth;
  /** Number of consecutive months in the window (≥ 1). */
  monthCount: number;
  /** Months with an accumulated depth strictly below the threshold. */
  dryMonthCount: number;
  /** Months with an accumulated depth at or above the threshold. */
  wetMonthCount: number;
  /**
   * Longest run of consecutive dry months. For a 12-month window this
   * approximates the length of the dry season; 0 when no month is dry.
   */
  longestDryRun: number;
  /** Longest run of consecutive wet months; 0 when no month is wet. */
  longestWetRun: number;
  /**
   * Number of separate dry spells (maximal consecutive dry runs) in the window.
   * 1 means every dry month formed a single contiguous dry season; a larger
   * count means the dry months were split across the window.
   */
  drySpellCount: number;
  /**
   * First month of the earliest longest dry run, or null when no month is dry.
   * When several runs tie for longest, the earliest is reported.
   */
  longestDryRunStart: YearMonth | null;
  /** Last month of that same longest dry run, or null when no month is dry. */
  longestDryRunEnd: YearMonth | null;
  /**
   * True only for a full 12-month window, where `longestDryRun` approximates the
   * annual dry-season length and `dryMonthCount` is the Köppen dry-month count.
   */
  isAnnualWindow: boolean;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Describe the dry-/wet-month sequence of a set of usable monthly precipitation
 * accumulations over their window.
 *
 * Inputs may be supplied in any order; they are ordered oldest → newest
 * internally, which is what makes the run lengths well-defined. Returns `null` —
 * never a fabricated or partial description — unless the months form a strictly
 * consecutive run (no gap, no duplicate/overlapping month) from a single cited
 * dataset with finite, non-negative totals, and the threshold is finite and
 * positive. A bone-dry window is *not* a null: every month is a dry month, which
 * is a valid maximally-dry description. Mirrors the consecutive-run and
 * single-source contract of precipitationSeasonalityIndex.ts.
 */
export function precipitationDrySpell(
  accumulations: readonly PrecipitationAccumulation[],
  options: PrecipitationDrySpellOptions = {}
): PrecipitationDrySpell | null {
  if (accumulations.length === 0) return null;

  const threshold = options.dryMonthThresholdMm ?? KOPPEN_DRY_MONTH_MM;
  // A non-positive or non-finite threshold cannot separate dry from wet months.
  if (!Number.isFinite(threshold) || threshold <= 0) return null;

  // Order oldest → newest without mutating the caller's array; ordering makes
  // both the consecutive-run check and the run lengths well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];

    // Every month must cite the same product; a spell cannot mix provenance.
    if (!sameDataset(entry.source, source)) return null;

    // Guard each monthly total so a corrupt input never yields a
    // plausible-looking but meaningless label.
    if (!Number.isFinite(entry.totalMm) || entry.totalMm < 0) return null;

    if (i > 0) {
      const gap =
        ymToIndex(entry.dataMonth) - ymToIndex(ordered[i - 1].dataMonth);
      // gap === 0 → duplicate/overlapping month; gap > 1 → a missing month.
      if (gap !== 1) return null;
    }
  }

  const monthCount = ordered.length;
  let dryMonthCount = 0;
  let wetMonthCount = 0;
  let drySpellCount = 0;
  let currentDryRun = 0;
  let currentWetRun = 0;
  let longestDryRun = 0;
  let longestWetRun = 0;
  let longestDryRunEndIndex = -1;

  for (let i = 0; i < monthCount; i++) {
    const isDry = ordered[i].totalMm < threshold;
    if (isDry) {
      dryMonthCount += 1;
      // A dry spell begins on a dry month that follows a non-dry month (or the
      // window start), so count transitions into dryness.
      if (currentDryRun === 0) drySpellCount += 1;
      currentDryRun += 1;
      currentWetRun = 0;
      // Strictly-greater keeps the *earliest* run when several tie for longest.
      if (currentDryRun > longestDryRun) {
        longestDryRun = currentDryRun;
        longestDryRunEndIndex = i;
      }
    } else {
      wetMonthCount += 1;
      currentWetRun += 1;
      currentDryRun = 0;
      if (currentWetRun > longestWetRun) longestWetRun = currentWetRun;
    }
  }

  const hasDryRun = longestDryRun > 0 && longestDryRunEndIndex >= 0;
  const longestDryRunEnd = hasDryRun
    ? ordered[longestDryRunEndIndex].dataMonth
    : null;
  const longestDryRunStart = hasDryRun
    ? ordered[longestDryRunEndIndex - longestDryRun + 1].dataMonth
    : null;

  return {
    kind: "derived-precip-dry-spell",
    isForecast: false,
    dryMonthThresholdMm: threshold,
    startMonth: ordered[0].dataMonth,
    endMonth: ordered[monthCount - 1].dataMonth,
    monthCount,
    dryMonthCount,
    wetMonthCount,
    longestDryRun,
    longestWetRun,
    drySpellCount,
    longestDryRunStart,
    longestDryRunEnd,
    isAnnualWindow: monthCount === 12,
    source,
  };
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
