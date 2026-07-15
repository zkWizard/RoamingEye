import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";
import {
  magnitudeFromMoment,
  momentFromMagnitude,
  SEISMIC_MOMENT_REFERENCE,
  SEISMIC_MOMENT_UNITS,
} from "./seismicMoment";

/**
 * Seismic-moment *release rate* for a supplied set of USGS events — the energy
 * axis normalized by the time axis.
 *
 * {@link ./seismicMoment.cumulativeSeismicMoment} sums a set's scalar seismic
 * moment into one equivalent moment magnitude, and
 * {@link ./seismicMomentConcentration.seismicMomentConcentration} describes how
 * top-heavy that release is. Both take bare magnitudes and are *span-blind*: a
 * set whose events span a single day and one whose events span the whole 30-day
 * feed report the same total if their magnitudes match, even though the first
 * released that energy far faster. This module adds the quantity those omit —
 * the total moment divided by the observation span — which is the standard
 * seismological framing for comparing how *fast* a region is releasing moment
 * (the seismic-moment budget), the temporal analogue of the burstiness that
 * {@link ./seismicIntereventTime} measures.
 *
 * Scalar seismic moment (N·m) and elapsed time are both linear physical
 * quantities, so summing moment and dividing by a span is well defined — unlike
 * averaging magnitudes, which stay logarithmic and are combined only by summing
 * moment. The rate reuses the same {@link ./seismicMoment.momentFromMagnitude}
 * conversion as every other moment helper, so it can never drift from them.
 *
 * The span is measured between the first and last *supplied* event, so the rate
 * is the mean over the period actually spanned by the events, which is at most
 * the feed window. For a set clustered into a few days inside a 30-day feed this
 * reports the rate *during* that active period, not a rate averaged across the
 * whole feed — dividing by the shorter observed span yields the higher, more
 * honest "while it was happening" rate rather than diluting it over quiet days.
 *
 * Pure, render-free logic (see seismicMomentRate.test.ts). It is a descriptive
 * summary of the events supplied to it, never a hazard assessment, a forecast,
 * a recurrence interval, or a statement of feed completeness. Because the raw
 * global M4.5+ feed superimposes many unrelated sequences worldwide, a rate
 * computed over the whole feed is not physically meaningful; the measure is
 * intended for a caller-supplied subset already scoped to one region (e.g. the
 * output of nearbyEarthquakeContext) or time window.
 */

/** Days per Julian year, the conventional averaging period for seismic rates. */
export const DAYS_PER_JULIAN_YEAR = 365.25;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
/** Milliseconds in one Julian year, the denominator for the annualized rate. */
export const MS_PER_JULIAN_YEAR = DAYS_PER_JULIAN_YEAR * MS_PER_DAY;

export const SEISMIC_MOMENT_RATE_UNITS = {
  ...SEISMICITY_UNITS,
  ...SEISMIC_MOMENT_UNITS,
  span: "ms (elapsed time between the first and last supplied event)",
  momentRate: "N·m per Julian year (365.25 days)",
} as const;

const LIMITATIONS = [
  "Describes only the moment release implied by the supplied events; it is not a hazard assessment, a forecast, a recurrence interval, or a statement about events outside the input set.",
  "Every input magnitude is treated as a moment magnitude (Mw); operational catalogs mix magnitude types (mww, mb, ml, …), so the moment conversion is the standard approximation, not an exact per-event moment.",
  "The span is measured between the first and last supplied event, so it is at most the feed window and may be far shorter; the rate is the mean over that observed period, and short spans (few events) give unstable rates.",
  "The rate is meaningful only for a set scoped to one region or time window: the raw global M4.5+ feed superimposes many unrelated sequences, so a rate over the whole feed has no physical meaning.",
] as const;

/**
 * A descriptive reading of how fast a set released seismic moment.
 * `momentRateNmPerYear` and `annualizedEquivalentMagnitude` are null when the
 * span is zero (fewer than two contributing events, or all coincident in time),
 * where a rate is undefined — this keeps that case explicit rather than
 * reporting a misleading infinite or zero rate.
 */
export interface SeismicMomentRate {
  kind: "seismic-moment-rate";
  isForecast: false;
  /** Events with both a finite magnitude and a finite time. */
  contributingCount: number;
  /** Events dropped for a non-finite magnitude or time. */
  skippedCount: number;
  /** Summed scalar seismic moment of the contributing events (N·m). */
  totalMomentNm: number;
  /** Elapsed time between the earliest and latest contributing event (ms). */
  timeSpanMs: number;
  /** The same span expressed in days, for readability. */
  timeSpanDays: number;
  /** Total moment divided by the span, expressed per Julian year (N·m/yr). */
  momentRateNmPerYear: number | null;
  /**
   * The moment magnitude whose seismic moment equals one Julian year's release
   * at this rate — a human-graspable framing of the rate as "an equivalent
   * Mw X.X every year". Null exactly when `momentRateNmPerYear` is null.
   */
  annualizedEquivalentMagnitude: number | null;
  source: typeof SEISMICITY_SOURCE;
  reference: typeof SEISMIC_MOMENT_REFERENCE;
  units: typeof SEISMIC_MOMENT_RATE_UNITS;
  limitations: readonly string[];
}

/**
 * Summarize the seismic-moment release rate of a set of events. Events without
 * both a finite magnitude and a finite time are skipped (and counted in
 * `skippedCount`) rather than aborting, so a partially malformed catalog still
 * yields a usable reading. The supplied order is irrelevant: the span is taken
 * from the extreme times, and moment is summed commutatively.
 */
export function seismicMomentRate(
  earthquakes: readonly Earthquake[]
): SeismicMomentRate {
  let totalMomentNm = 0;
  let contributingCount = 0;
  let skippedCount = 0;
  let minTime = Infinity;
  let maxTime = -Infinity;

  for (const earthquake of earthquakes) {
    const moment = momentFromMagnitude(earthquake.magnitude);
    if (moment === null || !Number.isFinite(earthquake.time)) {
      skippedCount += 1;
      continue;
    }
    totalMomentNm += moment;
    contributingCount += 1;
    if (earthquake.time < minTime) minTime = earthquake.time;
    if (earthquake.time > maxTime) maxTime = earthquake.time;
  }

  const timeSpanMs = contributingCount > 0 ? maxTime - minTime : 0;
  // A rate needs a positive span: a single event, or several at the same
  // instant, spans zero time and has no defined release rate.
  const momentRateNmPerYear =
    timeSpanMs > 0 ? (totalMomentNm / timeSpanMs) * MS_PER_JULIAN_YEAR : null;

  return {
    kind: "seismic-moment-rate",
    isForecast: false,
    contributingCount,
    skippedCount,
    totalMomentNm,
    timeSpanMs,
    timeSpanDays: timeSpanMs / MS_PER_DAY,
    momentRateNmPerYear,
    // One Julian year's release equals `momentRateNmPerYear` N·m, so its
    // equivalent moment magnitude is that value inverted through the same
    // relation — never a round-trip through a magnitude average.
    annualizedEquivalentMagnitude:
      momentRateNmPerYear !== null
        ? magnitudeFromMoment(momentRateNmPerYear)
        : null,
    source: SEISMICITY_SOURCE,
    reference: SEISMIC_MOMENT_REFERENCE,
    units: SEISMIC_MOMENT_RATE_UNITS,
    limitations: LIMITATIONS,
  };
}
