import {
  NDVI_SOURCE,
  NDVI_UNIT,
  type Hemisphere,
  type NdviAnnualPhenology,
} from "./phenology";
import { neumaierSum } from "./numerics";
import { type DatasetRef, type YearMonth } from "./timeline";

/**
 * Interannual summary of the observed annual NDVI extremum *levels* — the
 * greenest-month (peak) and least-green-month (trough) values themselves.
 *
 * {@link summarizeAnnualNdviPhenology} already reports, per year, the highest
 * (peak) and lowest (trough) supplied monthly MOD13A3 NDVI observation and
 * their difference (`seasonalRange`). {@link summarizeNdviSeasonalAmplitude}
 * reduces a run of years to that *difference* (peak minus trough) and how it
 * varies. This helper reduces the same run to the two *levels* whose difference
 * the amplitude is: how high greenness reaches at the annual peak, how low it
 * falls at the annual trough, and how steady each of those levels is from one
 * year to the next.
 *
 * The distinction matters because an unchanging amplitude can hide drifting
 * levels: two years can share an identical peak-minus-trough range while both
 * the peak and the trough sit markedly higher (or lower) in one year than the
 * other. Amplitude cancels that common shift; the level summary preserves it.
 *
 * Every value here is a level of a unitless vegetation-index observation. It is
 * NOT greenness "strength", canopy cover, biomass, productivity, an integral,
 * growing-season length, a plant phenophase, nor any biological, causal, or
 * predictive claim. The greenest / least-green *year* pointers rank observed
 * annual extrema only and infer no green-up, senescence, disturbance, or trend.
 * NASA MOD13A3 v061 provenance is carried through from the per-year extrema and
 * never dropped.
 */

/** Two usable years is the floor for an interannual (year-to-year) summary. */
export const MINIMUM_YEARS_FOR_EXTREMUM_LEVEL_SUMMARY = 2;

export type NdviExtremumLevelStatus = "available" | "insufficient-years";

export interface NdviExtremumLevelYear {
  year: number;
  /** Observed annual peak (greenest-month) NDVI level for the year. */
  peak: number;
  /** Observed annual trough (least-green-month) NDVI level for the year. */
  trough: number;
  /** Calendar month of the peak observation, carried through unchanged. */
  peakMonth: YearMonth;
  /** Calendar month of the trough observation, carried through unchanged. */
  troughMonth: YearMonth;
}

export interface NdviLevelStatistics {
  /** Mean of the per-year levels, unitless NDVI. */
  mean: number;
  /** Smallest observed annual level. */
  min: number;
  /** Largest observed annual level. */
  max: number;
  /** max - min: the interannual spread of the level. */
  spread: number;
  /** Sample (n-1) standard deviation of the annual levels. */
  sampleStandardDeviation: number;
}

/** A single year singled out by an observed annual extremum level. */
export interface NdviExtremeLevelYear {
  year: number;
  /** The extremum NDVI level for that year. */
  ndvi: number;
  /** Calendar month the extremum fell in. */
  month: YearMonth;
}

export interface NdviExtremumLevelSummary {
  kind: "observed-ndvi-seasonal-extremum-levels";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  status: NdviExtremumLevelStatus;
  requiredYearCount: number;
  coverage: {
    /** Annual summaries supplied by the caller. */
    suppliedYearCount: number;
    /** Years carrying both an observed peak and trough level. */
    usableYearCount: number;
    /** Supplied years with no observed extrema (sparse or no-data). */
    unusableYearCount: number;
  };
  /** Per-year peak and trough levels, oldest to newest; may be non-empty when sparse. */
  years: NdviExtremumLevelYear[];
  /** Distribution of the annual peak levels, or null with too few usable years. */
  peakLevel: NdviLevelStatistics | null;
  /** Distribution of the annual trough levels, or null with too few usable years. */
  troughLevel: NdviLevelStatistics | null;
  /** Year with the highest observed peak level; ties keep the earliest year. */
  greenestPeakYear: NdviExtremeLevelYear | null;
  /** Year with the lowest observed trough level; ties keep the earliest year. */
  leastGreenTroughYear: NdviExtremeLevelYear | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no statistics are reported. */
  reason: string | null;
}

/**
 * Summarize the interannual distribution of the observed annual NDVI peak and
 * trough levels.
 *
 * Reuses the already-validated per-year extrema, hemisphere, and NASA
 * provenance from {@link summarizeAnnualNdviPhenology}; it re-parses nothing and
 * drops no dataset reference. Only years that carry both an observed peak and
 * trough contribute, so a missing year can never be counted as a zero-level
 * year. Fewer than the required usable years yields an honest
 * `insufficient-years` result rather than a spurious one-year spread.
 */
export function summarizeNdviExtremumLevels(
  annuals: readonly NdviAnnualPhenology[]
): NdviExtremumLevelSummary {
  const hemisphere: Hemisphere = annuals[0]?.hemisphere ?? "unknown";
  const source = annuals[0]?.source ?? NDVI_SOURCE;

  const usable: NdviExtremumLevelYear[] = [];
  for (const annual of annuals) {
    if (annual.peak === null || annual.trough === null) continue;
    usable.push({
      year: annual.year,
      peak: annual.peak.ndvi,
      trough: annual.trough.ndvi,
      peakMonth: annual.peak.month,
      troughMonth: annual.trough.month,
    });
  }
  usable.sort((a, b) => a.year - b.year);

  const base = {
    kind: "observed-ndvi-seasonal-extremum-levels" as const,
    isForecast: false as const,
    hemisphere,
    requiredYearCount: MINIMUM_YEARS_FOR_EXTREMUM_LEVEL_SUMMARY,
    coverage: {
      suppliedYearCount: annuals.length,
      usableYearCount: usable.length,
      unusableYearCount: annuals.length - usable.length,
    },
    years: usable,
    source,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  if (usable.length < MINIMUM_YEARS_FOR_EXTREMUM_LEVEL_SUMMARY) {
    return {
      ...base,
      status: "insufficient-years",
      peakLevel: null,
      troughLevel: null,
      greenestPeakYear: null,
      leastGreenTroughYear: null,
      reason: "insufficient-years",
    };
  }

  return {
    ...base,
    status: "available",
    peakLevel: levelStatistics(usable.map((entry) => entry.peak)),
    troughLevel: levelStatistics(usable.map((entry) => entry.trough)),
    greenestPeakYear: extremeLevelYear(usable, "peak", "highest"),
    leastGreenTroughYear: extremeLevelYear(usable, "trough", "lowest"),
    reason: null,
  };
}

/** Distribution stats for a non-empty array of annual levels (sample SD). */
function levelStatistics(values: readonly number[]): NdviLevelStatistics {
  const mean = neumaierSum(values) / values.length;
  const variance =
    neumaierSum(values.map((value) => (value - mean) ** 2)) /
    (values.length - 1);
  const min = Math.min(...values);
  const max = Math.max(...values);
  return {
    mean,
    min,
    max,
    spread: max - min,
    sampleStandardDeviation: Math.sqrt(variance),
  };
}

/**
 * Return the year with the most extreme level of the requested extremum.
 * `years` is ordered oldest to newest and only a strictly more extreme value
 * replaces the running best, so ties resolve to the earliest year.
 */
function extremeLevelYear(
  years: readonly NdviExtremumLevelYear[],
  which: "peak" | "trough",
  direction: "highest" | "lowest"
): NdviExtremeLevelYear {
  let best = years[0];
  for (const candidate of years) {
    const value = candidate[which];
    const bestValue = best[which];
    if (direction === "highest" && value > bestValue) {
      best = candidate;
    } else if (direction === "lowest" && value < bestValue) {
      best = candidate;
    }
  }
  return {
    year: best.year,
    ndvi: best[which],
    month: which === "peak" ? best.peakMonth : best.troughMonth,
  };
}
