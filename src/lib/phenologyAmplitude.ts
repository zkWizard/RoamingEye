import {
  NDVI_SOURCE,
  NDVI_UNIT,
  type Hemisphere,
  type NdviAnnualPhenology,
} from "./phenology";
import { neumaierSum } from "./numerics";
import { type DatasetRef, type YearMonth } from "./timeline";

/**
 * Interannual summary of the observed within-year NDVI seasonal amplitude.
 *
 * {@link summarizeAnnualNdviPhenology} already reports, per year, the highest
 * (peak) and lowest (trough) supplied monthly MOD13A3 NDVI observation and
 * their difference (`seasonalRange`). This helper reduces a run of those annual
 * summaries to how large that within-year range is and how much it varies from
 * one year to the next.
 *
 * "Amplitude" here is strictly the observed annual peak-minus-trough NDVI
 * difference, a unitless vegetation-index quantity. It is NOT growing-season
 * productivity, biomass, canopy cover, an integral, greenness "strength", nor
 * any biological, causal, or predictive claim. It complements — and does not
 * duplicate — the peak-timing descriptor (which calendar month peaks occur in)
 * and the within-year limb descriptor (rising vs. falling between the extrema):
 * this one describes only the magnitude of the annual cycle across years.
 */

/** Two usable years is the floor for an interannual (year-to-year) summary. */
export const MINIMUM_YEARS_FOR_AMPLITUDE_SUMMARY = 2;

export type NdviAmplitudeStatus = "available" | "insufficient-years";

export interface NdviAmplitudeYear {
  year: number;
  /** Observed annual peak minus trough NDVI for the year; always >= 0. */
  amplitude: number;
  /** Calendar month of the year's peak observation, carried through unchanged. */
  peakMonth: YearMonth;
  /** Calendar month of the year's trough observation, carried through. */
  troughMonth: YearMonth;
}

export interface NdviAmplitudeCoverage {
  /** Annual summaries supplied by the caller. */
  suppliedYearCount: number;
  /** Years carrying an observed range (peak and trough both present). */
  usableYearCount: number;
  /** Supplied years with no observed range (sparse or no-data). */
  unusableYearCount: number;
}

export interface NdviAmplitudeStatistics {
  /** Mean of the per-year amplitudes, unitless NDVI. */
  mean: number;
  /** Smallest observed annual amplitude. */
  min: number;
  /** Largest observed annual amplitude. */
  max: number;
  /** max - min: the interannual spread of the annual amplitude. */
  spread: number;
  /** Sample (n-1) standard deviation of the annual amplitudes. */
  sampleStandardDeviation: number;
}

export interface NdviSeasonalAmplitudeSummary {
  kind: "observed-ndvi-seasonal-amplitude";
  /** Explicitly prevents consumers from treating this as a temporal forecast. */
  isForecast: false;
  hemisphere: Hemisphere;
  status: NdviAmplitudeStatus;
  requiredYearCount: number;
  coverage: NdviAmplitudeCoverage;
  /** Per-year amplitudes, oldest to newest; may be non-empty even when sparse. */
  years: NdviAmplitudeYear[];
  /** Distribution of the annual amplitudes, or null with too few usable years. */
  statistics: NdviAmplitudeStatistics | null;
  /** Year with the smallest amplitude; ties keep the earliest year. */
  smallestAmplitudeYear: NdviAmplitudeYear | null;
  /** Year with the largest amplitude; ties keep the earliest year. */
  largestAmplitudeYear: NdviAmplitudeYear | null;
  source: DatasetRef;
  unit: typeof NDVI_UNIT;
  /** Short machine-readable reason when no statistics are reported. */
  reason: string | null;
}

/**
 * Summarize the interannual distribution of the observed annual NDVI amplitude.
 *
 * Reuses the already-validated per-year extrema, hemisphere, and NASA
 * provenance from {@link summarizeAnnualNdviPhenology}; it re-parses nothing and
 * drops no dataset reference. Only years that carry an observed `seasonalRange`
 * (i.e. neither sparse nor no-data) contribute, so a missing year can never be
 * counted as a zero-amplitude year. Fewer than the required usable years yields
 * an honest `insufficient-years` result rather than a spurious one-year spread.
 */
export function summarizeNdviSeasonalAmplitude(
  annuals: readonly NdviAnnualPhenology[]
): NdviSeasonalAmplitudeSummary {
  const hemisphere: Hemisphere = annuals[0]?.hemisphere ?? "unknown";
  const source = annuals[0]?.source ?? NDVI_SOURCE;

  const usable: NdviAmplitudeYear[] = [];
  for (const annual of annuals) {
    if (
      annual.seasonalRange === null ||
      annual.peak === null ||
      annual.trough === null
    ) {
      continue;
    }
    usable.push({
      year: annual.year,
      amplitude: annual.seasonalRange,
      peakMonth: annual.peak.month,
      troughMonth: annual.trough.month,
    });
  }
  usable.sort((a, b) => a.year - b.year);

  const coverage: NdviAmplitudeCoverage = {
    suppliedYearCount: annuals.length,
    usableYearCount: usable.length,
    unusableYearCount: annuals.length - usable.length,
  };

  const base = {
    kind: "observed-ndvi-seasonal-amplitude" as const,
    isForecast: false as const,
    hemisphere,
    requiredYearCount: MINIMUM_YEARS_FOR_AMPLITUDE_SUMMARY,
    coverage,
    years: usable,
    source,
    unit: NDVI_UNIT as typeof NDVI_UNIT,
  };

  if (usable.length < MINIMUM_YEARS_FOR_AMPLITUDE_SUMMARY) {
    return {
      ...base,
      status: "insufficient-years",
      statistics: null,
      smallestAmplitudeYear: null,
      largestAmplitudeYear: null,
      reason: "insufficient-years",
    };
  }

  const values = usable.map((entry) => entry.amplitude);
  const mean = neumaierSum(values) / values.length;
  const variance =
    neumaierSum(values.map((value) => (value - mean) ** 2)) /
    (values.length - 1);
  const min = Math.min(...values);
  const max = Math.max(...values);

  return {
    ...base,
    status: "available",
    statistics: {
      mean,
      min,
      max,
      spread: max - min,
      sampleStandardDeviation: Math.sqrt(variance),
    },
    smallestAmplitudeYear: extremeAmplitudeYear(usable, "smallest"),
    largestAmplitudeYear: extremeAmplitudeYear(usable, "largest"),
    reason: null,
  };
}

/**
 * Return the year with the most extreme amplitude. `years` is ordered oldest to
 * newest and only a strictly more extreme value replaces the running best, so
 * ties resolve to the earliest year.
 */
function extremeAmplitudeYear(
  years: readonly NdviAmplitudeYear[],
  which: "smallest" | "largest"
): NdviAmplitudeYear {
  let best = years[0];
  for (const candidate of years) {
    if (which === "largest" && candidate.amplitude > best.amplitude) {
      best = candidate;
    } else if (which === "smallest" && candidate.amplitude < best.amplitude) {
      best = candidate;
    }
  }
  return best;
}
