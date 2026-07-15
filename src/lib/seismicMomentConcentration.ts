import {
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

/**
 * Concentration of seismic-moment release across a set of events.
 *
 * cumulativeSeismicMoment (see seismicMoment.ts) answers "how much moment did
 * this whole set release?"; magnitudeFrequency (see magnitudeFrequency.ts)
 * answers "how many events fall in each magnitude bin?". Neither answers the
 * complementary shape question this module addresses: is the released moment
 * dominated by one or two large events, or spread across many? Because moment
 * grows by ~10^1.5 per magnitude unit, the cumulative moment of almost any
 * catalog is carried by its handful of largest events — quantifying that
 * dominance is a standard descriptive framing of a seismicity set.
 *
 * The concentration is expressed two honest ways: the fraction of total moment
 * in the single largest event, and the minimum number of the largest events
 * whose summed moment reaches a given cumulative share of the total (e.g. how
 * few events account for 90% of the release). Both are order-free, deterministic
 * readings of the supplied magnitudes.
 *
 * This is a descriptive summary of the events supplied, never a hazard rating,
 * a forecast, or a statement about events outside the input set. It inherits the
 * moment-magnitude approximation of seismicMoment.ts: operational catalogs mix
 * magnitude types (mww, mb, ml, …) that are only approximately Mw, and every
 * input magnitude is treated as an Mw value for the moment conversion.
 *
 * Pure, render-free logic (see seismicMomentConcentration.test.ts).
 */

export const SEISMIC_MOMENT_CONCENTRATION_UNITS = {
  ...SEISMIC_MOMENT_UNITS,
  fraction: "dimensionless share of total moment in [0, 1]",
  count: "events",
} as const;

/** Default share used for the headline "few events dominate" statistic. */
export const DEFAULT_MOMENT_SHARE = 0.9;

const LIMITATIONS = [
  "Describes only the moment release implied by the supplied magnitudes; it is not a hazard assessment, a forecast, or a statement about events outside the input set.",
  "Every input magnitude is treated as a moment magnitude (Mw); operational catalogs mix magnitude types (mww, mb, ml, …), so the moment conversion is the standard approximation, not an exact per-event moment.",
  "Concentration reflects the events actually supplied: the rendered USGS overlay feed is filtered to M4.5+, so smaller events that would dilute the share are absent by the feed's threshold, not by this helper.",
] as const;

/**
 * A descriptive reading of how concentrated a set's moment release is.
 * `largestMagnitude`, `largestEventMomentFraction`, and
 * `eventsForShare` are all null when no supplied event carried a finite
 * magnitude, which keeps the empty basis explicit rather than reporting a
 * misleading zero.
 */
export interface SeismicMomentConcentration {
  kind: "seismic-moment-concentration";
  isForecast: false;
  contributingCount: number;
  skippedCount: number;
  totalMomentNm: number;
  /** Largest reported magnitude among the contributing events. */
  largestMagnitude: number | null;
  /** Share [0, 1] of total moment contributed by the single largest event. */
  largestEventMomentFraction: number | null;
  /** The cumulative share the `eventsForShare` count is measured against. */
  share: number;
  /**
   * Minimum number of the largest events whose summed moment reaches at least
   * `share` of the total (a smaller count means a more top-heavy release).
   */
  eventsForShare: number | null;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  units: typeof SEISMIC_MOMENT_CONCENTRATION_UNITS;
  limitations: readonly string[];
}

/**
 * Relative tolerance for the cumulative-share comparison, so an event that
 * reaches a threshold exactly (e.g. share 1.0, where the running sum should
 * equal the total) is not pushed to the next count by floating-point noise.
 */
const SHARE_EPSILON = 1e-9;

/**
 * Descending-sorted scalar seismic moments (N·m) of the finite-magnitude events,
 * paired with the count of skipped (non-finite) magnitudes. Sorting descending
 * lets both concentration statistics scan from the largest event outward.
 */
function sortedMoments(magnitudes: readonly number[]): {
  moments: number[];
  skippedCount: number;
} {
  const moments: number[] = [];
  let skippedCount = 0;
  for (const magnitude of magnitudes) {
    const moment = momentFromMagnitude(magnitude);
    if (moment === null) {
      skippedCount += 1;
      continue;
    }
    moments.push(moment);
  }
  moments.sort((a, b) => b - a);
  return { moments, skippedCount };
}

/**
 * Minimum number of the largest events whose summed seismic moment reaches at
 * least `share` of the total moment. Returns null when there is no usable event
 * or `share` is not a finite value in (0, 1]. `share` at or below 0 has no
 * meaningful smallest-count answer (zero events already exceed a zero share), so
 * it is rejected rather than answered with 0.
 */
export function minEventsForMomentShare(
  magnitudes: readonly number[],
  share: number
): number | null {
  if (!Number.isFinite(share) || share <= 0 || share > 1) return null;
  const { moments } = sortedMoments(magnitudes);
  if (moments.length === 0) return null;

  const total = moments.reduce((sum, moment) => sum + moment, 0);
  const target = share * total;
  let cumulative = 0;
  for (let index = 0; index < moments.length; index += 1) {
    cumulative += moments[index];
    if (cumulative >= target - SHARE_EPSILON * total) return index + 1;
  }
  // Reached only via floating-point undershoot at share ≈ 1; every event is
  // needed, so the count is the full set.
  return moments.length;
}

/**
 * Summarize how concentrated the moment release of a set of magnitudes is.
 * Non-finite magnitudes are skipped (and counted in `skippedCount`) rather than
 * aborting, so a partially malformed catalog still yields a usable reading.
 *
 * `shareForCount` sets the cumulative share the `eventsForShare` count is
 * measured against; it defaults to {@link DEFAULT_MOMENT_SHARE} and, when not a
 * finite value in (0, 1], leaves `eventsForShare` null while the rest of the
 * summary is still reported.
 */
export function seismicMomentConcentration(
  magnitudes: readonly number[],
  shareForCount: number = DEFAULT_MOMENT_SHARE
): SeismicMomentConcentration {
  const { moments, skippedCount } = sortedMoments(magnitudes);
  const contributingCount = moments.length;
  const totalMomentNm = moments.reduce((sum, moment) => sum + moment, 0);

  const largestMoment = contributingCount > 0 ? moments[0] : null;
  const largestEventMomentFraction =
    largestMoment !== null && totalMomentNm > 0
      ? largestMoment / totalMomentNm
      : null;

  // Report the largest magnitude straight from the input rather than inverting
  // the largest moment, so the value is exact and free of round-trip float drift.
  const largestMagnitude =
    contributingCount > 0
      ? Math.max(...magnitudes.filter(Number.isFinite))
      : null;

  return {
    kind: "seismic-moment-concentration",
    isForecast: false,
    contributingCount,
    skippedCount,
    totalMomentNm,
    largestMagnitude,
    largestEventMomentFraction,
    share: shareForCount,
    eventsForShare: minEventsForMomentShare(magnitudes, shareForCount),
    reference: SEISMIC_MOMENT_REFERENCE,
    units: SEISMIC_MOMENT_CONCENTRATION_UNITS,
    limitations: LIMITATIONS,
  };
}
