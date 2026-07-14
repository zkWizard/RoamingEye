import {
  depthClass,
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type DepthClass,
  type Earthquake,
} from "./earthquakes";
import {
  magnitudeFromMoment,
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

/**
 * Partition a set's cumulative seismic moment across hypocentral depth regimes.
 *
 * Two existing helpers answer neighbouring questions but not this one.
 * {@link ./seismicMoment.cumulativeSeismicMoment} sums the whole set's moment
 * into one equivalent magnitude but is depth-blind; {@link
 * ./seismicDepthProfile.seismicDepthProfile} describes the depth distribution
 * but weights every event equally by *count*. Neither reveals where the energy
 * came from. Because magnitude is logarithmic, a set can be numerically
 * dominated by shallow events yet have almost all of its moment released by a
 * single deep great earthquake — the count-weighted and energy-weighted views
 * of the same catalog can point at different depth regimes.
 *
 * This module answers: of the total seismic moment released by the supplied
 * events, what share came from shallow (<70 km), intermediate (70–300 km), and
 * deep (>300 km) hypocentres? It reuses the same {@link
 * ./seismicMoment.momentFromMagnitude} conversion (so magnitudes are combined
 * by summing moment, never by averaging) and the same {@link
 * ./earthquakes.depthClass} bins the overlay colors events by, so the split can
 * never drift from either primitive.
 *
 * Pure, render-free logic (see seismicMomentByDepth.test.ts). It is a
 * descriptive partition of the events supplied to it, not a hazard assessment,
 * a forecast, or a statement of feed completeness.
 */

export const SEISMIC_MOMENT_BY_DEPTH_UNITS = {
  depth: SEISMICITY_UNITS.depth,
  magnitude: SEISMIC_MOMENT_UNITS.magnitude,
  moment: SEISMIC_MOMENT_UNITS.moment,
} as const;

/**
 * Depth classes ordered shallowest to deepest for deterministic iteration and
 * tie-breaking (mirrors MAGNITUDE_CLASS_ORDER in earthquakes.ts).
 */
export const DEPTH_CLASS_ORDER: readonly DepthClass[] = [
  "shallow",
  "intermediate",
  "deep",
] as const;

/** One depth regime's contribution to the set's cumulative seismic moment. */
export interface DepthClassMomentShare {
  depthClass: DepthClass;
  /** Contributing events (finite magnitude and finite depth) in this regime. */
  eventCount: number;
  /** Summed scalar seismic moment of this regime's events (N·m). */
  totalMomentNm: number;
  /**
   * This regime's share of the set's total seismic moment, in [0, 1]. Zero when
   * the regime contributed no events (and when the whole set is empty).
   */
  momentFraction: number;
  /**
   * This regime's summed moment expressed as one equivalent moment magnitude —
   * the size of a single event releasing the same energy. Null when the regime
   * contributed no events, keeping the empty case explicit rather than reporting
   * a misleading zero-magnitude event.
   */
  equivalentMomentMagnitude: number | null;
}

/**
 * A descriptive aggregation of supplied events' moment by depth regime, not a
 * risk score, diagnosis, causal statement, or prediction. Every depth class is
 * always present in `shares` (absent regimes read as a zeroed share) so callers
 * can index the record total-safely.
 */
export interface SeismicMomentByDepth {
  kind: "usgs-seismic-moment-by-depth";
  isForecast: false;
  suppliedEventCount: number;
  contributingEventCount: number;
  skippedEventCount: number;
  totalMomentNm: number;
  shares: Record<DepthClass, DepthClassMomentShare>;
  /**
   * The depth regime releasing the greatest share of moment; null when no event
   * contributed. Exact ties resolve to the shallower regime (DEPTH_CLASS_ORDER)
   * for determinism.
   */
  dominantByMoment: DepthClass | null;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMIC_MOMENT_BY_DEPTH_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Partitions the summed seismic moment of the valid events supplied to this helper by hypocentral depth class; it is a descriptive split, not a hazard assessment, a forecast, or a statement of feed completeness.",
  "Every input magnitude is treated as a moment magnitude (see SEISMIC_MOMENT_REFERENCE); operational feeds mix magnitude types, so each regime's moment total and equivalent magnitude are approximate.",
  "Depth classes use the conventional shallow (<70 km) / intermediate (70–300 km) / deep (>300 km) bins; a poorly-constrained or operator-fixed default depth is retained as reported and can place an event in the wrong regime.",
  "Events lacking a finite magnitude or a finite depth contribute no moment and are counted only in skippedEventCount.",
] as const;

/** A zeroed share for every depth class, so absent regimes read as empty. */
function emptyShares(): Record<DepthClass, DepthClassMomentShare> {
  return {
    shallow: emptyShare("shallow"),
    intermediate: emptyShare("intermediate"),
    deep: emptyShare("deep"),
  };
}

function emptyShare(cls: DepthClass): DepthClassMomentShare {
  return {
    depthClass: cls,
    eventCount: 0,
    totalMomentNm: 0,
    momentFraction: 0,
    equivalentMomentMagnitude: null,
  };
}

/**
 * Split the supplied events' cumulative seismic moment across the shallow /
 * intermediate / deep depth regimes, retaining source, reference, and native
 * unit labels. An event contributes only when it carries both a finite
 * magnitude (needed for its moment) and a finite depth (needed for its regime);
 * anything else is skipped and counted in skippedEventCount so the basis of the
 * partition stays auditable.
 */
export function seismicMomentByDepth(
  earthquakes: readonly Earthquake[]
): SeismicMomentByDepth {
  const shares = emptyShares();
  let totalMomentNm = 0;
  let contributingEventCount = 0;
  let skippedEventCount = 0;

  for (const earthquake of earthquakes) {
    const moment = Number.isFinite(earthquake.depthKm)
      ? momentFromMagnitude(earthquake.magnitude)
      : null;
    if (moment === null) {
      skippedEventCount += 1;
      continue;
    }
    const share = shares[depthClass(earthquake.depthKm)];
    share.eventCount += 1;
    share.totalMomentNm += moment;
    totalMomentNm += moment;
    contributingEventCount += 1;
  }

  for (const cls of DEPTH_CLASS_ORDER) {
    const share = shares[cls];
    // totalMomentNm > 0 whenever any event contributed (finite magnitudes map
    // to strictly positive moments), so this divide is guarded by eventCount.
    share.momentFraction =
      share.eventCount > 0 ? share.totalMomentNm / totalMomentNm : 0;
    share.equivalentMomentMagnitude =
      share.eventCount > 0 ? magnitudeFromMoment(share.totalMomentNm) : null;
  }

  return {
    kind: "usgs-seismic-moment-by-depth",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    contributingEventCount,
    skippedEventCount,
    totalMomentNm,
    shares,
    dominantByMoment:
      contributingEventCount > 0 ? dominantRegime(shares) : null,
    reference: SEISMIC_MOMENT_REFERENCE,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_MOMENT_BY_DEPTH_UNITS,
    limitations: LIMITATIONS,
  };
}

/**
 * The depth class holding the greatest summed moment. Iterating in
 * DEPTH_CLASS_ORDER with a strict `>` keeps the first (shallower) regime on an
 * exact tie, so the result is deterministic regardless of input order.
 */
function dominantRegime(
  shares: Record<DepthClass, DepthClassMomentShare>
): DepthClass {
  let dominant: DepthClass = DEPTH_CLASS_ORDER[0];
  for (const cls of DEPTH_CLASS_ORDER) {
    if (shares[cls].totalMomentNm > shares[dominant].totalMomentNm) {
      dominant = cls;
    }
  }
  return dominant;
}
