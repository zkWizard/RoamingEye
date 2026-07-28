import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";

/**
 * Descriptive order-statistic summary of the reported magnitudes of a supplied
 * set of USGS events — the robust "five-number" view of the seismicity *size*
 * axis.
 *
 * The other size-axis helpers describe magnitude in complementary ways:
 * summarizeEarthquakes (earthquakes.ts) bins events into the named USGS
 * magnitude classes (micro…great) and reports the min/max magnitude range;
 * magnitudeFrequency.ts tallies the binned frequency–magnitude staircase; and
 * seismicMoment.ts sums seismic moment to answer the *energy* question. None of
 * them reports the distribution's robust interior — the quartiles and median of
 * the reported magnitudes — which is what this module adds, exactly paralleling
 * seismicDepthProfile.ts (hypocentral depth) and volcanoElevationProfile.ts
 * (summit elevation) so the three "profile" summaries read identically.
 *
 * Why order statistics are the right tool here, and why this is NOT the
 * forbidden magnitude average:
 *   - Magnitude is a base-10 logarithm of ground motion, so magnitudes must
 *     never be summed or arithmetically *averaged into a representative event*:
 *     the mean of an M4 and an M8 is not an "M6", and the pair's combined size
 *     (energy) is dominated almost entirely by the M8. That energy aggregation
 *     is handled separately, and correctly, by summing seismic moment.
 *   - Order statistics (min, quartiles, median, max) describe the *spread of the
 *     reported magnitude values themselves*. The median in particular is the
 *     robust central-tendency measure one reaches for *precisely because* the
 *     magnitudes cannot be averaged: it is insensitive to the rare large events
 *     that dominate the moment sum, so it characterizes the typical reported
 *     value without making any energy claim.
 * This is therefore a description of the reported magnitude *values*, not an
 * energy total and not a "representative event"; it is not a hazard assessment,
 * a forecast, or a statement of feed completeness.
 *
 * Pure, render-free logic (see seismicMagnitudeProfile.test.ts).
 */

export interface MagnitudeQuantiles {
  /** Smallest reported magnitude in the supplied set (M). */
  min: number;
  /** First quartile (25th percentile) of reported magnitude (M). */
  q1: number;
  /** Median (50th percentile) of reported magnitude (M). */
  median: number;
  /** Third quartile (75th percentile) of reported magnitude (M). */
  q3: number;
  /** Largest reported magnitude in the supplied set (M). */
  max: number;
  /** Interquartile range, q3 − q1 (M units); zero when magnitudes do not vary. */
  iqr: number;
}

/**
 * A descriptive aggregation of supplied events' reported magnitudes, not a risk
 * score, diagnosis, causal statement, energy total, or prediction. `quantiles`
 * is null when no supplied event carried a finite magnitude, making an empty
 * basis explicit.
 */
export interface SeismicMagnitudeProfile {
  kind: "usgs-seismic-magnitude-profile";
  isForecast: false;
  suppliedEventCount: number;
  usableEventCount: number;
  quantiles: MagnitudeQuantiles | null;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMICITY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the reported magnitudes of the valid events supplied to this helper; it is not a hazard assessment, a forecast, or a statement of feed completeness.",
  "These are order statistics of the reported magnitude values — a robust description of the catalog's composition. They are deliberately NOT an energy total and NOT a representative event size: because magnitude is logarithmic, the released energy is dominated by the largest event and is aggregated separately by summing seismic moment (see seismicMoment.ts).",
  "Quantiles use linear interpolation between the two nearest order statistics (the R-7 / NumPy-default convention, matching the depth and elevation profiles); an interpolated value blends adjacent reported magnitudes on the reported magnitude scale and does not itself denote a physical event, and interior quantiles from a small sample are uncertain.",
  "Operational catalogs mix magnitude types (mww, mb, ml, …); events are summarized by their reported magnitude value as-is, without homogenizing magnitude type. The rendered USGS overlay feed is also filtered to M4.5+, so the low-magnitude tail of any real distribution is truncated by the feed's threshold rather than resolved here.",
] as const;

/**
 * The p-th quantile (0 ≤ p ≤ 1) of a pre-sorted ascending array by linear
 * interpolation between the closest ranks — the R-7 / NumPy-default method,
 * matching seismicDepthProfile.ts and volcanoElevationProfile.ts so the three
 * profiles read consistently. The caller guarantees a non-empty array.
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
 * Summarize the reported magnitude distribution of the supplied events,
 * retaining source and native unit labels. Events without a finite magnitude
 * are excluded from the quantiles but still counted in suppliedEventCount so the
 * basis of the summary stays auditable. The magnitudes are sorted ascending
 * before computing, so the result is independent of the order the events are
 * supplied in.
 */
export function seismicMagnitudeProfile(
  earthquakes: readonly Earthquake[]
): SeismicMagnitudeProfile {
  const magnitudes = earthquakes
    .map((earthquake) => earthquake.magnitude)
    .filter((magnitude) => Number.isFinite(magnitude))
    .sort((first, second) => first - second);

  let quantiles: MagnitudeQuantiles | null = null;
  if (magnitudes.length > 0) {
    const q1 = quantileSorted(magnitudes, 0.25);
    const q3 = quantileSorted(magnitudes, 0.75);
    quantiles = {
      min: magnitudes[0],
      q1,
      median: quantileSorted(magnitudes, 0.5),
      q3,
      max: magnitudes[magnitudes.length - 1],
      iqr: q3 - q1,
    };
  }

  return {
    kind: "usgs-seismic-magnitude-profile",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount: magnitudes.length,
    quantiles,
    source: SEISMICITY_SOURCE,
    units: SEISMICITY_UNITS,
    limitations: LIMITATIONS,
  };
}
