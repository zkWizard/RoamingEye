import {
  NDVI_UNIT,
  type Hemisphere,
  type NdviAnnualPhenology,
  type NdviExtremum,
} from "./phenology";
import { compareYm, type DatasetRef } from "./timeline";

/**
 * Descriptive within-year limb between a year's two observed NDVI extrema.
 *
 * {@link summarizeAnnualNdviPhenology} already reports the highest (peak) and
 * lowest (trough) supplied monthly MOD13A3 NDVI observation for a year. This
 * helper reports only which of those two comes first in the calendar and the
 * signed index change across the interval between them.
 *
 * It is strictly the observed trend between two calendar months. It is NOT a
 * land-surface-phenology green-up or senescence onset date, a growth stage, a
 * per-month rate, a productivity measure, or any biological claim. NDVI is a
 * unitless vegetation-index observation; nothing here infers plant stages,
 * biomass, habitat quality, ecosystem health, causes, or future conditions.
 */

/**
 * Direction of the NDVI change across the within-year interval bounded by the
 * two observed annual extrema. "rising" means the earlier extremum is the
 * annual trough and the later one is the annual peak (NDVI increases across the
 * interval); "falling" is the reverse.
 */
export type NdviLimbDirection = "rising" | "falling";

export type NdviAnnualLimbStatus = "available" | "sparse" | "flat";

export interface NdviAnnualLimb {
  direction: NdviLimbDirection;
  /** Earlier of the two extrema in calendar order. */
  start: NdviExtremum;
  /** Later of the two extrema in calendar order. */
  end: NdviExtremum;
  /** Whole calendar months separating the two extrema (always >= 1). */
  spanMonths: number;
  /** end.ndvi - start.ndvi; positive when rising, negative when falling. */
  ndviChange: number;
}

export interface NdviAnnualLimbSummary {
  kind: "observed-ndvi-annual-limb";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  year: number;
  hemisphere: Hemisphere;
  status: NdviAnnualLimbStatus;
  /** The observed within-year limb, or null for sparse or flat years. */
  limb: NdviAnnualLimb | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no limb is reported. */
  reason: string | null;
}

/**
 * Describe the within-year limb between one year's NDVI peak and trough.
 *
 * Reuses the already-validated extrema, hemisphere, and NASA provenance from
 * {@link summarizeAnnualNdviPhenology}; it re-parses nothing and drops no
 * dataset reference. Years too sparse for annual extrema carry no limb, and a
 * year whose peak and trough fall in the same calendar month (no within-year
 * variation) is reported as flat rather than as a spurious zero-length limb.
 */
export function describeNdviAnnualLimb(
  annual: NdviAnnualPhenology
): NdviAnnualLimbSummary {
  const base = {
    kind: "observed-ndvi-annual-limb" as const,
    isForecast: false as const,
    year: annual.year,
    hemisphere: annual.hemisphere,
    source: annual.source,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  if (annual.peak === null || annual.trough === null) {
    return { ...base, status: "sparse", limb: null, reason: "sparse-year" };
  }

  const { peak, trough } = annual;
  const order = compareYm(trough.month, peak.month);
  if (order === 0) {
    // Peak and trough share a calendar month: a single flat extremum, so there
    // is no within-year interval to describe.
    return {
      ...base,
      status: "flat",
      limb: null,
      reason: "no-within-year-variation",
    };
  }

  const [start, end, direction]: [
    NdviExtremum,
    NdviExtremum,
    NdviLimbDirection,
  ] = order < 0 ? [trough, peak, "rising"] : [peak, trough, "falling"];

  return {
    ...base,
    status: "available",
    limb: {
      direction,
      start,
      end,
      spanMonths: compareYm(end.month, start.month),
      ndviChange: end.ndvi - start.ndvi,
    },
    reason: null,
  };
}
