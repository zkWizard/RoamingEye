import {
  depthClass,
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type DepthClass,
  type Earthquake,
} from "./earthquakes";
import {
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

/**
 * Moment-weighted hypocentral-depth centroid — the depth at which a supplied
 * set's seismic-energy release is concentrated.
 *
 * Three existing helpers describe neighbouring aspects of a set's depths but
 * not this one. {@link ./seismicDepthProfile.seismicDepthProfile} gives the
 * count-weighted depth quantiles (where the *events* sit), weighting every
 * event equally; {@link ./seismicMomentByDepth.seismicMomentByDepth} splits the
 * summed moment across three coarse shallow/intermediate/deep bins; and
 * {@link ./seismicMoment.cumulativeSeismicMoment} sums the whole set's moment
 * but is depth-blind. None reports a single *continuous* depth weighted by each
 * event's seismic moment.
 *
 * Because magnitude is logarithmic, a set can be numerically dominated by
 * shallow events yet release almost all of its moment from one deep great
 * earthquake, so the count-weighted mean depth and the energy-weighted centroid
 * can differ sharply. This module reports both — the moment-weighted centroid
 * (Σ M0·z / Σ M0), its moment-weighted spread, and the plain count-weighted
 * mean for contrast — so a place panel or export can say where the *energy*, as
 * opposed to the *events*, sits in depth.
 *
 * Both depth (km, linear, positive down) and seismic moment (N·m, linear) are
 * linear physical quantities, so a moment-weighted mean of depth is well
 * defined — unlike averaging magnitudes, which are logarithmic and are combined
 * only by summing moment (see seismicMoment.ts). It reuses the same {@link
 * ./seismicMoment.momentFromMagnitude} conversion and the same {@link
 * ./earthquakes.depthClass} bins the overlay colors events by, so the centroid
 * and its regime can never drift from either primitive.
 *
 * Pure, render-free logic (see seismicMomentDepthCentroid.test.ts). It is a
 * descriptive centre-of-energy statistic for the events supplied to it, not a
 * hazard assessment, a forecast, or a statement of feed completeness.
 */

export const SEISMIC_MOMENT_DEPTH_CENTROID_UNITS = {
  depth: SEISMICITY_UNITS.depth,
  magnitude: SEISMIC_MOMENT_UNITS.magnitude,
  moment: SEISMIC_MOMENT_UNITS.moment,
} as const;

/**
 * A descriptive aggregation of supplied events' moment-weighted depth, not a
 * risk score, diagnosis, causal statement, or prediction. The depth statistics
 * are null when no supplied event contributed (an empty, or fully non-finite,
 * input), keeping the empty basis explicit rather than reporting a misleading
 * zero-depth centroid.
 */
export interface SeismicMomentDepthCentroid {
  kind: "usgs-seismic-moment-depth-centroid";
  isForecast: false;
  suppliedEventCount: number;
  contributingEventCount: number;
  skippedEventCount: number;
  /** Summed scalar seismic moment of the contributing events (N·m). */
  totalMomentNm: number;
  /**
   * Moment-weighted mean hypocentral depth, Σ(M0·z) / Σ M0 (km, positive down).
   * Null when no event contributed.
   */
  centroidDepthKm: number | null;
  /**
   * Moment-weighted population standard deviation of depth about the centroid
   * (km); zero when the contributing depths do not vary. Null when no event
   * contributed.
   */
  spreadKm: number | null;
  /**
   * Count-weighted (equal-weight) mean hypocentral depth of the contributing
   * events (km), reported for contrast with the moment-weighted centroid. Null
   * when no event contributed.
   */
  meanDepthKm: number | null;
  /**
   * centroidDepthKm − meanDepthKm (km): positive when the moment centroid sits
   * *deeper* than the typical event (energy skewed to deeper hypocentres),
   * negative when *shallower*. Null when no event contributed.
   */
  energyDepthBiasKm: number | null;
  /**
   * The conventional depth regime the moment centroid falls in (shallow
   * < 70 km, intermediate 70–300 km, deep > 300 km). Null when no event
   * contributed.
   */
  centroidDepthClass: DepthClass | null;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMIC_MOMENT_DEPTH_CENTROID_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Reports the moment-weighted mean hypocentral depth of the valid events supplied to this helper; it is a descriptive centre-of-energy statistic, not a hazard assessment, a forecast, or a statement of feed completeness.",
  "Every input magnitude is treated as a moment magnitude (see SEISMIC_MOMENT_REFERENCE); operational feeds mix magnitude types, so the moment weights — and therefore the centroid — are approximate.",
  "Seismic moment grows exponentially with magnitude, so the centroid is dominated by the largest few events; a single great earthquake can pull the moment centroid far from the count-weighted mean depth (reported here as meanDepthKm for contrast).",
  "Depth is taken as reported in kilometres positive downward; a poorly-constrained or operator-fixed default depth is retained as-is and shifts the centroid accordingly. The centroid regime uses the conventional shallow (<70 km) / intermediate (70–300 km) / deep (>300 km) bins.",
  "Events lacking a finite magnitude or a finite depth contribute no moment and are counted only in skippedEventCount.",
] as const;

/** The explicit empty result shared by the no-usable-events paths. */
function emptyResult(
  suppliedEventCount: number,
  skippedEventCount: number
): SeismicMomentDepthCentroid {
  return {
    kind: "usgs-seismic-moment-depth-centroid",
    isForecast: false,
    suppliedEventCount,
    contributingEventCount: 0,
    skippedEventCount,
    totalMomentNm: 0,
    centroidDepthKm: null,
    spreadKm: null,
    meanDepthKm: null,
    energyDepthBiasKm: null,
    centroidDepthClass: null,
    reference: SEISMIC_MOMENT_REFERENCE,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_MOMENT_DEPTH_CENTROID_UNITS,
    limitations: LIMITATIONS,
  };
}

/**
 * Compute the moment-weighted hypocentral-depth centroid of the supplied
 * events, retaining source, reference, and native unit labels. An event
 * contributes only when it carries both a finite magnitude (needed for its
 * moment weight) and a finite depth (the quantity being averaged); anything
 * else is skipped and counted in skippedEventCount so the basis of the centroid
 * stays auditable. The order the events are supplied in does not change the
 * result (moment addition commutes, to floating-point tolerance).
 */
export function seismicMomentDepthCentroid(
  earthquakes: readonly Earthquake[]
): SeismicMomentDepthCentroid {
  const contributing: { depthKm: number; moment: number }[] = [];
  let skippedEventCount = 0;
  let totalMomentNm = 0;
  let momentDepthSum = 0; // Σ M0·z
  let depthSum = 0; // Σ z (for the count-weighted mean)

  for (const earthquake of earthquakes) {
    const moment = Number.isFinite(earthquake.depthKm)
      ? momentFromMagnitude(earthquake.magnitude)
      : null;
    if (moment === null) {
      skippedEventCount += 1;
      continue;
    }
    contributing.push({ depthKm: earthquake.depthKm, moment });
    totalMomentNm += moment;
    momentDepthSum += moment * earthquake.depthKm;
    depthSum += earthquake.depthKm;
  }

  const contributingEventCount = contributing.length;
  if (contributingEventCount === 0) {
    return emptyResult(earthquakes.length, skippedEventCount);
  }

  // totalMomentNm > 0 here: every contributing event has a finite magnitude,
  // and momentFromMagnitude maps those to strictly positive moments.
  const centroidDepthKm = momentDepthSum / totalMomentNm;
  const meanDepthKm = depthSum / contributingEventCount;

  // Moment-weighted population variance of depth about the centroid.
  let weightedSquaredDeviation = 0;
  for (const { depthKm, moment } of contributing) {
    const deviation = depthKm - centroidDepthKm;
    weightedSquaredDeviation += moment * deviation * deviation;
  }
  // Guard the tiny negative that floating-point round-off can leave when every
  // depth equals the centroid, so the square root is never NaN.
  const spreadKm = Math.sqrt(
    Math.max(0, weightedSquaredDeviation / totalMomentNm)
  );

  return {
    kind: "usgs-seismic-moment-depth-centroid",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    contributingEventCount,
    skippedEventCount,
    totalMomentNm,
    centroidDepthKm,
    spreadKm,
    meanDepthKm,
    energyDepthBiasKm: centroidDepthKm - meanDepthKm,
    centroidDepthClass: depthClass(centroidDepthKm),
    reference: SEISMIC_MOMENT_REFERENCE,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_MOMENT_DEPTH_CENTROID_UNITS,
    limitations: LIMITATIONS,
  };
}
