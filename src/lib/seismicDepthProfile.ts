import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";

/**
 * Descriptive hypocentral-depth distribution for a supplied set of USGS events.
 *
 * summarizeEarthquakes (see earthquakes.ts) already reports the depth *range*
 * (min/max) and the coarse shallow/intermediate/deep class counts. This module
 * adds the distribution's interior shape — the quartiles and median — so a
 * place panel or export can distinguish, say, a shallow mid-ocean-ridge swarm
 * from a deep Wadati–Benioff cluster whose extremes alone would look similar.
 *
 * Hypocentral depth is a linear physical quantity in kilometres, so order
 * statistics (median, quartiles, interquartile range) are well defined and
 * robust to outliers — unlike magnitude, which is logarithmic and is therefore
 * aggregated separately by summing seismic moment, never by averaging. This is
 * a descriptive summary of the depths reported by the feed; it is not a hazard
 * assessment, a forecast, or a statement of feed completeness.
 *
 * Pure, render-free logic (see seismicDepthProfile.test.ts).
 */

export interface DepthQuantiles {
  /** Shallowest reported hypocentre in the supplied set (km, positive down). */
  min: number;
  /** First quartile (25th percentile) of reported depth. */
  q1: number;
  /** Median (50th percentile) of reported depth. */
  median: number;
  /** Third quartile (75th percentile) of reported depth. */
  q3: number;
  /** Deepest reported hypocentre in the supplied set. */
  max: number;
  /** Interquartile range, q3 − q1 (km); zero when depths do not vary. */
  iqr: number;
}

/**
 * A descriptive aggregation of supplied events' reported depths, not a risk
 * score, diagnosis, causal statement, or prediction. `quantiles` is null when
 * no supplied event carried a finite depth, making an empty basis explicit.
 */
export interface SeismicDepthProfile {
  kind: "usgs-seismic-depth-profile";
  isForecast: false;
  suppliedEventCount: number;
  usableEventCount: number;
  quantiles: DepthQuantiles | null;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the reported hypocentral depths of the valid events supplied to this helper; it is not a hazard assessment, a forecast, or a statement of feed completeness.",
  "Quantiles use linear interpolation between the two nearest order statistics (the R-7 / NumPy-default convention); interior quantiles from a small sample are uncertain.",
  "USGS reports depth in kilometres positive downward; poorly-constrained events may carry an operator-fixed default depth, which this helper cannot distinguish from a resolved depth and retains as reported.",
] as const;

/**
 * The p-th quantile (0 ≤ p ≤ 1) of a pre-sorted ascending array by linear
 * interpolation between the closest ranks — the R-7 / NumPy-default method.
 * The caller guarantees a non-empty array.
 */
function quantileSorted(sorted: readonly number[], p: number): number {
  const lastIndex = sorted.length - 1;
  if (lastIndex === 0) return sorted[0];
  const rank = lastIndex * p;
  const lower = Math.floor(rank);
  const upper = Math.ceil(rank);
  if (lower === upper) return sorted[lower];
  return sorted[lower] + (sorted[upper] - sorted[lower]) * (rank - lower);
}

/**
 * Summarize the reported hypocentral-depth distribution of the supplied events,
 * retaining source and native unit labels. Events without a finite depth are
 * excluded from the quantiles but still counted in suppliedEventCount so the
 * basis of the summary stays auditable.
 */
export function seismicDepthProfile(
  earthquakes: readonly Earthquake[]
): SeismicDepthProfile {
  const depths = earthquakes
    .map((earthquake) => earthquake.depthKm)
    .filter((depthKm) => Number.isFinite(depthKm))
    .sort((first, second) => first - second);

  let quantiles: DepthQuantiles | null = null;
  if (depths.length > 0) {
    const q1 = quantileSorted(depths, 0.25);
    const q3 = quantileSorted(depths, 0.75);
    quantiles = {
      min: depths[0],
      q1,
      median: quantileSorted(depths, 0.5),
      q3,
      max: depths[depths.length - 1],
      iqr: q3 - q1,
    };
  }

  return {
    kind: "usgs-seismic-depth-profile",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount: depths.length,
    quantiles,
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
    limitations: LIMITATIONS,
  };
}
