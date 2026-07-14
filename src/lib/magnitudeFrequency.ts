import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";

/**
 * Descriptive frequency–magnitude distribution (FMD) of a supplied event set.
 *
 * summarizeEarthquakes (see earthquakes.ts) already reports incremental counts
 * in the fixed, integer-boundary USGS magnitude classes (micro…great). This
 * module adds the two complementary things those named bins do not give:
 *   1. a configurable, uniform magnitude bin width, and
 *   2. the *cumulative* count N(≥M) — the number of events at or above each
 *      bin's lower edge — which is the canonical seismological FMD "staircase".
 *
 * Magnitude is a base-10 logarithm of ground motion, so magnitudes are never
 * averaged or summed (energy aggregation is handled separately by summing
 * seismic moment; see seismicMoment.ts). Counting how many events fall in, or
 * above, a magnitude bin is well defined and is exactly what the FMD tallies.
 *
 * Deliberately NOT provided here: any fit of the Gutenberg–Richter relation
 * (a- or b-value), a completeness-magnitude estimate, a recurrence interval, or
 * an extrapolation to larger events. Those are inferential/forecasting products
 * this descriptive tally does not support. The rendered overlay feed is also
 * filtered to M4.5+, so the low-magnitude limb of any real FMD is truncated by
 * the feed's completeness threshold, not resolved by this helper.
 *
 * Pure, render-free logic (see magnitudeFrequency.test.ts).
 */

export const MAGNITUDE_FREQUENCY_UNITS = {
  ...SEISMICITY_UNITS,
  binWidth: "M (magnitude units)",
  count: "events",
} as const;

/** Default bin width: half a magnitude unit, a common FMD binning choice. */
export const DEFAULT_MAGNITUDE_BIN_WIDTH = 0.5;

export interface MagnitudeFrequencyOptions {
  /**
   * Uniform bin width in magnitude units. Must be finite and strictly
   * positive; anything else yields no bins. Defaults to
   * {@link DEFAULT_MAGNITUDE_BIN_WIDTH}.
   */
  binWidthMagnitude?: number;
}

export interface MagnitudeBin {
  /** Inclusive lower edge of this bin (M). Bins are anchored at multiples of the width. */
  lowerEdge: number;
  /** Exclusive upper edge (lowerEdge + binWidthMagnitude), in M. */
  upperEdge: number;
  /** Events whose magnitude falls in [lowerEdge, upperEdge). */
  incrementalCount: number;
  /** Events whose magnitude is ≥ lowerEdge — the cumulative FMD count N(≥M). */
  cumulativeCount: number;
}

/**
 * A descriptive aggregation of supplied events' reported magnitudes, not a risk
 * score, diagnosis, causal statement, recurrence estimate, or prediction. Bins
 * span contiguously from the lowest to the highest occupied bin, so interior
 * empty bins are present with zero counts and the staircase reads without gaps.
 * `bins` is empty when no supplied event carried a finite magnitude or the bin
 * width was not usable, making an empty basis explicit.
 */
export interface MagnitudeFrequencyDistribution {
  kind: "usgs-magnitude-frequency-distribution";
  isForecast: false;
  suppliedEventCount: number;
  usableEventCount: number;
  binWidthMagnitude: number;
  bins: MagnitudeBin[];
  source: typeof SEISMICITY_SOURCE;
  units: typeof MAGNITUDE_FREQUENCY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the reported magnitudes of the valid events supplied to this helper; it is not a hazard assessment, a forecast, or a statement of feed completeness.",
  "This is a raw event tally, not a Gutenberg–Richter fit: it estimates no a-value, b-value, magnitude of completeness, or recurrence interval, and does not extrapolate beyond the observed events.",
  "The rendered USGS overlay feed is filtered to M4.5+, so the low-magnitude limb of the distribution is truncated by the feed's threshold rather than resolved here.",
  "Operational catalogs mix magnitude types (mww, mb, ml, …); events are binned by their reported magnitude value as-is, without homogenizing magnitude type.",
] as const;

/**
 * Round bin edges to 6 decimal places to absorb floating-point noise from the
 * width arithmetic (e.g. 46 * 0.1), so edges compare and serialize cleanly.
 */
const EDGE_PRECISION = 1e6;
const snap = (value: number): number =>
  Math.round(value * EDGE_PRECISION) / EDGE_PRECISION;

/**
 * The bin index of a magnitude under the given width, anchored at 0 so bins are
 * multiples of the width. Snapping magnitude/width before flooring keeps an
 * event that sits exactly on an edge (e.g. 4.6 with width 0.1) in the bin it
 * belongs to rather than one below it.
 */
const binIndex = (magnitude: number, width: number): number =>
  Math.floor(snap(magnitude / width));

/**
 * Tally the frequency–magnitude distribution of the supplied events, retaining
 * source and native unit labels. Events without a finite magnitude are excluded
 * from the bins but still counted in suppliedEventCount so the basis of the
 * summary stays auditable. Both the per-bin incremental count and the
 * cumulative N(≥M) count are reported for every bin.
 */
export function magnitudeFrequencyDistribution(
  earthquakes: readonly Earthquake[],
  options: MagnitudeFrequencyOptions = {}
): MagnitudeFrequencyDistribution {
  const binWidthMagnitude =
    options.binWidthMagnitude ?? DEFAULT_MAGNITUDE_BIN_WIDTH;
  const magnitudes = earthquakes
    .map((earthquake) => earthquake.magnitude)
    .filter((magnitude) => Number.isFinite(magnitude));

  const widthUsable =
    Number.isFinite(binWidthMagnitude) && binWidthMagnitude > 0;

  let bins: MagnitudeBin[] = [];
  if (widthUsable && magnitudes.length > 0) {
    const indices = magnitudes.map((m) => binIndex(m, binWidthMagnitude));
    const minIndex = Math.min(...indices);
    const maxIndex = Math.max(...indices);

    // Contiguous incremental tally from the lowest to the highest occupied bin.
    const incremental = new Array<number>(maxIndex - minIndex + 1).fill(0);
    for (const index of indices) incremental[index - minIndex] += 1;

    // Cumulative N(≥M): suffix sum over bins, so each bin counts itself and all
    // higher-magnitude bins.
    bins = new Array<MagnitudeBin>(incremental.length);
    let cumulative = 0;
    for (let offset = incremental.length - 1; offset >= 0; offset -= 1) {
      cumulative += incremental[offset];
      const lowerEdge = snap((minIndex + offset) * binWidthMagnitude);
      bins[offset] = {
        lowerEdge,
        upperEdge: snap(lowerEdge + binWidthMagnitude),
        incrementalCount: incremental[offset],
        cumulativeCount: cumulative,
      };
    }
  }

  return {
    kind: "usgs-magnitude-frequency-distribution",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount: magnitudes.length,
    binWidthMagnitude,
    bins,
    source: SEISMICITY_SOURCE,
    units: MAGNITUDE_FREQUENCY_UNITS,
    limitations: LIMITATIONS,
  };
}
