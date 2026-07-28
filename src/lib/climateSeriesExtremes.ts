import type { ClimateMetric, MonthlyClimateSummary } from "./climate";
import type { DatasetRef, YearMonth } from "./timeline";

/**
 * Descriptive extremes over a *supplied series* of monthly climate observations.
 *
 * The single-observation path (see climate.ts `summarizeMonthlyClimate`) and the
 * place-panel readout (meteorology.ts `climateInsightText`, current vs. previous)
 * both describe one or two months. Neither answers the plainest question about a
 * probed point across a span of months: over the months we actually have, which
 * was the warmest and which the coldest (or, for precipitation rate, the wettest
 * and driest), and how wide is that observed spread?
 *
 * This helper answers exactly that and nothing more. It scans the usable,
 * published observations in the supplied series, returns the lowest and highest
 * observed values with the months they fall in, the native-unit range between
 * them, and the calendar span the usable observations cover. It is a purely
 * descriptive reduction of already-usable observations:
 *
 *  - The extremes are the extremes *within the supplied sample only*. They are
 *    NOT a climatological record, a return period, an anomaly, or a ranking
 *    against any baseline the sample does not contain.
 *  - Only published, fully usable observations enter the reduction. Not-yet-
 *    published, invalid, and no-data months are counted as unusable and never
 *    silently treated as an extreme (a cold missing month must not read as the
 *    coldest observed month).
 *  - No forecast, trend, causation, or diagnosis is added. A wide range across
 *    two months is not a claim about variability, only about the two numbers.
 *
 * Provenance is preserved: the cited metric and dataset ride along unchanged.
 */

/** Honest scope limits for the derived series extremes. */
export const CLIMATE_SERIES_EXTREMES_LIMITATIONS =
  "Extremes are the lowest and highest usable observed values within the " +
  "supplied series only, in the metric's native unit. They inherit the source " +
  "product's resolution and biases and count only published, usable months; " +
  "not-yet-published, invalid, and no-data months are excluded, never treated " +
  "as an extreme. This is a plain reduction of supplied observations, not a " +
  "climatological record, return period, anomaly, trend, or forecast.";

/** One extreme observation: its native-unit value and the month it falls in. */
export interface ClimateSeriesExtreme {
  dataMonth: YearMonth;
  /** Observed value in the metric's native unit. */
  value: number;
}

export interface ClimateSeriesExtremesSummary {
  kind: "observed-climate-series-extremes";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Cited metric shared by every summary in the series. */
  metric: ClimateMetric;
  /** Same cited product as the source observations; provenance is preserved. */
  source: DatasetRef;
  /** Native unit the extremes and range are expressed in. */
  nativeUnit: string;
  /** Count of summaries supplied, usable or not. */
  monthsSupplied: number;
  /** Count of published, usable observations that entered the extremes. */
  monthsUsable: number;
  /** Lowest usable observed value and its month, or null when none usable. */
  minimum: ClimateSeriesExtreme | null;
  /** Highest usable observed value and its month, or null when none usable. */
  maximum: ClimateSeriesExtreme | null;
  /**
   * `maximum.value - minimum.value` in the native unit, or null when no usable
   * observation exists. Exactly one usable month yields a real range of 0.
   */
  rangeNative: number | null;
  /**
   * Earliest and latest data month among the usable observations, or null when
   * none are usable. This is the calendar span the extremes were drawn from,
   * not a promise that every month in between was present or usable.
   */
  usableMonthSpan: { earliest: YearMonth; latest: YearMonth } | null;
}

/**
 * Reduce a supplied series of same-metric monthly climate summaries to its
 * observed extremes. Every summary must describe the same metric so that values
 * in one native unit are never compared against another (e.g. kelvin against a
 * precipitation mass flux); a mixed or empty series throws rather than emit an
 * un-citable or meaningless result.
 *
 * The returned extremes reflect only usable, published observations. When none
 * are usable, `minimum`, `maximum`, `rangeNative`, and `usableMonthSpan` are all
 * null — never a fabricated or misleading extreme.
 */
export function climateSeriesExtremes(
  summaries: readonly MonthlyClimateSummary[]
): ClimateSeriesExtremesSummary {
  if (summaries.length === 0) {
    throw new Error(
      "RoamingEye: climate series extremes need at least one summary to cite"
    );
  }
  const metric = summaries[0].metric;
  if (
    summaries.some((summary) => !sameMetricProvenance(summary.metric, metric))
  ) {
    throw new Error(
      "RoamingEye: climate series extremes require consistent metric provenance"
    );
  }

  let minimum: ClimateSeriesExtreme | null = null;
  let maximum: ClimateSeriesExtreme | null = null;
  let earliest: YearMonth | null = null;
  let latest: YearMonth | null = null;
  let monthsUsable = 0;

  for (const summary of summaries) {
    if (!isUsable(summary)) continue;
    const value = summary.observedValue as number;
    const dataMonth = summary.dataMonth;
    monthsUsable += 1;

    // Ties resolve to the earlier calendar month so selection is deterministic
    // regardless of input order, not merely first-encountered.
    if (minimum === null || wins(value, dataMonth, minimum, "min")) {
      minimum = { dataMonth, value };
    }
    if (maximum === null || wins(value, dataMonth, maximum, "max")) {
      maximum = { dataMonth, value };
    }
    if (earliest === null || monthOrdinal(dataMonth) < monthOrdinal(earliest)) {
      earliest = dataMonth;
    }
    if (latest === null || monthOrdinal(dataMonth) > monthOrdinal(latest)) {
      latest = dataMonth;
    }
  }

  return {
    kind: "observed-climate-series-extremes",
    isForecast: false,
    metric,
    source: metric.source,
    nativeUnit: metric.nativeUnit,
    monthsSupplied: summaries.length,
    monthsUsable,
    minimum,
    maximum,
    rangeNative:
      minimum === null || maximum === null
        ? null
        : maximum.value - minimum.value,
    usableMonthSpan:
      earliest === null || latest === null ? null : { earliest, latest },
  };
}

/**
 * Compare every field that determines what a climate value represents and how
 * it must be cited. Matching IDs alone are insufficient because a deserialized
 * or independently assembled summary could otherwise attach another unit,
 * layer, or source citation to values entering the same reduction.
 */
function sameMetricProvenance(
  candidate: ClimateMetric,
  expected: ClimateMetric
): boolean {
  return (
    candidate.id === expected.id &&
    candidate.layerId === expected.layerId &&
    candidate.nativeUnit === expected.nativeUnit &&
    candidate.source.shortName === expected.source.shortName &&
    candidate.source.version === expected.source.version &&
    candidate.source.doi === expected.source.doi &&
    candidate.source.title === expected.source.title
  );
}

/**
 * Whether a candidate observation should replace the current extreme. A strictly
 * more extreme value always wins; on an exact value tie the earlier calendar
 * month wins, making the result independent of input order.
 */
function wins(
  value: number,
  dataMonth: YearMonth,
  current: ClimateSeriesExtreme,
  side: "min" | "max"
): boolean {
  if (value !== current.value) {
    return side === "min" ? value < current.value : value > current.value;
  }
  return monthOrdinal(dataMonth) < monthOrdinal(current.dataMonth);
}

/**
 * A published observation with usable coverage and a finite value. Mirrors the
 * usability guard the native place-panel readout applies so the extremes never
 * disagree with what a single-month readout would call usable.
 */
function isUsable(summary: MonthlyClimateSummary): boolean {
  return (
    summary.publicationStatus === "published" &&
    summary.coverage.status === "available" &&
    summary.observedValue !== null &&
    Number.isFinite(summary.observedValue)
  );
}

/** Months since a fixed epoch, for ordering only; malformed months are guarded. */
function monthOrdinal(month: YearMonth): number {
  return month.year * 12 + (month.month - 1);
}
