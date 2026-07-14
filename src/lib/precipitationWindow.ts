import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  formatYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Sum a run of consecutive monthly precipitation *accumulations* into one
 * window total — the plain hydrologic answer to "how much water fell over these
 * N months?" (e.g. a wet-season or water-year total).
 *
 * Each input is a per-month accumulated depth already integrated from the GLDAS
 * monthly-mean rate (see precipitationAccumulation.ts). Because accumulation is
 * additive water-equivalent depth, a multi-month total is simply the sum of the
 * usable monthly totals — *provided the months form an unbroken, non-overlapping
 * run*. This helper enforces exactly that: it accepts a set of monthly totals,
 * orders them, and returns a window total only when they are strictly
 * consecutive with no gap and no duplicate month, from a single cited product.
 *
 * It adds no anomaly, climatology, normal, regime class, drought signal,
 * causation, or forecast — only an additive re-expression of already-usable
 * monthly totals onto a window scale, carrying the shared cited provenance. A
 * `null` return means "no window total can be stated" (empty input, a gap, an
 * overlap, or mixed provenance), never "zero fell".
 */

/** Honest scope limits for the derived multi-month window total. */
export const PRECIP_WINDOW_LIMITATIONS =
  "Window total is the sum of consecutive monthly GLDAS precipitation " +
  "accumulations (each the monthly-mean rate integrated over its month). It " +
  "requires an unbroken, non-overlapping run of usable months from one cited " +
  "product; a gap, overlap, or mixed source yields no total rather than a " +
  "guess. It inherits the land-model product's resolution and biases and is a " +
  "plain sum of observations — not a rain-gauge total, climatological normal, " +
  "anomaly, drought index, or forecast.";

export interface PrecipitationWindowAccumulation {
  kind: "derived-precip-window-accumulation";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Total accumulated depth summed across the window, in mm water-equivalent. */
  totalMm: number;
  /**
   * Arithmetic mean of the window's monthly totals (`totalMm / monthCount`).
   * A descriptive per-month average of the observed totals, not a normal.
   */
  meanMonthlyMm: number;
  /** First (oldest) month covered by the window. */
  startMonth: YearMonth;
  /** Last (newest) month covered by the window. */
  endMonth: YearMonth;
  /** Number of consecutive months summed. */
  monthCount: number;
  /** Calendar days across the window, summed from the monthly totals. */
  windowDays: number;
  /** Seconds across the window, summed from the monthly totals. */
  windowSeconds: number;
  /** Single cited product shared by every summed month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Sum a set of usable monthly precipitation accumulations into a window total.
 *
 * Inputs may be supplied in any order; they are ordered internally. Returns
 * `null` — never a fabricated or partial total — unless the months form a
 * strictly consecutive run (no gap, no duplicate/overlapping month) drawn from
 * a single cited dataset. This mirrors the per-month helper's rule that absence
 * of a statable value is reported as `null`, not invented.
 */
export function precipitationWindow(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationWindowAccumulation | null {
  if (accumulations.length === 0) return null;

  // Order oldest → newest without mutating the caller's array.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const first = ordered[0];
  const source = first.source;

  let totalMm = 0;
  let windowDays = 0;
  let windowSeconds = 0;

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];

    // Every month must cite the same product; a window cannot mix provenance.
    if (!sameDataset(entry.source, source)) return null;

    // Guard the summed quantities so a corrupt input never yields a
    // plausible-looking but meaningless total.
    if (!Number.isFinite(entry.totalMm) || entry.totalMm < 0) return null;

    if (i > 0) {
      const gap =
        ymToIndex(entry.dataMonth) - ymToIndex(ordered[i - 1].dataMonth);
      // gap === 0 → duplicate/overlapping month; gap > 1 → a missing month.
      if (gap !== 1) return null;
    }

    totalMm += entry.totalMm;
    windowDays += entry.monthDays;
    windowSeconds += entry.monthSeconds;
  }

  const last = ordered[ordered.length - 1];
  return {
    kind: "derived-precip-window-accumulation",
    isForecast: false,
    totalMm,
    meanMonthlyMm: totalMm / ordered.length,
    startMonth: first.dataMonth,
    endMonth: last.dataMonth,
    monthCount: ordered.length,
    windowDays,
    windowSeconds,
    source,
  };
}

/**
 * A concise, provenance-safe label for a window, e.g. "Jan 2026 – Mar 2026".
 * Uses the shared month formatter so copy stays consistent with the rest of
 * the app.
 */
export function formatPrecipitationWindowRange(
  window: PrecipitationWindowAccumulation
): string {
  if (window.monthCount === 1) return formatYm(window.startMonth);
  return `${formatYm(window.startMonth)} – ${formatYm(window.endMonth)}`;
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
