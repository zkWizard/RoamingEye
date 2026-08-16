import type { ProbeSstExtremeCensoring } from "./probeSstExtremeCensoring";
import type { TrendSummary } from "./trend";

/**
 * How the published SST colormap's open end caps reach the *trend* the probe
 * reports, not just its extremes.
 *
 * `probeSstExtremeCensoring` established that a sea-surface-temperature month
 * decoded into a terminal bin is a one-sided bound, and marks the affected
 * `min`, `mean` and `max` on the status line accordingly. That enumeration
 * stops at the three extremes — but the status line reports a fourth statistic
 * from the very same array of values: a seasonal Mann-Kendall test with a Sen's
 * slope (see trend.ts). Naming exactly which statistics are bounds and leaving
 * the slope and its p-value beside them unqualified reads as a claim that the
 * trend escaped the censoring. It did not: it is fitted over the same series.
 *
 * What can honestly be said about the direction is less than for the mean, and
 * that asymmetry is the point of this module. A censored cold month always
 * decodes warmer than it truly was, so its effect on a *mean* is one-signed and
 * the bound follows. A trend has no such luck. Sen's slope is the median of the
 * within-season pairwise slopes, and a capped month sits in some pairs as the
 * earlier member and in others as the later one: correcting it downward raises
 * the first group's slopes and lowers the second's. Which way the median
 * finally moves depends on where in the record the capped months fall — a fact
 * about the true values, which the imagery has already destroyed. Substituting
 * a censoring threshold and fitting through it is the classic way to bias a
 * trend in an unsignable direction (Helsel, *Statistics for Censored
 * Environmental Data Using Minitab and R*, 2nd ed., Wiley 2012, §11), and the
 * repo's estimator is not exempt.
 *
 * So this module claims no direction, deliberately and permanently: see
 * `directionClaimable`. It recovers nothing, estimates nothing behind a cap,
 * and no sea-ice, marine-biology, ecosystem, habitat, causal, hazard or
 * forecast claim follows from it. It is a statement about a rendered colour
 * ramp and a rank estimator, nothing more.
 */

export interface ProbeSstTrendCensoring {
  kind: "probe-sea-surface-temperature-trend-censoring";
  /** A colour-ramp statement, never a biological one. */
  marineBiologyObservation: false;
  isForecast: false;
  /**
   * True only when an SST record whose sampled months reached a cap also
   * carries a trend worth qualifying. False for every other layer, for a record
   * that stayed inside the finite ramp, and for one too short to test — an
   * "insufficient record" verdict makes no numeric claim to qualify.
   */
  applicable: boolean;
  /** Sampled months decoded into either terminal bin. */
  censoredMonthCount: number;
  /** Months carrying a usable value — the denominator for the count above. */
  observedMonthCount: number;
  /**
   * Always false, and not a placeholder for future work: the direction a
   * censored month pushes a seasonal median depends on where in the record it
   * falls, which is exactly what the cap destroyed. Any later code tempted to
   * print "≤" or "≥" in front of this slope must first recover that, not
   * assume it.
   */
  directionClaimable: false;
}

export const PROBE_SST_TREND_CENSORING_LIMITATIONS = [
  "The reported trend is fitted over the same series whose capped months are one-sided bounds, so its slope and p-value are not two-sided estimates.",
  "No bias direction is claimed: a substituted cap raises the pairwise slopes in which that month is the earlier member and lowers those in which it is the later one.",
  "Nothing here estimates the value behind a cap, re-fits the trend, or corrects it — the information is gone from the imagery.",
  "No sea-ice, marine-biology, ecosystem, hazard, causal or forecast claim follows from a censored trend.",
] as const;

/**
 * Judge a reported trend against the censoring already found in its own series.
 *
 * Takes the extreme-censoring summary rather than the values so the two
 * statements are guaranteed to describe the same months — re-scanning the
 * series here could disagree with the inequalities already on screen.
 */
export function probeSstTrendCensoring(
  censoring: ProbeSstExtremeCensoring,
  trend: Pick<TrendSummary, "testable">
): ProbeSstTrendCensoring {
  const censoredMonthCount =
    censoring.floorMonthCount + censoring.ceilingMonthCount;
  return {
    kind: "probe-sea-surface-temperature-trend-censoring",
    marineBiologyObservation: false,
    isForecast: false,
    applicable:
      censoring.applicable && censoredMonthCount > 0 && trend.testable,
    censoredMonthCount,
    observedMonthCount: censoring.observedMonthCount,
    directionClaimable: false,
  };
}

/**
 * Whether the status line must extend its cap disclosure to the trend. The
 * wording lives in `sstExtremeCensoringClause`, which states it beside the
 * extremes it already describes, under the one `source …` attribution they
 * share; this module owns only the judgement.
 */
export function sstTrendCensored(
  trendCensoring: ProbeSstTrendCensoring
): boolean {
  return trendCensoring.applicable;
}
