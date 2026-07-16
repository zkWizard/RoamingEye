import type { PrecipitationAccumulation } from "./precipitationAccumulation";
import { neumaierSum } from "./numerics";
import {
  compareYm,
  ymToIndex,
  type DatasetRef,
  type YearMonth,
} from "./timeline";

/**
 * Summarize the *rainfall aggressiveness* of one annual cycle of monthly
 * precipitation accumulations as a single scalar — the Modified Fournier Index
 * (MFI) of Arnoldus (1977, 1980), which generalizes the original single-month
 * Fournier (1960) index to use every month:
 *
 *     MFI = Σ(pᵢ²) / P        (i = 1…12, P = Σ pᵢ)
 *
 * where each `pᵢ` is one month's accumulated depth (see
 * precipitationAccumulation.ts) and `P` is the annual total. MFI has units of
 * mm and answers a question neither the total nor the PCI answers alone:
 * precipitationConcentrationIndex.ts reports the PCI, a *scale-free* shape of the
 * monthly distribution (in `[100 / 12, 100]`, blind to how much water fell), and
 * precipitationAccumulation.ts reports each month's *magnitude* (blind to how it
 * is distributed). MFI combines the two — it grows both when more water falls and
 * when that water piles into fewer months — because a wet, concentrated year and
 * a dry, concentrated year share a PCI but are very different rainfall regimes.
 * That coupling is exactly why MFI is widely used as a rainfall-aggressiveness
 * (erosivity) proxy.
 *
 * The two indices are related by a simple identity, MFI = P · PCI / 100, but MFI
 * is reported here as its own quantity because its units and its interpretive
 * class breaks (below) are meaningful in a way the dimensionless PCI is not.
 *
 * Scientific honesty (kept in code because callers surface it):
 *  - MFI is a descriptive rainfall-aggressiveness proxy, NOT a soil-loss, runoff,
 *    sediment-yield, or rainfall-erosivity (R-factor) value. The class breaks
 *    (Arnoldus 1980) are qualitative reading aids for interpreting the index, not
 *    standardized erosion-hazard thresholds and with no runoff or hazard meaning;
 *    the numeric `mfiMm` remains the authoritative value.
 *  - It is computed over an unbroken, single-source run of exactly twelve usable
 *    months (one complete annual cycle, so every calendar month is represented
 *    once) and requires a positive annual total. A gap, overlap, mixed source,
 *    wrong length, or bone-dry (zero-total) year yields `null` — the index is
 *    P-normalized and undefined at `P = 0` — never a guessed or partial value.
 *  - It adds no anomaly, climatology, normal, drought signal, water balance,
 *    causation, or forecast: it is a plain descriptive statistic of one year of
 *    observed monthly water, carrying the shared cited provenance.
 *  - It inherits the land-model product's resolution and biases and is not a
 *    rain-gauge total.
 */

/** MFI is defined on one complete annual cycle of monthly totals. */
export const PRECIP_FOURNIER_MONTHS = 12;

/** Honest scope limits for the derived Modified Fournier Index. */
export const PRECIP_FOURNIER_INDEX_LIMITATIONS =
  "The Modified Fournier Index (MFI, Arnoldus 1980) is Σ(monthly total)² / " +
  "(annual total) over an unbroken, single-source run of exactly twelve usable " +
  "GLDAS precipitation accumulations — one complete annual cycle. In mm, it " +
  "describes rainfall aggressiveness: it grows both with the amount of water and " +
  "with how much that water concentrates into fewer months (a wet concentrated " +
  "year and a dry concentrated year share a PCI but differ in MFI). It requires " +
  "a positive annual total — a gap, overlap, mixed source, wrong length, or dry " +
  "(zero-total) year yields no index rather than a guess. The Arnoldus class " +
  "labels are qualitative reading aids, not standardized erosion-hazard " +
  "thresholds, and carry no runoff, soil-loss, or R-factor meaning. It inherits " +
  "the land-model product's resolution and biases and is a plain descriptive " +
  "statistic of observations — not a rain-gauge total, climatological normal, " +
  "anomaly, drought index, erosivity value, or forecast.";

/**
 * Descriptive rainfall-aggressiveness classes for the MFI, following the
 * commonly cited break points of Arnoldus (1980). These are qualitative reading
 * aids only, not standardized erosion-hazard thresholds; the numeric `mfiMm`
 * remains the authoritative value.
 */
export type FournierAggressivenessClass =
  "very-low" | "low" | "moderate" | "high" | "very-high";

interface FournierClassBand {
  category: FournierAggressivenessClass;
  /** Exclusive upper MFI bound in mm; null means unbounded above. */
  maxExclusive: number | null;
  label: string;
}

/**
 * MFI class bands (mm), ordered from least to most aggressive. Break points at
 * 60 / 90 / 120 / 160 follow Arnoldus (1980) as widely applied in the rainfall-
 * erosivity literature.
 */
const FOURNIER_CLASS_BANDS: readonly FournierClassBand[] = [
  { category: "very-low", maxExclusive: 60, label: "very low aggressiveness" },
  { category: "low", maxExclusive: 90, label: "low aggressiveness" },
  {
    category: "moderate",
    maxExclusive: 120,
    label: "moderate aggressiveness",
  },
  { category: "high", maxExclusive: 160, label: "high aggressiveness" },
  {
    category: "very-high",
    maxExclusive: null,
    label: "very high aggressiveness",
  },
];

export interface PrecipitationFournierIndex {
  kind: "derived-precip-fournier-index";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /**
   * Modified Fournier Index: Σ(pᵢ²) / P over the year's monthly totals, in mm.
   * Bounded by `[P / 12, P]`: the lower bound is a perfectly even year, the
   * upper is the whole year's water in a single month.
   */
  mfiMm: number;
  /** Annual total the index is normalized by, in mm water-equivalent. */
  totalMm: number;
  /**
   * The MFI a perfectly even year would take, `P / 12` — the honest reference
   * point for reading `mfiMm` against this year's own water volume.
   */
  evenYearValueMm: number;
  /** First (oldest) month of the annual cycle. */
  startMonth: YearMonth;
  /** Last (newest) month of the annual cycle. */
  endMonth: YearMonth;
  /** Always {@link PRECIP_FOURNIER_MONTHS} — a complete annual cycle. */
  monthCount: number;
  /**
   * Arnoldus (1980) descriptive aggressiveness class. A qualitative reading aid
   * for the annual index, never a standardized erosion-hazard threshold.
   */
  classification: FournierAggressivenessClass;
  /** Human-readable label for `classification`. */
  classLabel: string;
  /** Single cited product shared by every month; provenance preserved. */
  source: DatasetRef;
}

/**
 * Compute the Modified Fournier Index for one annual cycle of usable monthly
 * precipitation accumulations.
 *
 * Inputs may be supplied in any order; they are ordered internally. Returns
 * `null` — never a fabricated or partial index — unless the months form a
 * strictly consecutive run of exactly twelve months (no gap, no
 * duplicate/overlapping month) from a single cited dataset *and* the annual
 * total is positive. A zero-total (bone-dry) year is a real observation, but MFI
 * is `P`-normalized and undefined there, so this reports `null` rather than
 * inventing a value. Mirrors the null contract of
 * precipitationSeasonalTiming.ts.
 */
export function precipitationFournierIndex(
  accumulations: readonly PrecipitationAccumulation[]
): PrecipitationFournierIndex | null {
  if (accumulations.length !== PRECIP_FOURNIER_MONTHS) return null;

  // Order oldest → newest without mutating the caller's array; ordering makes
  // the consecutive-run check well-defined.
  const ordered = [...accumulations].sort((a, b) =>
    compareYm(a.dataMonth, b.dataMonth)
  );

  const source = ordered[0].source;
  const totals: number[] = [];
  const squares: number[] = [];

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

    totals.push(entry.totalMm);
    squares.push(entry.totalMm * entry.totalMm);
  }

  const totalMm = neumaierSum(totals);
  // MFI divides by the annual total; a bone-dry year makes it 0/0.
  if (totalMm <= 0) return null;

  const sumSquaredMm = neumaierSum(squares);
  const mfiMm = sumSquaredMm / totalMm;
  const classBand = classifyFournier(mfiMm);

  return {
    kind: "derived-precip-fournier-index",
    isForecast: false,
    mfiMm,
    totalMm,
    evenYearValueMm: totalMm / PRECIP_FOURNIER_MONTHS,
    startMonth: ordered[0].dataMonth,
    endMonth: ordered[PRECIP_FOURNIER_MONTHS - 1].dataMonth,
    monthCount: PRECIP_FOURNIER_MONTHS,
    classification: classBand.category,
    classLabel: classBand.label,
    source,
  };
}

/** Map an MFI (mm) to its Arnoldus (1980) descriptive aggressiveness class. */
function classifyFournier(mfiMm: number): FournierClassBand {
  const band = FOURNIER_CLASS_BANDS.find(
    (candidate) =>
      candidate.maxExclusive === null || mfiMm < candidate.maxExclusive
  );
  // The final band is unbounded above, so a finite mfi always matches.
  return band ?? FOURNIER_CLASS_BANDS[FOURNIER_CLASS_BANDS.length - 1];
}

/** Two DatasetRefs cite the same product iff their identifying fields match. */
function sameDataset(a: DatasetRef, b: DatasetRef): boolean {
  return (
    a.shortName === b.shortName && a.version === b.version && a.doi === b.doi
  );
}
