import {
  NDVI_UNIT,
  type Hemisphere,
  type NdviAnnualPhenology,
} from "./phenology";
import type { DatasetRef } from "./timeline";

/**
 * Descriptive partition of a year's NDVI cycle between its two observed extrema.
 *
 * {@link summarizeAnnualNdviPhenology} already reports, per year, the highest
 * (peak) and lowest (trough) supplied monthly MOD13A3 NDVI observation. Those
 * two calendar months split the 12-month year into two complementary arcs:
 * the forward separation from the trough month to the peak month (the "rising"
 * side of a single-peak cycle) and the forward separation from the peak month
 * back to the trough month (the "falling" side). This helper reports the length
 * of each arc, in whole calendar months, and which side occupies more of the
 * year.
 *
 * The two arcs are purely the circular calendar separation between the two
 * extrema; they always sum to 12. This is NOT green-up or senescence onset
 * detection, phenophase dates, a per-month rate, a monotonicity claim about the
 * unobserved intervening months, a productivity or biomass measure, or any
 * biological, causal, or predictive statement. NDVI is a unitless
 * vegetation-index observation; nothing here infers plant stages, ecosystem
 * health, or causes. It complements the within-year limb descriptor (which
 * reports the direct interval and signed magnitude between the extrema), the
 * peak-timing descriptor (which calendar month peaks fall in), and the
 * amplitude descriptor (how large the annual range is): this one describes only
 * how the calendar year is divided between the trough and the peak.
 */

const FULL_YEAR_MONTHS = 12;

/**
 * Which of the two complementary arcs spans more of the calendar year.
 * "trough-to-peak" is the forward interval from the annual trough to the annual
 * peak; "peak-to-trough" is its complement. "balanced" means an even 6/6 split.
 */
export type NdviDominantArc = "trough-to-peak" | "peak-to-trough" | "balanced";

/**
 * "available" when both extrema exist and fall in different calendar months;
 * "sparse" when the year had no reported peak or trough; "flat" when the peak
 * and trough share a calendar month, leaving no cycle to partition.
 */
export type NdviCycleAsymmetryStatus = "available" | "sparse" | "flat";

export interface NdviAnnualCycleAsymmetry {
  kind: "observed-ndvi-cycle-asymmetry";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  year: number;
  hemisphere: Hemisphere;
  status: NdviCycleAsymmetryStatus;
  /**
   * Forward calendar months from the trough month to the peak month, wrapping
   * across year end (1..11). Null for sparse or flat years.
   */
  troughToPeakMonths: number | null;
  /**
   * Forward calendar months from the peak month back to the trough month, the
   * complement of {@link troughToPeakMonths} (1..11). Together they sum to 12.
   */
  peakToTroughMonths: number | null;
  /**
   * |troughToPeakMonths - peakToTroughMonths|: how lopsided the split is, in
   * whole months. 0 for an even split, up to 10 for the most lopsided year.
   */
  asymmetryMonths: number | null;
  /** Which arc spans more of the year, or "balanced" for an even split. */
  dominantArc: NdviDominantArc | null;
  /** Calendar month (1..12) of the annual peak, echoed for auditability. */
  peakMonth: number | null;
  /** Calendar month (1..12) of the annual trough, echoed for auditability. */
  troughMonth: number | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no arcs are reported. */
  reason: string | null;
}

/**
 * Partition one year's NDVI cycle between its peak and trough calendar months.
 *
 * Reuses the already-validated extrema, hemisphere, and NASA provenance from
 * {@link summarizeAnnualNdviPhenology}; it re-parses nothing and drops no
 * dataset reference. Years too sparse for annual extrema carry no arcs, and a
 * year whose peak and trough fall in the same calendar month is reported as
 * flat rather than as a spurious zero-length or full-year arc.
 */
export function describeNdviCycleAsymmetry(
  annual: NdviAnnualPhenology
): NdviAnnualCycleAsymmetry {
  const base = {
    kind: "observed-ndvi-cycle-asymmetry" as const,
    isForecast: false as const,
    year: annual.year,
    hemisphere: annual.hemisphere,
    source: annual.source,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };
  const empty = {
    troughToPeakMonths: null,
    peakToTroughMonths: null,
    asymmetryMonths: null,
    dominantArc: null,
    peakMonth: null,
    troughMonth: null,
  };

  if (annual.peak === null || annual.trough === null) {
    return { ...base, ...empty, status: "sparse", reason: "sparse-year" };
  }

  const peakMonth = annual.peak.month.month;
  const troughMonth = annual.trough.month.month;
  const troughToPeakMonths = forwardMonthDistance(troughMonth, peakMonth);
  if (troughToPeakMonths === 0) {
    // Peak and trough share a calendar month: there is no interval to split.
    return {
      ...base,
      ...empty,
      peakMonth,
      troughMonth,
      status: "flat",
      reason: "no-within-year-variation",
    };
  }

  const peakToTroughMonths = FULL_YEAR_MONTHS - troughToPeakMonths;
  return {
    ...base,
    status: "available",
    troughToPeakMonths,
    peakToTroughMonths,
    asymmetryMonths: Math.abs(troughToPeakMonths - peakToTroughMonths),
    dominantArc: dominantArcFor(troughToPeakMonths, peakToTroughMonths),
    peakMonth,
    troughMonth,
    reason: null,
  };
}

/**
 * Forward circular distance in whole months from calendar month `from` to `to`
 * (both 1..12), wrapping across December. Returns 0 when the months are equal.
 */
function forwardMonthDistance(from: number, to: number): number {
  return (
    (((to - from) % FULL_YEAR_MONTHS) + FULL_YEAR_MONTHS) % FULL_YEAR_MONTHS
  );
}

function dominantArcFor(
  troughToPeakMonths: number,
  peakToTroughMonths: number
): NdviDominantArc {
  if (troughToPeakMonths > peakToTroughMonths) return "trough-to-peak";
  if (peakToTroughMonths > troughToPeakMonths) return "peak-to-trough";
  return "balanced";
}
