import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Summarize *how concentrated in time* a run of monthly precipitation
 * accumulations was, as a single scalar — the Precipitation Concentration Index
 * (PCI) of Oliver (1980):
 *
 *     PCI = 100 · Σ(pᵢ²) / (Σ pᵢ)²
 *
 * where each `pᵢ` is one month's accumulated depth (see
 * precipitationAccumulation.ts). PCI is a Herfindahl-type index of the full
 * monthly distribution: it is highest (100) when all the window's water fell in
 * a single month, and lowest (`100 / monthCount`) when every month received an
 * equal share. It answers, in one number, "did the water arrive evenly through
 * the window, or pile into a few months?" — complementing the wettest/driest
 * *two-month* shares in precipitationWindowConcentration.ts with a
 * whole-distribution measure.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - The published interpretive class breaks (Oliver 1980; Michiels et al. 1992)
 *    are calibrated for a full *annual* (12-month) window, where an even split
 *    gives PCI ≈ 8.3. For any other window length the even-split floor is
 *    `100 / monthCount` instead, so those class labels do NOT transfer; this
 *    helper therefore returns a `classification` only when `monthCount === 12`
 *    and leaves it `null` otherwise. The raw `pci`, `uniformValue`, and
 *    scale-free `effectiveMonths` remain valid for any window length.
 *  - It adds no anomaly, climatology, normal, drought signal, runoff,
 *    water-balance, causation, or forecast — only a descriptive re-expression of
 *    an additive total's shape, carrying the shared cited provenance.
 *  - A `null` return means "no index can be stated" (empty input, a gap, an
 *    overlap, mixed provenance, or a bone-dry window whose zero total makes the
 *    index undefined), never "spread evenly".
 */

/** Honest scope limits for the derived concentration index. */
export const PRECIP_CONCENTRATION_INDEX_LIMITATIONS =
  "The Precipitation Concentration Index (PCI, Oliver 1980) is " +
  "100 · Σ(monthly total)² / (Σ monthly total)² over a consecutive, " +
  "non-overlapping run of usable GLDAS precipitation accumulations from one " +
  "cited product. It describes only how the observed water was distributed in " +
  "time: 100 means one month held the whole window, 100/monthCount means a " +
  "perfectly even split. It requires an unbroken single-source run and a " +
  "positive total — a gap, overlap, mixed source, or dry (zero-total) window " +
  "yields no index rather than a guess. The Oliver/Michiels class labels are " +
  "calibrated to a 12-month annual window and are reported only for one, never " +
  "extrapolated to other lengths. It inherits the land-model product's " +
  "resolution and biases and is a plain descriptive statistic of observations — " +
  "not a rain-gauge total, climatological normal, anomaly, drought index, " +
  "runoff estimate, or forecast.";

/**
 * Descriptive concentration classes for an *annual* (12-month) PCI, following
 * the commonly cited break points of Oliver (1980) and Michiels et al. (1992).
 * These are qualitative reading aids for a calendar-year window only, not
 * standardized thresholds and with no hydrologic-hazard meaning; the numeric
 * `pci` remains the authoritative value.
 */
export type PrecipitationConcentrationClass =
  "uniform" | "moderate" | "irregular" | "strongly-irregular";

interface ConcentrationClassBand {
  category: PrecipitationConcentrationClass;
  /** Exclusive upper PCI bound; null means unbounded above. */
  maxExclusive: number | null;
  label: string;
}

/**
 * Annual-window PCI class bands, ordered from even to strongly concentrated.
 * Break points at 10 / 15 / 20 follow Oliver (1980) and Michiels et al. (1992).
 * Applied only when `monthCount === 12` (see module docstring).
 */
const ANNUAL_PCI_CLASS_BANDS: readonly ConcentrationClassBand[] = [
  {
    category: "uniform",
    maxExclusive: 10,
    label: "uniform precipitation (low seasonal concentration)",
  },
  {
    category: "moderate",
    maxExclusive: 15,
    label: "moderate seasonal concentration",
  },
  {
    category: "irregular",
    maxExclusive: 20,
    label: "irregular distribution (marked seasonality)",
  },
  {
    category: "strongly-irregular",
    maxExclusive: null,
    label: "strongly irregular distribution (highly concentrated)",
  },
];

export interface PrecipitationConcentrationIndex {
  kind: "derived-precip-concentration-index";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Oliver (1980) PCI: 100 · Σ(pᵢ²) / (Σ pᵢ)² over the window's monthly totals.
   * In `[100 / monthCount, 100]`: the lower bound is a perfectly even split, 100
   * is the whole window in one month.
   */
  pci: number;
  /**
   * The PCI value a perfectly even split would take for this window,
   * `100 / monthCount`. The honest reference point for reading `pci` at any
   * window length (it is ≈8.3 only for a 12-month window).
   */
  uniformValue: number;
  /**
   * Herfindahl-style effective number of months the water effectively spread
   * across: (Σ pᵢ)² / Σ(pᵢ²) = 100 / pci. In `(1, monthCount]` — equals
   * `monthCount` under an even split, approaches 1 when one month dominates.
   * Scale-free, so it stays interpretable for non-annual windows where the
   * class labels do not apply.
   */
  effectiveMonths: number;
  /** First (oldest) month covered by the window. */
  startMonth: YearMonth;
  /** Last (newest) month covered by the window. */
  endMonth: YearMonth;
  /** Number of consecutive months in the window. */
  monthCount: number;
  /** Window total the index is computed against, in mm water-equivalent. */
  totalMm: number;
  /**
   * Oliver/Michiels descriptive class, ONLY when `monthCount === 12` (the annual
   * window the thresholds are calibrated for); null for any other length, where
   * the class labels do not transfer but `pci`/`effectiveMonths` stay valid. A
   * descriptive reading aid, never a standardized threshold.
   */
  classification: PrecipitationConcentrationClass | null;
  /** Human-readable label for `classification`, or null when not classified. */
  classLabel: string | null;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Compute the Precipitation Concentration Index for a set of usable monthly
 * precipitation accumulations over their window.
 *
 * Inputs may be supplied in any order; they are ordered internally. Returns
 * `null` — never a fabricated or partial index — unless the months form a
 * strictly consecutive run (no gap, no duplicate/overlapping month) from a
 * single cited dataset *and* the window total is positive. A zero-total window
 * is a real observation ("no water fell"), but PCI is 0/0 there, so this reports
 * `null` rather than inventing an even split. Mirrors the null contract of
 * precipitationWindowConcentration.ts.
 */
export function precipitationConcentrationIndex(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationConcentrationIndex | null {
  if (accumulations.length === 0) return null;

  // Order oldest → newest without mutating the caller's array; ordering makes
  // the consecutive-run check well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;
  let sumMm = 0;
  let sumSquaredMm = 0;

  for (let i = 0; i < ordered.length; i++) {
    const entry = ordered[i];

    // Every month must cite the same product; an index cannot mix provenance.
    if (!sameDataset(entry.source, source)) return null;

    // Guard each monthly total so a corrupt input never yields a
    // plausible-looking but meaningless index.
    if (!Number.isFinite(entry.totalMm) || entry.totalMm < 0) return null;

    if (i > 0) {
      const gap =
        ymToIndex(entry.dataMonth) - ymToIndex(ordered[i - 1].dataMonth);
      // gap === 0 → duplicate/overlapping month; gap > 1 → a missing month.
      if (gap !== 1) return null;
    }

    sumMm += entry.totalMm;
    sumSquaredMm += entry.totalMm * entry.totalMm;
  }

  // PCI divides by the squared window total; a bone-dry window makes it 0/0.
  if (sumMm <= 0 || sumSquaredMm <= 0) return null;

  const monthCount = ordered.length;
  const pci = (100 * sumSquaredMm) / (sumMm * sumMm);
  const effectiveMonths = (sumMm * sumMm) / sumSquaredMm;
  const classBand = monthCount === 12 ? classifyAnnualPci(pci) : null;

  return {
    kind: "derived-precip-concentration-index",
    isForecast: false,
    pci,
    uniformValue: 100 / monthCount,
    effectiveMonths,
    startMonth: ordered[0].dataMonth,
    endMonth: ordered[monthCount - 1].dataMonth,
    monthCount,
    totalMm: sumMm,
    classification: classBand ? classBand.category : null,
    classLabel: classBand ? classBand.label : null,
    source,
  };
}

/**
 * Map an annual-window PCI to its Oliver/Michiels descriptive class. Callers
 * must only invoke this for a 12-month window; for other lengths the break
 * points are not calibrated (see module docstring).
 */
function classifyAnnualPci(pci: number): ConcentrationClassBand {
  const band = ANNUAL_PCI_CLASS_BANDS.find(
    (candidate) =>
      candidate.maxExclusive === null || pci < candidate.maxExclusive
  );
  // The final band is unbounded above, so a finite pci always matches.
  return band ?? ANNUAL_PCI_CLASS_BANDS[ANNUAL_PCI_CLASS_BANDS.length - 1];
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
