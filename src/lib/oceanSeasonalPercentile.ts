import { formatYm, MONTH_NAMES, type YearMonth } from "./timeline";
import {
  compareSstToSeasonalBaseline,
  type OceanSeasonalBaselineComparison,
  type OceanSeasonalBaselineOptions,
  type OceanSeasonalBaselineStatus,
  type UsableSstFootprint,
} from "./oceanSeasonalBaseline";
import type { SeaSurfaceTemperatureObservation } from "./oceanConditions";

/**
 * Empirical percentile-of-record for a supplied monthly sea-surface-temperature
 * value.
 *
 * The plainest question a reader asks of one SST reading — *is this month warm
 * or cool for here?* — cannot be answered from the raw °C value, because ocean
 * temperature carries a strong seasonal cycle and varies with latitude and
 * footprint, so a number is only meaningful against other numbers for the SAME
 * footprint and SAME calendar month. This helper ranks the target within its own
 * footprint-and-season history and reports where it falls as a non-exceedance
 * percentile plus the raw counts behind it.
 *
 * It is a NON-PARAMETRIC companion to the parametric standardized anomaly
 * (`compareSstToSeasonalBaseline` carries `standardizedAnomaly`; see also
 * `contextualizeOceanSeasonalAnomaly`). A rank is robust to a short or skewed
 * record and makes no normality assumption, and — unlike the standardized
 * anomaly, which is withheld when the baseline standard deviation is zero or
 * rests on a single year — a rank is defined whenever the audited baseline is
 * itself available. It is NOT a climatological normal, an operational marine
 * percentile, a significance test, or a probability of any future condition, and
 * an empirical percentile from a limited record can never fall outside the
 * sampled range.
 *
 * All sample gathering, deduplication, coverage filtering, target-year
 * exclusion, footprint separation (open water vs. land-mixed coastal is never
 * mixed), and the minimum-sample floor are delegated to
 * `compareSstToSeasonalBaseline`. This helper adds only the distribution-free
 * rank on top of that audited baseline and never infers marine-biological
 * abundance, habitat, ecosystem condition, hazard, causation, or any future
 * ocean temperature. Provenance is retained.
 *
 * Pure, render-free logic (see oceanSeasonalPercentile.test.ts).
 */

export const SST_SEASONAL_PERCENTILE_LIMITATIONS = [
  "Values are supplied MODIS/Aqua sea-surface-temperature observations in the source unit (°C), not a bias-corrected climate record.",
  "The percentile is an empirical rank of the target within a short supplied record of prior same-calendar-month, same-footprint observations — not a climatological normal, an operational marine percentile, or a probability of future conditions.",
  "Ranking is restricted to the same calendar month and the same surface footprint (open water vs. land-mixed coastal is never mixed) because SST carries a strong seasonal cycle and differs by footprint; a cross-month or cross-footprint rank would be misleading.",
  "The non-exceedance percentile uses the mid-rank convention F = (cooler + tied/2) / n; the raw cooler/tied/warmer counts are reported so any other plotting-position convention can be recomputed.",
  "An empirical percentile from a limited record is uncertain and cannot fall outside the sampled range; this is a non-parametric companion to the standardized anomaly, not a significance test, and never infers marine-biological abundance, habitat, ecosystem condition, hazard, cause, or any future value.",
] as const;

/** Percentile status mirrors the underlying same-calendar-month SST baseline. */
export type SstSeasonalPercentileStatus = OceanSeasonalBaselineStatus;

export interface SstSeasonalPercentileResult {
  kind: "sea-surface-temperature-percentile-of-record";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  /** Explicitly prevents a single ranked month from being read as a trend. */
  isTrend: false;
  claimScope: "empirical-rank-within-supplied-same-footprint-same-calendar-month-record-only";
  metric: OceanSeasonalBaselineComparison["metric"];
  status: SstSeasonalPercentileStatus;
  /** Full audited same-calendar-month SST baseline, retained for provenance. */
  baseline: OceanSeasonalBaselineComparison;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Footprint the baseline was restricted to (never mixed across footprints). */
  footprint: UsableSstFootprint | null;
  /** Prior same-calendar-month observations the target was ranked against. */
  sampleCount: number;
  /** Baseline months strictly cooler than the target (native °C). */
  coolerRecordCount: number | null;
  /** Baseline months strictly warmer than the target. */
  warmerRecordCount: number | null;
  /** Baseline months whose value equals the target exactly. */
  tiedRecordCount: number | null;
  /** Mid-rank empirical non-exceedance percentile of the target, 0–100. */
  percentileRank: number | null;
  /** Empirical exceedance probability within the record (0–1); 1 − rank/100. */
  exceedanceProbability: number | null;
  /** True when no baseline month is cooler (target at/below the record minimum). */
  isCoolestInRecord: boolean | null;
  /** True when no baseline month is warmer (target at/above the record maximum). */
  isWarmestInRecord: boolean | null;
  /** Short machine-readable reason when no percentile is reported. */
  reason: string | null;
  limitations: readonly string[];
}

/**
 * Rank one supplied monthly SST observation within prior supplied observations
 * for the same calendar month and the same surface footprint.
 *
 * A percentile is reported only when the delegated baseline comparison is itself
 * `available` — so a land, missing, low-coverage, or under-sampled record never
 * yields a fabricated rank. A `null` percentile therefore means "no rank can be
 * stated", never "median".
 */
export function describeSstSeasonalPercentile(
  targetObservation: SeaSurfaceTemperatureObservation,
  baselineCandidates: readonly SeaSurfaceTemperatureObservation[],
  options: OceanSeasonalBaselineOptions = {}
): SstSeasonalPercentileResult {
  const baseline = compareSstToSeasonalBaseline(
    targetObservation,
    baselineCandidates,
    options
  );

  const base = {
    kind: "sea-surface-temperature-percentile-of-record",
    isForecast: false,
    isTrend: false,
    claimScope:
      "empirical-rank-within-supplied-same-footprint-same-calendar-month-record-only",
    metric: baseline.metric,
    status: baseline.status,
    baseline,
    dataMonth: baseline.target.dataMonth,
    calendarMonth: baseline.bounds.calendarMonth,
    footprint: baseline.bounds.footprint,
    sampleCount: baseline.samples.length,
    limitations: SST_SEASONAL_PERCENTILE_LIMITATIONS,
  } as const;

  // A rank is only meaningful once the audited baseline is available: the target
  // is a published, usable, on-footprint observation and the record clears the
  // sample and coverage floors. Every other status passes through with a null
  // percentile.
  if (
    baseline.status !== "available" ||
    baseline.target.observedValue === null
  ) {
    return {
      ...base,
      coolerRecordCount: null,
      warmerRecordCount: null,
      tiedRecordCount: null,
      percentileRank: null,
      exceedanceProbability: null,
      isCoolestInRecord: null,
      isWarmestInRecord: null,
      reason: baseline.reason ?? "percentile-unavailable",
    };
  }

  const target = baseline.target.observedValue;
  const count = baseline.samples.length;
  let cooler = 0;
  let warmer = 0;
  let tied = 0;
  for (const sample of baseline.samples) {
    if (sample.value < target) cooler += 1;
    else if (sample.value > target) warmer += 1;
    else tied += 1;
  }

  // Mid-rank empirical non-exceedance percentile: the share of the record at or
  // below the target, splitting exact ties evenly. Symmetric to exceedance, so
  // percentileRank/100 + exceedanceProbability === 1 by construction.
  const nonExceedance = (cooler + tied / 2) / count;
  return {
    ...base,
    coolerRecordCount: cooler,
    warmerRecordCount: warmer,
    tiedRecordCount: tied,
    percentileRank: nonExceedance * 100,
    exceedanceProbability: (warmer + tied / 2) / count,
    isCoolestInRecord: cooler === 0,
    isWarmestInRecord: warmer === 0,
    reason: null,
  };
}

const FOOTPRINT_PHRASES: Record<UsableSstFootprint, string> = {
  water: "open-water",
  "land-mixed-coastal": "coastal (land-mixed)",
};

/**
 * A compact, honest one-line readout of the SST percentile-of-record, matching
 * the place panel's cited-readout style. It states the non-exceedance percentile,
 * the cooler/tied/warmer counts behind it, the footprint the baseline was built
 * on, and the number of same-calendar-month years. Non-`available` results are
 * reported plainly rather than dressed up as a number, and it never infers marine
 * biology, ecosystem condition, hazard, causation, or any forecast.
 */
export function formatSstSeasonalPercentile(
  result: SstSeasonalPercentileResult
): string {
  const source = result.metric.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is an empirical rank within a short observed record, not a climatological normal, significance test, marine-biology, ecosystem, hazard, or forecast claim.`;

  const month =
    isYearMonth(result.dataMonth) && result.calendarMonth !== null
      ? formatYm(result.dataMonth)
      : "an invalid month";
  const lead = `Sea-surface-temperature percentile-of-record for ${month}:`;

  if (
    result.status !== "available" ||
    result.percentileRank === null ||
    result.footprint === null
  ) {
    return `${lead} no percentile is reported (${result.reason ?? "unavailable"}). ${provenance}`;
  }

  const footprint = FOOTPRINT_PHRASES[result.footprint];
  const calendarMonthName =
    result.calendarMonth !== null
      ? MONTH_NAMES[result.calendarMonth - 1]
      : "the same calendar month";
  const years =
    result.sampleCount === 1
      ? "1 same-calendar-month year"
      : `${result.sampleCount} same-calendar-month years`;
  const rank = roundTo(result.percentileRank, 1);
  const cooler = result.coolerRecordCount as number;
  const warmer = result.warmerRecordCount as number;

  let position: string;
  if (result.isWarmestInRecord && result.isCoolestInRecord) {
    // Every retained year tied the target exactly (a flat record).
    position = `tied with all ${years} in the record`;
  } else if (result.isWarmestInRecord) {
    position = `warmer than all ${cooler} other ${footprint} ${calendarMonthName} months in the record`;
  } else if (result.isCoolestInRecord) {
    position = `cooler than all ${warmer} other ${footprint} ${calendarMonthName} months in the record`;
  } else {
    position = `warmer than ${cooler} and cooler than ${warmer} of the ${footprint} ${calendarMonthName} record`;
  }

  return `${lead} ${rank}th percentile — ${position}, across ${years} of prior ${calendarMonthName} ${footprint} SST. ${provenance}`;
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
