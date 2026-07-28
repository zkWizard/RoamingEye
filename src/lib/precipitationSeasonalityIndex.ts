import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import {
  compareYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Summarize *how seasonal* a run of monthly precipitation accumulations was, as
 * a single scalar — the Seasonality Index (SI) of Walsh & Lawler (1981):
 *
 *     SI = (1 / R) · Σ | xᵢ − R / N |
 *
 * where each `xᵢ` is one month's accumulated depth (see
 * precipitationAccumulation.ts), `R` is the window total, and `N` is the number
 * of months. SI is the mean absolute deviation of the monthly totals from a
 * perfectly even split (`R / N`), scaled by the total. It is 0 when every month
 * received an equal share and rises toward its ceiling `2·(N − 1) / N` (≈1.83
 * for a 12-month window) as the water piles into fewer months.
 *
 * SI is an L1 (mean-absolute-deviation) view of seasonality and is deliberately
 * complementary to the L2 / Herfindahl-type Precipitation Concentration Index in
 * precipitationConcentrationIndex.ts and to the wettest/driest two-month shares
 * in precipitationWindowConcentration.ts: the three answer the same plain
 * question ("how evenly did the water arrive?") through different, well-cited
 * lenses. SI's value here is its canonical *regime* labels (Walsh & Lawler 1981)
 * — "seasonal", "markedly seasonal with a long drier season", and so on — which
 * name a precipitation regime rather than only a concentration magnitude.
 *
 * Scientific honesty (kept in the code because callers will surface it):
 *  - The Walsh & Lawler (1981) regime classes are defined for a full *annual*
 *    (12-month) distribution, so this helper returns a `classification` only when
 *    `monthCount === 12` and leaves it `null` otherwise. The raw `si`,
 *    `uniformValue`, and `maxPossible` remain valid for any window length ≥ 2.
 *  - SI classically describes a long-term *mean* monthly regime. Computed over a
 *    single consecutive window it describes only *that window's* within-window
 *    distribution — one year's seasonality, not a climatological normal.
 *  - It adds no anomaly, climatology, normal, drought signal, runoff,
 *    water-balance, causation, or forecast — only a descriptive re-expression of
 *    an additive total's shape, carrying the shared cited provenance.
 *  - A `null` return means "no index can be stated" (fewer than two months, a
 *    gap, an overlap, mixed provenance, or a bone-dry window whose zero total
 *    makes the index undefined), never "spread evenly". A single month has no
 *    meaningful spread, so it yields `null` rather than a misleading SI of 0.
 */

/** Honest scope limits for the derived seasonality index. */
export const PRECIP_SEASONALITY_INDEX_LIMITATIONS =
  "The Seasonality Index (SI, Walsh & Lawler 1981) is " +
  "(1 / total) · Σ |monthly total − total / monthCount| over a consecutive, " +
  "non-overlapping run of usable GLDAS precipitation accumulations from one " +
  "cited product. It describes only how the observed water was distributed in " +
  "time: 0 means a perfectly even split, and the ceiling 2·(monthCount − 1) / " +
  "monthCount (≈1.83 for a full year) means one month held the whole window. It " +
  "requires an unbroken single-source run of at least two months and a positive " +
  "total — fewer than two months, a gap, overlap, mixed source, or dry " +
  "(zero-total) window yields no index rather than a guess. The Walsh & Lawler " +
  "regime classes are calibrated to a 12-month annual distribution and are " +
  "reported only for one, never extrapolated to other lengths; over a single " +
  "window they describe that window's own seasonality, not a climatological " +
  "normal. It inherits the land-model product's resolution and biases and is a " +
  "plain descriptive statistic of observations — not a rain-gauge total, " +
  "climatological normal, anomaly, drought index, runoff estimate, or forecast.";

/**
 * Descriptive precipitation-regime classes for an *annual* (12-month) SI,
 * following the commonly cited regime table of Walsh & Lawler (1981). These are
 * qualitative reading aids for a calendar-year window only, not standardized
 * thresholds and with no hydrologic-hazard meaning; the numeric `si` remains the
 * authoritative value.
 */
export type PrecipitationSeasonalityClass =
  | "very-equable"
  | "equable-with-wetter-season"
  | "rather-seasonal"
  | "seasonal"
  | "markedly-seasonal"
  | "most-in-three-months"
  | "extreme";

interface SeasonalityClassBand {
  category: PrecipitationSeasonalityClass;
  /** Exclusive upper SI bound; null means unbounded above. */
  maxExclusive: number | null;
  label: string;
}

/**
 * Annual-window SI regime bands, ordered from evenly spread to extremely
 * concentrated. Break points at 0.20 / 0.40 / 0.60 / 0.80 / 1.00 / 1.20 follow
 * Walsh & Lawler (1981). Applied only when `monthCount === 12` (see module
 * docstring).
 */
const ANNUAL_SI_CLASS_BANDS: readonly SeasonalityClassBand[] = [
  {
    category: "very-equable",
    maxExclusive: 0.2,
    label: "very equable (precipitation spread throughout the year)",
  },
  {
    category: "equable-with-wetter-season",
    maxExclusive: 0.4,
    label: "equable but with a definite wetter season",
  },
  {
    category: "rather-seasonal",
    maxExclusive: 0.6,
    label: "rather seasonal with a short drier season",
  },
  {
    category: "seasonal",
    maxExclusive: 0.8,
    label: "seasonal",
  },
  {
    category: "markedly-seasonal",
    maxExclusive: 1.0,
    label: "markedly seasonal with a long drier season",
  },
  {
    category: "most-in-three-months",
    maxExclusive: 1.2,
    label: "most precipitation in three months or fewer",
  },
  {
    category: "extreme",
    maxExclusive: null,
    label:
      "extreme seasonality (almost all precipitation in one or two months)",
  },
];

export interface PrecipitationSeasonalityIndex {
  kind: "derived-precip-seasonality-index";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Walsh & Lawler (1981) SI: (1 / R) · Σ |xᵢ − R / N| over the window's monthly
   * totals. In `[0, 2·(N − 1) / N]`: 0 is a perfectly even split, the ceiling is
   * the whole window in one month.
   */
  si: number;
  /**
   * The even-split monthly depth, `totalMm / monthCount`, in mm
   * water-equivalent. The reference each month's deviation is measured from.
   */
  uniformValue: number;
  /**
   * Ceiling SI for this window length, `2·(monthCount − 1) / monthCount`. The
   * honest upper reference for reading `si` at any length (it is ≈1.83 only for a
   * 12-month window); `si / maxPossible` gives a length-free fraction of the
   * maximum attainable seasonality.
   */
  maxPossible: number;
  /** First (oldest) month covered by the window. */
  startMonth: YearMonth;
  /** Last (newest) month covered by the window. */
  endMonth: YearMonth;
  /** Number of consecutive months in the window (≥ 2). */
  monthCount: number;
  /** Window total the index is computed against, in mm water-equivalent. */
  totalMm: number;
  /**
   * Walsh & Lawler descriptive regime class, ONLY when `monthCount === 12` (the
   * annual window the thresholds are calibrated for); null for any other length,
   * where the class labels do not transfer but `si` / `maxPossible` stay valid. A
   * descriptive reading aid, never a standardized threshold.
   */
  classification: PrecipitationSeasonalityClass | null;
  /** Human-readable label for `classification`, or null when not classified. */
  classLabel: string | null;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Compute the Walsh & Lawler (1981) Seasonality Index for a set of usable
 * monthly precipitation accumulations over their window.
 *
 * Inputs may be supplied in any order; they are ordered internally. Returns
 * `null` — never a fabricated or partial index — unless the months form a
 * strictly consecutive run (no gap, no duplicate/overlapping month) of at least
 * two months from a single cited dataset *and* the window total is positive. A
 * single month has no meaningful spread (its SI would be a misleading 0), and a
 * zero-total window is a real observation ("no water fell") but leaves SI as
 * 0/0, so both report `null` rather than inventing a value. Mirrors the null
 * contract of precipitationConcentrationIndex.ts.
 */
export function precipitationSeasonalityIndex(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationSeasonalityIndex | null {
  if (accumulations.length < 2) return null;

  // Order oldest → newest without mutating the caller's array; ordering makes
  // the consecutive-run check well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;
  let sumMm = 0;

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
  }

  // SI scales each deviation by the window total; a bone-dry window makes it 0/0.
  if (sumMm <= 0) return null;

  const monthCount = ordered.length;
  const uniformValue = sumMm / monthCount;

  let sumAbsoluteDeviation = 0;
  for (const entry of ordered) {
    sumAbsoluteDeviation += Math.abs(entry.totalMm - uniformValue);
  }

  const si = sumAbsoluteDeviation / sumMm;
  const maxPossible = (2 * (monthCount - 1)) / monthCount;
  const classBand = monthCount === 12 ? classifyAnnualSi(si) : null;

  return {
    kind: "derived-precip-seasonality-index",
    isForecast: false,
    si,
    uniformValue,
    maxPossible,
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
 * Map an annual-window SI to its Walsh & Lawler regime class. Callers must only
 * invoke this for a 12-month window; for other lengths the break points are not
 * calibrated (see module docstring).
 */
function classifyAnnualSi(si: number): SeasonalityClassBand {
  const band = ANNUAL_SI_CLASS_BANDS.find(
    (candidate) =>
      candidate.maxExclusive === null || si < candidate.maxExclusive
  );
  // The final band is unbounded above, so a finite si always matches.
  return band ?? ANNUAL_SI_CLASS_BANDS[ANNUAL_SI_CLASS_BANDS.length - 1];
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
