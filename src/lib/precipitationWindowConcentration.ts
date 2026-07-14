import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Describe how *evenly* a run of monthly precipitation accumulations spread its
 * water across the months — the plain hydrologic question behind a season
 * total: "did it arrive in one wet month, or fall steadily across the window?"
 *
 * Each input is a per-month accumulated depth already integrated from the GLDAS
 * monthly-mean rate (see precipitationAccumulation.ts). Given a strictly
 * consecutive, non-overlapping run from a single cited product, this helper sums
 * the window total and reports which month was wettest and driest and what
 * *share* of that total fell in each. A share of `1 / monthCount` would mean the
 * water was spread perfectly evenly; a wettest-month share near `1` means one
 * month dominated the window.
 *
 * It adds no anomaly, climatology, normal, regime class, drought signal,
 * runoff, water-balance, causation, or forecast — only descriptive shares of an
 * additive total, carrying the shared cited provenance. A `null` return means
 * "no concentration can be stated" (empty input, a gap, an overlap, mixed
 * provenance, or a bone-dry window whose zero total makes every share
 * undefined), never "spread evenly".
 */

/** Honest scope limits for the derived window-concentration descriptor. */
export const PRECIP_WINDOW_CONCENTRATION_LIMITATIONS =
  "Concentration shares divide each month's GLDAS precipitation accumulation " +
  "by the window total (the sum of a consecutive, non-overlapping run of usable " +
  "months from one cited product). They describe only how the observed water " +
  "was distributed in time; a share of 1/monthCount means perfectly even. They " +
  "require an unbroken single-source run and a positive total — a gap, overlap, " +
  "mixed source, or dry (zero-total) window yields no shares rather than a " +
  "guess. They inherit the land-model product's resolution and biases and are " +
  "plain descriptive fractions of observations — not a rain-gauge total, " +
  "climatological normal, anomaly, drought index, runoff estimate, or forecast.";

export interface PrecipitationWindowConcentration {
  kind: "derived-precip-window-concentration";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Wettest single month in the window (earliest on a tie). */
  wettestMonth: YearMonth;
  /** Accumulated depth of the wettest month, in mm water-equivalent. */
  wettestMonthMm: number;
  /** Fraction of the window total that fell in the wettest month, in (0, 1]. */
  wettestMonthShare: number;
  /** Driest single month in the window (earliest on a tie). */
  driestMonth: YearMonth;
  /** Accumulated depth of the driest month, in mm water-equivalent. */
  driestMonthMm: number;
  /** Fraction of the window total that fell in the driest month, in [0, share]. */
  driestMonthShare: number;
  /**
   * Number of consecutive months in the window. A perfectly even window has
   * every share equal to `1 / monthCount`; this is the reference for reading the
   * wettest/driest shares.
   */
  monthCount: number;
  /** Window total the shares are computed against, in mm water-equivalent. */
  totalMm: number;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Describe the temporal concentration of a set of usable monthly precipitation
 * accumulations across their window.
 *
 * Inputs may be supplied in any order; they are ordered internally, and depth
 * ties resolve deterministically to the earliest month. Returns `null` — never
 * a fabricated or partial descriptor — unless the months form a strictly
 * consecutive run (no gap, no duplicate/overlapping month) from a single cited
 * dataset *and* the window total is positive. A zero-total window is a real
 * observation ("no water fell"), but its shares are genuinely undefined (0/0),
 * so this reports `null` rather than inventing an even split.
 */
export function precipitationWindowConcentration(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationWindowConcentration | null {
  if (accumulations.length === 0) return null;

  // Order oldest → newest without mutating the caller's array; ordering also
  // makes the consecutive-run check and the tie-break well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;
  let totalMm = 0;
  let wettest = ordered[0];
  let driest = ordered[0];

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];

    // Every month must cite the same product; a window cannot mix provenance.
    if (!sameDataset(entry.source, source)) return null;

    // Guard each monthly total so a corrupt input never yields a
    // plausible-looking but meaningless share.
    if (!Number.isFinite(entry.totalMm) || entry.totalMm < 0) return null;

    if (i > 0) {
      const gap =
        ymToIndex(entry.dataMonth) - ymToIndex(ordered[i - 1].dataMonth);
      // gap === 0 → duplicate/overlapping month; gap > 1 → a missing month.
      if (gap !== 1) return null;
    }

    totalMm += entry.totalMm;
    // Strict comparisons keep the earliest month on a tie for both extremes.
    if (entry.totalMm > wettest.totalMm) wettest = entry;
    if (entry.totalMm < driest.totalMm) driest = entry;
  }

  // Shares divide by the total; a bone-dry window makes every share undefined.
  if (totalMm <= 0) return null;

  return {
    kind: "derived-precip-window-concentration",
    isForecast: false,
    wettestMonth: wettest.dataMonth,
    wettestMonthMm: wettest.totalMm,
    wettestMonthShare: wettest.totalMm / totalMm,
    driestMonth: driest.dataMonth,
    driestMonthMm: driest.totalMm,
    driestMonthShare: driest.totalMm / totalMm,
    monthCount: ordered.length,
    totalMm,
    source,
  };
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
