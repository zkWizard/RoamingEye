import {
  SST_PUBLISHED_RAMP,
  summarizeSstRampCensoring,
  type SstRampCensoringSummary,
} from "./sstRampCensoring";
import type { LayerId } from "./timeline";

/**
 * How NASA's published SST colormap bounds the *extremes* of a probed series.
 *
 * The probe's status line reports `min … mean … max` over the sampled months.
 * For every other layer those three numbers are two-sided estimates. For sea
 * surface temperature they are not: `MODIS_Sea_Surface_Temperature` ends in two
 * OPEN caps — one colour for every SST below 0.00 °C, one for every SST at or
 * above 32.00 °C — so a month whose value lands in a terminal bin is a bound,
 * not a measurement (see sstRampCensoring, which classifies a single value).
 *
 * A series makes that worse in a specific way: the censored months are, by
 * construction, exactly the ones that set the extremes. The coldest month of a
 * polar record and the warmest month of a warm-pool record are precisely where
 * the ramp stops resolving, so `min` and `max` are the two statistics most
 * likely to be reported as point values when they are only one-sided bounds —
 * a sub-polar winter that truly ran to −1.5 °C is charted, and summarized, as
 * ≈ 0.1 °C water.
 *
 * The mean inherits the same one-sided error: a censored cold month always
 * decodes warmer than it truly was, so a mean containing one can only overstate
 * the true mean. When both caps are hit the two errors push in opposite
 * directions and the mean is left unbounded rather than silently reported.
 *
 * This module recovers nothing — the information is gone from the imagery. It
 * names which of the reported statistics are bounds and in which direction. It
 * is a statement about the rendered colour ramp only: no sea-ice, habitat,
 * marine-biology, ecosystem, causal, hazard, or forecast claim follows from it.
 */

/** Which way a censored statistic can be wrong; null when it is not censored. */
export type SstStatisticBound = "upper" | "lower" | null;

/**
 * Bound on the mean. "indeterminate" means both caps were hit, so the two
 * biases oppose and no direction can be claimed — which is NOT the same as an
 * unbiased mean and must never be rendered as one.
 */
export type SstMeanBound = "upper" | "lower" | "indeterminate" | null;

export interface ProbeSstExtremeCensoring {
  kind: "probe-sea-surface-temperature-extreme-censoring";
  /** A colour-ramp statement, never a biological one. */
  marineBiologyObservation: false;
  isForecast: false;
  /** False for every layer but SST, and for a series with no usable value. */
  applicable: boolean;
  /** Censoring of the series minimum; null when there is nothing to judge. */
  min: SstRampCensoringSummary | null;
  /** Censoring of the series maximum; null when there is nothing to judge. */
  max: SstRampCensoringSummary | null;
  /** "upper" when the coldest month sits in the ramp's open low cap. */
  minBound: SstStatisticBound;
  /** "lower" when the warmest month sits in the ramp's open high cap. */
  maxBound: SstStatisticBound;
  meanBound: SstMeanBound;
  /** Sampled months decoded into the ramp's lowest bin. */
  floorMonthCount: number;
  /** Sampled months decoded into the ramp's highest bin. */
  ceilingMonthCount: number;
  /** Months carrying a usable value — the denominator for the counts above. */
  observedMonthCount: number;
  /** The published ramp every judgement here is made against. */
  ramp: typeof SST_PUBLISHED_RAMP;
}

export const PROBE_SST_EXTREME_CENSORING_LIMITATIONS = [
  "The published SST colormap's terminal bins are open, so a month decoded into one is a one-sided bound rather than a measurement.",
  "Censored months are the ones that set the extremes, so the series minimum and maximum are the statistics most affected.",
  "A mean containing a censored month is biased in that month's direction; when both caps are hit the biases oppose and no bound is stated.",
  "Nothing here estimates the value behind a cap, and no sea-ice, marine-biology, ecosystem, hazard, causal, or forecast claim follows from a censored reading.",
] as const;

/**
 * Judge a probed series against the published SST ramp's open end caps.
 *
 * `values` are the series in the layer's own reported unit (°C for SST) — the
 * same physical numbers the status line formats — with null for months that
 * returned nothing. Non-SST layers return an inapplicable summary: no other
 * layer in the app is decoded through this ramp, and the generic legend
 * extremes are a different question.
 */
export function probeSstExtremeCensoring(
  layerId: LayerId | undefined,
  values: readonly (number | null)[]
): ProbeSstExtremeCensoring {
  const base = {
    kind: "probe-sea-surface-temperature-extreme-censoring",
    marineBiologyObservation: false,
    isForecast: false,
    ramp: SST_PUBLISHED_RAMP,
  } as const;
  const inapplicable: ProbeSstExtremeCensoring = {
    ...base,
    applicable: false,
    min: null,
    max: null,
    minBound: null,
    maxBound: null,
    meanBound: null,
    floorMonthCount: 0,
    ceilingMonthCount: 0,
    observedMonthCount: 0,
  };
  if (layerId !== "sst") return inapplicable;

  const observed = values.filter(
    (value): value is number => value !== null && Number.isFinite(value)
  );
  if (observed.length === 0) return inapplicable;

  let floorMonthCount = 0;
  let ceilingMonthCount = 0;
  let lowest = observed[0];
  let highest = observed[0];
  for (const value of observed) {
    if (value < lowest) lowest = value;
    if (value > highest) highest = value;
    const status = summarizeSstRampCensoring(value).status;
    if (status === "at-ramp-floor") floorMonthCount += 1;
    if (status === "at-ramp-ceiling") ceilingMonthCount += 1;
  }

  const min = summarizeSstRampCensoring(lowest);
  const max = summarizeSstRampCensoring(highest);
  return {
    ...base,
    applicable: true,
    min,
    max,
    // Only the floor can censor a minimum and only the ceiling a maximum: a
    // series whose smallest value sits at the ceiling has every month there.
    minBound: min.status === "at-ramp-floor" ? "upper" : null,
    maxBound: max.status === "at-ramp-ceiling" ? "lower" : null,
    meanBound: meanBoundFor(floorMonthCount, ceilingMonthCount),
    floorMonthCount,
    ceilingMonthCount,
    observedMonthCount: observed.length,
  };
}

/**
 * The inequality to render in front of a reported statistic, or "" when it is a
 * two-sided estimate. Kept separate from the clause so the number itself can
 * never be shown bare once it is known to be a bound.
 *
 * `mean` is covered as well as the two extremes: a mean containing a censored
 * month inherits that month's one-sided error (see `meanBound`), so rendering it
 * bare beside a `≤`-marked minimum reports as a point estimate the one statistic
 * a reader is most likely to carry away. "indeterminate" is the sole case with
 * no prefix — both caps were hit, the two biases oppose, and no inequality is
 * true of the mean; the clause states that in prose instead of implying a
 * direction the data cannot support.
 */
export function sstExtremeBoundPrefix(
  censoring: ProbeSstExtremeCensoring,
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
 * when no sampled month reached a cap — an ordinary open-ocean record then
 * reads exactly as it did before.
 */
export function sstExtremeCensoringClause(
  censoring: ProbeSstExtremeCensoring
): string | null {
  if (!censoring.applicable) return null;
  const { floorMonthCount, ceilingMonthCount, observedMonthCount, ramp } =
    censoring;
  const capped = floorMonthCount + ceilingMonthCount;
  if (capped === 0) return null;

  const tally = `${capped} of ${observedMonthCount} sampled ${
    observedMonthCount === 1 ? "month" : "months"
  }`;
  const source = `source ${ramp.colormapDoc} colormap`;
  const floorCap = `every SST below ${ramp.floorBin.lo.toFixed(1)} ${ramp.unit} shares one colour`;
  const ceilingCap = `every SST at or above ${ramp.ceilingBin.hi.toFixed(1)} ${ramp.unit} shares one colour`;

  if (floorMonthCount > 0 && ceilingMonthCount > 0) {
    return `${tally} land in the SST colormap's open end caps (${floorCap}; ${ceilingCap}), so min is an upper bound, max a lower bound, and the mean is bounded in neither direction (${source})`;
  }
  if (floorMonthCount > 0) {
    return `${tally} land in the SST colormap's open low cap (${floorCap}), so min and mean are upper bounds on possibly colder water (${source})`;
  }
  return `${tally} land in the SST colormap's open high cap (${ceilingCap}), so max and mean are lower bounds on possibly warmer water (${source})`;
}

function meanBoundFor(
  floorMonthCount: number,
  ceilingMonthCount: number
): SstMeanBound {
  if (floorMonthCount > 0 && ceilingMonthCount > 0) return "indeterminate";
  if (floorMonthCount > 0) return "upper";
  if (ceilingMonthCount > 0) return "lower";
  return null;
}
