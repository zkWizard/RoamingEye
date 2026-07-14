import {
  SEISMICITY_SOURCE,
  SEISMICITY_UNITS,
  type Earthquake,
} from "./earthquakes";

/**
 * Descriptive inter-event-time (waiting-time) distribution for a supplied set of
 * USGS events — the *temporal* axis of a seismicity sample.
 *
 * seismicDepthProfile.ts summarizes where events sit in depth, and
 * magnitudeFrequency.ts / seismicMoment.ts summarize their size and energy. This
 * module adds the complementary axis those do not touch: how the events are
 * spaced in *time*. It sorts the supplied events by their reported UTC epoch
 * time, takes the gaps between temporally consecutive events, and describes that
 * set of inter-event intervals with order statistics plus two dispersion
 * measures used throughout point-process seismology:
 *
 *   - the coefficient of variation Cv = σ / μ of the intervals, and
 *   - the burstiness parameter B = (Cv − 1) / (Cv + 1) = (σ − μ) / (σ + μ)
 *     (Goh & Barabási 2008), which rescales Cv onto [−1, 1].
 *
 * A homogeneous Poisson process (events arriving independently at a constant
 * average rate) has exponentially distributed inter-event times with Cv = 1 and
 * B = 0. Cv > 1 (B > 0) means the intervals are over-dispersed — the events are
 * more *clustered* in time than random; Cv < 1 (B < 0) means they are
 * under-dispersed — more *regular* than random.
 *
 * This is a description of the temporal spacing of the events *supplied to this
 * helper only*. It is not a foreshock/aftershock determination, a triggering or
 * causal statement, a recurrence interval, or a forecast. In particular the raw
 * global M4.5+ feed superimposes many unrelated sequences worldwide, so a
 * burstiness computed over the whole feed is not physically meaningful; the
 * measure is intended for a caller-supplied subset already scoped to one region
 * (e.g. the output of nearbyEarthquakeContext) or time window.
 *
 * Pure, render-free logic (see seismicIntereventTime.test.ts).
 *
 * Reference:
 *   Goh, K.-I. & Barabási, A.-L. (2008), "Burstiness and memory in complex
 *   systems", Europhys. Lett. 81(4), 48002. doi:10.1209/0295-5075/81/48002.
 */

export const BURSTINESS_REFERENCE = {
  name: "Burstiness parameter (Goh & Barabási 2008)",
  url: "https://doi.org/10.1209/0295-5075/81/48002",
  /** B = (Cv − 1)/(Cv + 1), with Cv = σ/μ the coefficient of variation of intervals. */
  relation: "B = (Cv − 1)/(Cv + 1), Cv = σ/μ of inter-event intervals",
} as const;

export const SEISMIC_INTEREVENT_UNITS = {
  ...SEISMICITY_UNITS,
  interval: "s (seconds between temporally consecutive events, UTC)",
  coefficientOfVariation: "dimensionless (σ/μ)",
  burstiness: "dimensionless, [−1, 1]",
} as const;

/**
 * A temporal-spacing regularity label, derived deterministically from the
 * burstiness B. These are descriptions of the interval dispersion, NOT a claim
 * about the physical process that produced the events:
 *   - "clustered": B above the neutral band — intervals more bursty than Poisson.
 *   - "poisson-like": B within the neutral band around 0 — random-like spacing.
 *   - "quasi-regular": B below the neutral band — intervals more even than Poisson.
 * "undefined" is used when there are too few intervals, or a degenerate zero
 * mean interval (all events share one timestamp), to define Cv / B.
 */
export type IntervalRegularity =
  "clustered" | "poisson-like" | "quasi-regular" | "undefined";

/**
 * Half-width of the neutral "poisson-like" band on B around 0. Cv within roughly
 * [0.82, 1.22] maps into this band. This is a presentation convention for the
 * categorical label, not a statistical test of Poisson-ness; the numeric Cv and
 * B are always reported so a caller can apply its own threshold.
 */
export const POISSON_BURSTINESS_BAND = 0.1;

export interface IntervalStatistics {
  /** Number of inter-event intervals (usableEventCount − 1). */
  count: number;
  /** Shortest interval between temporally consecutive events (s). */
  minSeconds: number;
  /** Median interval (s), R-7 / NumPy-default linear interpolation. */
  medianSeconds: number;
  /** Longest interval between temporally consecutive events (s). */
  maxSeconds: number;
  /** Arithmetic mean interval μ (s). Equivalently the span divided by count. */
  meanSeconds: number;
  /** Population standard deviation σ of the intervals (s). */
  standardDeviationSeconds: number;
  /**
   * Coefficient of variation Cv = σ/μ, or null when it is undefined — fewer than
   * two intervals, or a zero mean interval (all events at one timestamp).
   */
  coefficientOfVariation: number | null;
  /** Burstiness B = (Cv − 1)/(Cv + 1) ∈ [−1, 1], or null when Cv is undefined. */
  burstiness: number | null;
  /** Categorical spacing label derived from B (see {@link IntervalRegularity}). */
  regularity: IntervalRegularity;
}

/**
 * A descriptive aggregation of the supplied events' temporal spacing, not a risk
 * score, triggering/causal statement, recurrence estimate, or prediction.
 * `intervals` is null when fewer than two events carried a finite time, making an
 * empty basis explicit (no pair of events means no interval to describe).
 */
export interface SeismicIntereventTimeDistribution {
  kind: "usgs-seismic-interevent-time-distribution";
  isForecast: false;
  suppliedEventCount: number;
  usableEventCount: number;
  intervals: IntervalStatistics | null;
  source: typeof SEISMICITY_SOURCE;
  units: typeof SEISMIC_INTEREVENT_UNITS;
  reference: typeof BURSTINESS_REFERENCE;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Describes only the temporal spacing of the valid events supplied to this helper; it is not a foreshock/aftershock or triggering determination, a recurrence interval, a hazard assessment, or a forecast.",
  "The global M4.5+ feed superimposes many unrelated sequences worldwide, so a burstiness computed over the whole feed is not physically meaningful; scope the input to one region or time window before interpreting it.",
  "Cv and burstiness from few intervals are unstable, and the categorical regularity label uses a fixed presentation band around Poisson (B=0), not a statistical test; the numeric Cv and B are reported so callers can apply their own threshold.",
  "Intervals are gaps between events ordered by their reported UTC times; the rendered feed is a rolling 30-day window, so the sample is truncated at both ends and any interval longer than the window cannot appear.",
] as const;

const MILLISECONDS_PER_SECOND = 1000;

/**
 * The p-th quantile (0 ≤ p ≤ 1) of a pre-sorted ascending array by linear
 * interpolation between the closest ranks — the R-7 / NumPy-default method,
 * matching seismicDepthProfile.ts. The caller guarantees a non-empty array.
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
 * Map a defined burstiness value to its categorical regularity label using the
 * neutral band around 0. Callers only reach this with a finite B.
 */
function regularityFromBurstiness(burstiness: number): IntervalRegularity {
  if (burstiness > POISSON_BURSTINESS_BAND) return "clustered";
  if (burstiness < -POISSON_BURSTINESS_BAND) return "quasi-regular";
  return "poisson-like";
}

/**
 * Summarize the inter-event-time distribution of the supplied events, retaining
 * source and native unit labels. Events without a finite time are excluded from
 * the intervals but still counted in suppliedEventCount so the basis of the
 * summary stays auditable. The times are sorted ascending before differencing,
 * so the result is independent of the order the events are supplied in.
 */
export function seismicIntereventTimeDistribution(
  earthquakes: readonly Earthquake[]
): SeismicIntereventTimeDistribution {
  const times = earthquakes
    .map((earthquake) => earthquake.time)
    .filter((time) => Number.isFinite(time))
    .sort((first, second) => first - second);

  let intervals: IntervalStatistics | null = null;
  if (times.length >= 2) {
    // Consecutive gaps, converted from epoch milliseconds to seconds. Gaps are
    // non-negative (the times are sorted); duplicate timestamps yield a valid
    // zero interval and are retained.
    const gaps = new Array<number>(times.length - 1);
    for (let index = 1; index < times.length; index += 1) {
      gaps[index - 1] =
        (times[index] - times[index - 1]) / MILLISECONDS_PER_SECOND;
    }

    const count = gaps.length;
    const mean = gaps.reduce((sum, gap) => sum + gap, 0) / count;
    const variance =
      gaps.reduce((sum, gap) => sum + (gap - mean) ** 2, 0) / count;
    const standardDeviation = Math.sqrt(variance);

    // Cv (and hence B) needs at least two intervals and a positive mean; a zero
    // mean means every event shares one timestamp, which has no defined Cv.
    const cvDefined = count >= 2 && mean > 0;
    const coefficientOfVariation = cvDefined ? standardDeviation / mean : null;
    const burstiness =
      coefficientOfVariation === null
        ? null
        : (coefficientOfVariation - 1) / (coefficientOfVariation + 1);

    const sorted = [...gaps].sort((first, second) => first - second);
    intervals = {
      count,
      minSeconds: sorted[0],
      medianSeconds: quantileSorted(sorted, 0.5),
      maxSeconds: sorted[count - 1],
      meanSeconds: mean,
      standardDeviationSeconds: standardDeviation,
      coefficientOfVariation,
      burstiness,
      regularity:
        burstiness === null
          ? "undefined"
          : regularityFromBurstiness(burstiness),
    };
  }

  return {
    kind: "usgs-seismic-interevent-time-distribution",
    isForecast: false,
    suppliedEventCount: earthquakes.length,
    usableEventCount: times.length,
    intervals,
    source: SEISMICITY_SOURCE,
    units: SEISMIC_INTEREVENT_UNITS,
    reference: BURSTINESS_REFERENCE,
    limitations: LIMITATIONS,
  };
}
