import {
  LST_PUBLISHED_RAMP,
  lstRampBoundDirection,
  type LstBoundDirection,
} from "./lstRampCensoring";
import type { LayerId } from "./timeline";

/**
 * How NASA's published land-surface-temperature colormap bounds the *extremes*
 * of a probed series.
 *
 * The probe's status line reports `min … mean … max` over the sampled months.
 * For most layers those three numbers are two-sided estimates. For land surface
 * temperature they are not: `MODIS_Land_Surface_Temp` is rendered on a closed
 * 200.0–350.0 K legend closed at both ends by an open catch-all — one colour
 * for every surface below 200.0 K, one for every surface at or above 350.0 K —
 * and, unlike the MERRA-2 air-temperature caps that are rejected outright, both
 * LST cap colours sit 3–4 RGB units from their adjacent finite bins. A capped
 * pixel therefore decodes into the terminal bin beside it and is reported as an
 * ordinary number (see lstRampCensoring, which classifies a single value, and
 * lstPlaceInsight, which applies it to the place panel's card).
 *
 * A series makes that worse in a specific way, and it is the same way the
 * marine ramp does (see probeSstExtremeCensoring): the censored months are, by
 * construction, exactly the ones that set the extremes. The coldest month of a
 * high-polar or high-altitude record and the hottest month of a low-latitude
 * desert record are precisely where the ramp stops resolving, so `min` and
 * `max` are the two statistics most likely to be printed as point values when
 * they are only one-sided bounds — an East Antarctic plateau winter that truly
 * ran to 190 K is charted, and summarized, as ≈ 200.3 K ground.
 *
 * The mean inherits the same one-sided error: a censored cold month always
 * decodes warmer than it truly was, so a mean containing one can only overstate
 * the true mean. When both caps are hit the two errors push in opposite
 * directions and the mean is left unbounded rather than silently reported.
 *
 * This module recovers nothing — the information is gone from the imagery. It
 * names which of the reported statistics are bounds and in which direction. It
 * is a statement about the rendered colour ramp only. In particular a bounded
 * LST extreme is still a radiometric skin temperature of a clear-sky daytime
 * overpass, so no 2 m air-temperature, heat-hazard, health, ecosystem, causal,
 * or forecast claim follows from one.
 */

/**
 * Bound on the mean. "indeterminate" means both caps were hit, so the two
 * biases oppose and no direction can be claimed — which is NOT the same as an
 * unbiased mean and must never be rendered as one.
 */
export type LstMeanBound = "upper" | "lower" | "indeterminate" | null;

export interface ProbeLstExtremeCensoring {
  kind: "probe-land-surface-temperature-extreme-censoring";
  /** A colour-ramp statement about skin temperature, never about the air. */
  airTemperatureObservation: false;
  isForecast: false;
  /** False for every layer but LST, and for a series with no usable value. */
  applicable: boolean;
  /** "upper" when the coldest month sits in the ramp's open low cap. */
  minBound: LstBoundDirection;
  /** "lower" when the hottest month sits in the ramp's open high cap. */
  maxBound: LstBoundDirection;
  meanBound: LstMeanBound;
  /** Sampled months decoded into the ramp's lowest bin. */
  floorMonthCount: number;
  /** Sampled months decoded into the ramp's highest bin. */
  ceilingMonthCount: number;
  /** Months carrying a usable value — the denominator for the counts above. */
  observedMonthCount: number;
  /** The published ramp every judgement here is made against. */
  ramp: typeof LST_PUBLISHED_RAMP;
}

export const PROBE_LST_EXTREME_CENSORING_LIMITATIONS = [
  "The published LST colormap's terminal bins are open, so a month decoded into one is a one-sided bound rather than a measurement.",
  "Censored months are the ones that set the extremes, so the series minimum and maximum are the statistics most affected.",
  "A mean containing a censored month is biased in that month's direction; when both caps are hit the biases oppose and no bound is stated.",
  "Nothing here estimates the value behind a cap, and no air-temperature, heat-hazard, health, ecosystem, causal, or forecast claim follows from a censored reading.",
] as const;

/**
 * Judge a probed series against the published LST ramp's open end caps.
 *
 * `values` are the series in the layer's own reported unit — native kelvin for
 * LST, the same physical numbers the status line formats — with null for months
 * that returned nothing. Non-LST layers return an inapplicable summary: no
 * other layer in the app is decoded through this ramp, and the marine and
 * aerosol ramps have their own screens.
 */
export function probeLstExtremeCensoring(
  layerId: LayerId | undefined,
  values: readonly (number | null)[]
): ProbeLstExtremeCensoring {
  const base = {
    kind: "probe-land-surface-temperature-extreme-censoring",
    airTemperatureObservation: false,
    isForecast: false,
    ramp: LST_PUBLISHED_RAMP,
  } as const;
  const inapplicable: ProbeLstExtremeCensoring = {
    ...base,
    applicable: false,
    minBound: null,
    maxBound: null,
    meanBound: null,
    floorMonthCount: 0,
    ceilingMonthCount: 0,
    observedMonthCount: 0,
  };
  if (layerId !== "lst") return inapplicable;

  const observed = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (observed.length === 0) return inapplicable;

  let floorMonthCount = 0;
  let ceilingMonthCount = 0;
  let lowest = observed[0];
  let highest = observed[0];
  for (const value of observed) {
    const direction = lstRampBoundDirection(value);
    if (direction === "upper") floorMonthCount += 1;
    if (direction === "lower") ceilingMonthCount += 1;
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
  }

  return {
    ...base,
    applicable: true,
    // Classify the extremes themselves rather than inferring them from the
    // counts: a record that sat in the ceiling bin every month has its MINIMUM
    // censored too, and the prefix the status line renders must say so.
    minBound: lstRampBoundDirection(lowest),
    maxBound: lstRampBoundDirection(highest),
    meanBound: meanBoundFor(floorMonthCount, ceilingMonthCount),
    floorMonthCount,
    ceilingMonthCount,
    observedMonthCount: observed.length,
  };
}

/**
 * "≤ " / "≥ " / "" — the inequality the status line renders before one
 * statistic. Empty for every uncensored statistic, so an ordinary land record
 * reads exactly as it did before.
 */
export function lstExtremeBoundPrefix(
  censoring: ProbeLstExtremeCensoring,
  statistic: "min" | "mean" | "max"
): string {
  const bound =
    statistic === "min"
      ? censoring.minBound
      : statistic === "max"
        ? censoring.maxBound
        : censoring.meanBound;
  if (bound === "upper") return "≤ ";
  if (bound === "lower") return "≥ ";
  return "";
}

/**
 * One status-line clause naming which statistics are bounds and why, or null
 * when no sampled month reached a cap — an ordinary mid-latitude record then
 * reads exactly as it did before.
 *
 * The named statistics are read back off the computed bounds rather than the
 * cap counts, so the sentence and the inequalities beside the numbers can never
 * disagree.
 */
export function lstExtremeCensoringClause(
  censoring: ProbeLstExtremeCensoring
): string | null {
  if (!censoring.applicable) return null;
  const { floorMonthCount, ceilingMonthCount, observedMonthCount, ramp } =
    censoring;
  const capped = floorMonthCount + ceilingMonthCount;
  if (capped === 0) return null;

  // The subject of the sentence is the capped count, so it governs the verb;
  // the noun it qualifies is pluralized by the denominator instead.
  const tally = `${capped} of ${observedMonthCount} sampled ${
    observedMonthCount === 1 ? "month" : "months"
  } ${capped === 1 ? "lands" : "land"}`;
  const source = `source ${ramp.colormapDoc} colormap`;
  const floorCap = `every land surface below ${ramp.floorBin.lo.toFixed(1)} ${ramp.unit} shares one colour`;
  const ceilingCap = `every surface at or above ${ramp.ceilingBin.hi.toFixed(1)} ${ramp.unit} shares one colour`;

  if (floorMonthCount > 0 && ceilingMonthCount > 0) {
    return `${tally} in the LST colormap's open end caps (${floorCap}; ${ceilingCap}), so min is an upper bound, max a lower bound, and the mean is bounded in neither direction (${source})`;
  }
  if (floorMonthCount > 0) {
    return `${tally} in the LST colormap's open low cap (${floorCap}), so ${boundedStatistics(censoring, "upper")} on a possibly colder surface (${source})`;
  }
  return `${tally} in the LST colormap's open high cap (${ceilingCap}), so ${boundedStatistics(censoring, "lower")} on a possibly hotter surface (${source})`;
}

/**
 * "min and mean are upper bounds" — the subject and verb for the statistics
 * actually carrying `direction`, so the clause lists exactly the numbers the
 * status line marked and no others.
 */
function boundedStatistics(
  censoring: ProbeLstExtremeCensoring,
  direction: "upper" | "lower"
): string {
  const named = (
    [
      ["min", censoring.minBound],
      ["mean", censoring.meanBound],
      ["max", censoring.maxBound],
    ] as const
  )
    .filter(([, bound]) => bound === direction)
    .map(([name]) => name);
  const subject =
    named.length > 1
      ? `${named.slice(0, -1).join(", ")} and ${named[named.length - 1]}`
      : named[0];
  return named.length > 1
    ? `${subject} are ${direction} bounds`
    : `${subject} is ${direction === "upper" ? "an" : "a"} ${direction} bound`;
}

function meanBoundFor(
  floorMonthCount: number,
  ceilingMonthCount: number
): LstMeanBound {
  if (floorMonthCount > 0 && ceilingMonthCount > 0) return "indeterminate";
  if (floorMonthCount > 0) return "upper";
  if (ceilingMonthCount > 0) return "lower";
  return null;
}
