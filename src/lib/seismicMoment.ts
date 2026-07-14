/**
 * Seismic moment — the physically correct way to combine earthquake magnitudes.
 *
 * Magnitude is a base-10 logarithm of ground motion, so magnitudes must never
 * be averaged or summed directly: the mean of an M4 and an M8 is not an "M6"
 * event, and their combined size is dominated almost entirely by the M8. To
 * aggregate a set of events you convert each magnitude to a scalar seismic
 * moment (a linear energy-proportional quantity in newton-metres), sum the
 * moments, and convert the total back to an equivalent moment magnitude.
 *
 * This module is pure and render-free, mirroring earthquakes.ts. It pairs with
 * {@link ./earthquakes.magnitudeClass} (which labels a single event's size) by
 * answering the complementary question: what single moment magnitude releases
 * the same energy as this whole set of events?
 *
 * Relation (Hanks & Kanamori 1979, in SI units):
 *   Mw = (2/3)·(log10(M0) − 9.1),  with M0 in newton-metres (N·m),
 * equivalently  M0 = 10^(1.5·Mw + 9.1).  The single constant below drives both
 * directions so the round trip magnitude → moment → magnitude is exact.
 *
 * References:
 *   Hanks, T. C. & Kanamori, H. (1979), "A moment magnitude scale",
 *   J. Geophys. Res. 84(B5), 2348–2350.
 *   USGS "Moment Magnitude, Richter Scale, and Moment Tensor Solutions"
 *   (https://www.usgs.gov/programs/earthquake-hazards/moment-magnitude-richter-scale-and-moment-tensor-solutions).
 */

/**
 * The moment-magnitude relation is defined for the moment magnitude scale (Mw).
 * Operational catalogs — including the USGS M4.5+ summary feed this app renders
 * — mix magnitude types (mww, mb, ml, ...) that are only approximately equal to
 * Mw for a given event. Treating every supplied magnitude as an Mw value is the
 * standard approximation for an energy-release estimate, but it is an
 * approximation, so it is surfaced here rather than hidden.
 */
export const SEISMIC_MOMENT_REFERENCE = {
  name: "Moment magnitude relation (Hanks & Kanamori 1979)",
  url: "https://www.usgs.gov/programs/earthquake-hazards/moment-magnitude-richter-scale-and-moment-tensor-solutions",
  /** Mw = (2/3)·(log10(M0[N·m]) − 9.1). */
  relation: "Mw = (2/3)·(log10(M0) − 9.1), M0 in N·m",
  /** Every input magnitude is treated as a moment magnitude (Mw). */
  assumesMomentMagnitude: true,
} as const;

export const SEISMIC_MOMENT_UNITS = {
  magnitude: "Mw (moment magnitude, dimensionless)",
  moment: "N·m (scalar seismic moment)",
} as const;

/**
 * The base-10 log of seismic moment (N·m) at Mw 0. Deriving both the forward
 * and inverse conversion from this one constant keeps them exact inverses.
 */
const LOG10_MOMENT_AT_ZERO = 9.1;
const MOMENT_LOG_SLOPE = 1.5;

/**
 * Scalar seismic moment (N·m) implied by treating a magnitude as a moment
 * magnitude. Non-finite input has no defined moment and returns null so callers
 * never fold NaN into a running total. Negative magnitudes are valid (small
 * events) and map to small positive moments.
 */
export function momentFromMagnitude(magnitude: number): number | null {
  if (!Number.isFinite(magnitude)) return null;
  return 10 ** (MOMENT_LOG_SLOPE * magnitude + LOG10_MOMENT_AT_ZERO);
}

/**
 * Inverse of {@link momentFromMagnitude}: the moment magnitude whose seismic
 * moment equals the supplied value. Only strictly positive, finite moments have
 * a defined magnitude (log10 is undefined at or below zero), so anything else
 * returns null.
 */
export function magnitudeFromMoment(momentNm: number): number | null {
  if (!Number.isFinite(momentNm) || momentNm <= 0) return null;
  return (Math.log10(momentNm) - LOG10_MOMENT_AT_ZERO) / MOMENT_LOG_SLOPE;
}

/**
 * The energy-honest aggregation of a set of magnitudes. `totalMomentNm` is the
 * summed scalar seismic moment; `equivalentMomentMagnitude` is that total
 * expressed as one moment magnitude — the size of a single event releasing the
 * same energy. It is null only when no event contributed (an empty or fully
 * non-finite input), which keeps the empty case explicit rather than reporting
 * a misleading zero-magnitude event.
 *
 * This is a descriptive summary of the supplied events, never a forecast, a
 * hazard rating, or a statement about events outside the input set.
 */
export interface CumulativeSeismicMoment {
  contributingCount: number;
  skippedCount: number;
  totalMomentNm: number;
  equivalentMomentMagnitude: number | null;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  units: typeof SEISMIC_MOMENT_UNITS;
}

/**
 * Combine a set of magnitudes by summing their seismic moments and converting
 * the total back to an equivalent moment magnitude. Non-finite magnitudes are
 * skipped (and counted in `skippedCount`) rather than aborting the sum, so a
 * partially malformed catalog still yields a usable total.
 */
export function cumulativeSeismicMoment(
  magnitudes: readonly number[]
): CumulativeSeismicMoment {
  let totalMomentNm = 0;
  let contributingCount = 0;
  let skippedCount = 0;

  for (const magnitude of magnitudes) {
    const moment = momentFromMagnitude(magnitude);
    if (moment === null) {
      skippedCount += 1;
      continue;
    }
    totalMomentNm += moment;
    contributingCount += 1;
  }

  return {
    contributingCount,
    skippedCount,
    totalMomentNm,
    equivalentMomentMagnitude:
      contributingCount > 0 ? magnitudeFromMoment(totalMomentNm) : null,
    reference: SEISMIC_MOMENT_REFERENCE,
    units: SEISMIC_MOMENT_UNITS,
  };
}
