import {
  SEA_SURFACE_TEMPERATURE_METRIC,
  type OceanConditionSummary,
  type SeaSurfaceTemperatureBand,
} from "./oceanConditions";
import { formatYm, ymToIndex, type YearMonth } from "./timeline";

/**
 * Describe the month-over-month *change* in a supplied sea-surface-temperature
 * observation for a probed point — how much warmer or cooler the sampled water
 * was than the calendar month before.
 *
 * `oceanConditions.ts` summarizes one month's MODIS/Aqua SST value into a
 * descriptive band and coverage context. This helper answers the distinct
 * question two adjacent months invite: *was this month warmer or cooler than
 * last?* — a signed difference between two already-usable observed values,
 * carrying the same cited SST provenance.
 *
 * It is a plain subtraction (later minus earlier) in the source unit (°C). It
 * adds no anomaly, climatology/normal, warming/cooling trend, rate, cause,
 * ecosystem signal, or forecast. The month-to-month difference of two monthly
 * means is not a trend line and must not be read as one — see the limitations.
 */

/** Direction of the month-over-month change in observed SST. */
export type SeaSurfaceTemperatureTrend = "warmer" | "cooler" | "little-change";

export type SeaSurfaceTemperatureChangeStatus =
  "available" | "non-adjacent-months" | "unavailable";

/**
 * Change of observed SST (°C) below which the pair is reported as
 * `little-change` rather than warmer or cooler. A reporting convention, not a
 * physical threshold: a month-to-month difference under 0.5 °C sits within the
 * combined sampling and monthly-mean noise of the source product and should not
 * be over-read as directional. Callers may override it.
 */
export const SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C = 0.5;

export const SEA_SURFACE_TEMPERATURE_CHANGE_LIMITATIONS = [
  "The change is the plain difference of two monthly-mean SST observations (later minus earlier) in the source unit (°C).",
  "The direction bin (warmer/cooler/little-change) is a reporting convention over a continuous difference; its threshold is not a physical boundary.",
  "Two adjacent monthly means are not a trend line, a warming/cooling rate, or a climatology anomaly, and this helper does not compute one.",
  "It inherits the SST product's resolution and biases and infers no ecosystem condition, marine-biology signal, cause, hazard, or any future value.",
] as const;

export interface SeaSurfaceTemperatureChange {
  kind: "month-over-month-sea-surface-temperature-change";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-change-only";
  status: SeaSurfaceTemperatureChangeStatus;
  /** Shared cited SST product for both endpoints. */
  metric: typeof SEA_SURFACE_TEMPERATURE_METRIC;
  /** The two supplied single-month SST summaries, unchanged. */
  earlier: OceanConditionSummary;
  later: OceanConditionSummary;
  /** Later observed value minus earlier, in the source unit (°C); null when not computable. */
  changeValue: number | null;
  trend: SeaSurfaceTemperatureTrend | null;
  thresholdValue: number;
  /**
   * Descriptive-band transition. Categorical context over the two supplied
   * bands only — never a hazard, comfort, or biological claim. `changed` is
   * null whenever a signed change could not be stated.
   */
  band: {
    earlier: SeaSurfaceTemperatureBand | null;
    later: SeaSurfaceTemperatureBand | null;
    changed: boolean | null;
  };
  /** Short machine-readable reason when no trend is reported. */
  reason: string | null;
  limitations: readonly string[];
}

export interface SeaSurfaceTemperatureChangeOptions {
  /** Change band (°C) treated as `little-change` (defaults to convention). */
  thresholdC?: number;
}

/**
 * Describe the change in observed SST between two consecutive months. Both
 * summaries must carry a usable observed value (a `water` or
 * `land-mixed-coastal` coverage status; see {@link summarizeOceanConditions}),
 * and `later` must fall exactly one calendar month after `earlier` — the helper
 * never spans a gap or reorders the pair. On any unmet rule it reports the
 * reason and a null change rather than a fabricated difference; a null change
 * therefore means "no change can be stated", never "no change occurred".
 */
export function describeSeaSurfaceTemperatureChange(
  earlier: OceanConditionSummary,
  later: OceanConditionSummary,
  options: SeaSurfaceTemperatureChangeOptions = {}
): SeaSurfaceTemperatureChange {
  const threshold =
    options.thresholdC ?? SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C;
  const validThreshold = Number.isFinite(threshold) && threshold >= 0;

  const base = {
    kind: "month-over-month-sea-surface-temperature-change" as const,
    isForecast: false as const,
    claimScope: "descriptive-sea-surface-temperature-change-only" as const,
    metric: SEA_SURFACE_TEMPERATURE_METRIC,
    earlier,
    later,
    changeValue: null,
    trend: null,
    thresholdValue: validThreshold
      ? threshold
      : SEA_SURFACE_TEMPERATURE_CHANGE_THRESHOLD_C,
    band: { earlier: null, later: null, changed: null },
    limitations: SEA_SURFACE_TEMPERATURE_CHANGE_LIMITATIONS,
  };

  if (!validThreshold) {
    return { ...base, status: "unavailable", reason: "invalid-threshold" };
  }
  if (earlier.observedValue === null || later.observedValue === null) {
    return { ...base, status: "unavailable", reason: "endpoint-not-available" };
  }
  if (!isConsecutive(earlier.dataMonth, later.dataMonth)) {
    return {
      ...base,
      status: "non-adjacent-months",
      reason: "months-not-consecutive",
    };
  }

  const change = later.observedValue - earlier.observedValue;
  const trend: SeaSurfaceTemperatureTrend =
    Math.abs(change) < threshold
      ? "little-change"
      : change > 0
        ? "warmer"
        : "cooler";

  return {
    ...base,
    status: "available",
    changeValue: change,
    trend,
    band: {
      earlier: earlier.temperatureBand,
      later: later.temperatureBand,
      changed: earlier.temperatureBand !== later.temperatureBand,
    },
    reason: null,
  };
}

/**
 * A compact, honest one-line readout of the change, matching the place panel's
 * cited-readout style. Non-`available` results are reported plainly rather than
 * dressed up as a number.
 */
export function formatSeaSurfaceTemperatureChange(
  change: SeaSurfaceTemperatureChange
): string {
  const source = change.metric.source;
  const provenance = `source ${source.shortName} v${source.version}`;

  if (change.status !== "available" || change.changeValue === null) {
    return `No month-over-month sea-surface-temperature change (${change.reason ?? change.status}); ${provenance}`;
  }

  const unit = change.metric.sourceUnit;
  const earlierLabel = formatYm(change.earlier.dataMonth);
  const laterLabel = formatYm(change.later.dataMonth);
  const bandNote = change.band.changed
    ? ` (band ${change.band.earlier} → ${change.band.later})`
    : "";

  if (change.trend === "little-change") {
    return `${laterLabel} vs ${earlierLabel}: little change (${formatSigned(change.changeValue)} ${unit})${bandNote}; ${provenance}`;
  }
  const verb = change.trend === "warmer" ? "warmer" : "cooler";
  return `${laterLabel} vs ${earlierLabel}: ${verb} by ${formatMagnitude(change.changeValue)} ${unit}${bandNote}; ${provenance}`;
}

function isConsecutive(earlier: YearMonth, later: YearMonth): boolean {
  return ymToIndex(later) - ymToIndex(earlier) === 1;
}

function formatSigned(value: number): string {
  const rounded = Number(value.toPrecision(5));
  return rounded > 0 ? `+${rounded}` : `${rounded}`;
}

function formatMagnitude(value: number): string {
  return Number(Math.abs(value).toPrecision(5)).toString();
}
