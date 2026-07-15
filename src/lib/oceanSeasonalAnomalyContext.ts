import {
  MONTH_NAMES,
  formatYm,
  type DatasetRef,
  type YearMonth,
} from "./timeline";
import type {
  OceanSeasonalBaselineComparison,
  UsableSstFootprint,
} from "./oceanSeasonalBaseline";

/**
 * Classify and narrate a same-calendar-month sea-surface-temperature anomaly in
 * multiples of the baseline's own year-to-year spread (a "standardized
 * anomaly").
 *
 * `compareSstToSeasonalBaseline` already reports the raw SST anomaly in the
 * source unit (°C) alongside the baseline sample standard deviation, and even
 * carries the quotient as `standardizedAnomaly`. On its own that bare number is
 * hard to read: is +0.4 °C for this footprint large or ordinary? This helper
 * turns the completed comparison into a labelled, footprint-aware description —
 * a warmer/cooler/comparable direction, a |z|-defined magnitude band, and a
 * provenance-tagged sentence — so a single SST reading is not over-read.
 *
 * This is a DESCRIPTIVE standardized departure, NOT a probability, p-value,
 * exceedance likelihood, significance test, forecast, or distributional claim.
 * The divisor is a *sample* standard deviation from a short run of same-
 * calendar-month years and assumes no particular distribution; the band labels
 * are defined purely as ranges of |z| and add no inference beyond that
 * arithmetic. Open-water and land-mixed coastal footprints are never mixed —
 * the description echoes the footprint the underlying baseline was built on and
 * never infers marine-biological abundance, habitat, ecosystem condition,
 * hazard, causation, or future ocean temperatures. Provenance is retained.
 */

export type OceanSeasonalAnomalyStatus = "available" | "unavailable";

/** Sign of the target month relative to the same-calendar-month baseline mean. */
export type OceanAnomalyDirection = "warmer" | "cooler" | "comparable";

/**
 * Descriptive magnitude band, defined strictly as ranges of |z| (the number of
 * baseline sample standard deviations). These are NOT probability statements.
 * - `within-typical-spread`      — |z| < 1 (inside one sample SD of the mean)
 * - `beyond-typical-spread`      — 1 ≤ |z| < 2
 * - `well-beyond-typical-spread` — |z| ≥ 2
 *
 * The names deliberately match `seasonalAnomalyContext`'s terrestrial bands so
 * the two domains read consistently, even though the underlying comparison
 * types differ (SST is footprint-aware and unit-specific).
 */
export type OceanAnomalyMagnitudeBand =
  | "within-typical-spread"
  | "beyond-typical-spread"
  | "well-beyond-typical-spread";

/**
 * |z| thresholds that separate the standardized-anomaly magnitude bands. A
 * reading lands in `within-typical-spread` below `beyondTypicalSpread`, in
 * `beyond-typical-spread` at/above it and below `wellBeyondTypicalSpread`, and
 * in `well-beyond-typical-spread` at/above `wellBeyondTypicalSpread`. Exported
 * as the single source of truth for the band edges so companions (e.g. the
 * band-proximity descriptor) never drift from `magnitudeBandOf` below.
 */
export const OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS = {
  /** |z| at/above which an anomaly leaves the typical year-to-year spread. */
  beyondTypicalSpread: 1,
  /** |z| at/above which an anomaly is well beyond the typical spread. */
  wellBeyondTypicalSpread: 2,
} as const;

export interface OceanSeasonalAnomalyContext {
  kind: "standardized-sea-surface-temperature-anomaly";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  claimScope: "descriptive-sea-surface-temperature-only";
  status: OceanSeasonalAnomalyStatus;
  metric: OceanSeasonalBaselineComparison["metric"];
  /** Cited source of the underlying SST observations; never dropped. */
  source: DatasetRef;
  /** Month of the target observation, echoed for audit. */
  dataMonth: YearMonth;
  /** Calendar month (1–12) the baseline was drawn from, or null when unusable. */
  calendarMonth: number | null;
  /** Footprint the baseline was restricted to (never mixed across footprints). */
  footprint: UsableSstFootprint | null;
  /** Raw anomaly in the source unit (target minus baseline mean), echoed for audit. */
  anomaly: number | null;
  /** Native unit of `anomaly`; the standardized value itself is dimensionless. */
  anomalyUnit: string;
  /** Baseline sample standard deviation used as the divisor, in the source unit. */
  baselineStandardDeviation: number | null;
  /** Number of same-calendar-month years behind the standard deviation. */
  baselineSampleCount: number;
  /** anomaly / baselineStandardDeviation, in multiples of the baseline SD. */
  standardizedAnomaly: number | null;
  direction: OceanAnomalyDirection | null;
  magnitudeBand: OceanAnomalyMagnitudeBand | null;
  /** Short machine-readable reason when a standardized anomaly is withheld. */
  reason: string | null;
}

/**
 * Derive a labelled, footprint-aware standardized-anomaly context from a
 * completed SST seasonal-baseline comparison.
 *
 * A labelled context is only produced when the comparison itself succeeded
 * (`status: "available"`) AND it carries a finite, defined `standardizedAnomaly`
 * — which `compareSstToSeasonalBaseline` only sets when the baseline has a
 * usable, strictly positive sample standard deviation. A single-year or
 * perfectly flat baseline yields a null standardized value there, so this helper
 * withholds with a reason rather than inventing spread or a band.
 */
export function contextualizeOceanSeasonalAnomaly(
  comparison: OceanSeasonalBaselineComparison
): OceanSeasonalAnomalyContext {
  const { metric, anomaly, anomalyUnit } = comparison;
  const standardDeviation = comparison.baseline.sampleStandardDeviation;
  const base = {
    kind: "standardized-sea-surface-temperature-anomaly" as const,
    isForecast: false as const,
    claimScope: "descriptive-sea-surface-temperature-only" as const,
    metric,
    source: metric.source,
    dataMonth: comparison.target.dataMonth,
    calendarMonth: comparison.bounds.calendarMonth,
    footprint: comparison.bounds.footprint,
    anomaly: null as number | null,
    anomalyUnit,
    baselineStandardDeviation: null as number | null,
    baselineSampleCount: comparison.baseline.sampleCount,
    standardizedAnomaly: null as number | null,
    direction: null as OceanAnomalyDirection | null,
    magnitudeBand: null as OceanAnomalyMagnitudeBand | null,
  };

  if (comparison.status !== "available" || anomaly === null) {
    return {
      ...base,
      status: "unavailable",
      reason: comparison.reason ?? `baseline-${comparison.status}`,
    };
  }

  const standardizedAnomaly = comparison.standardizedAnomaly;
  if (
    standardizedAnomaly === null ||
    !Number.isFinite(standardizedAnomaly) ||
    standardDeviation === null ||
    !Number.isFinite(standardDeviation) ||
    standardDeviation <= 0
  ) {
    // The comparison succeeded but could not be standardized (single-year or
    // flat baseline). Echo the raw anomaly; withhold the labelled framing.
    return {
      ...base,
      status: "unavailable",
      anomaly,
      baselineStandardDeviation:
        standardDeviation !== null && Number.isFinite(standardDeviation)
          ? standardDeviation
          : null,
      reason:
        standardDeviation === 0
          ? "no-baseline-variability"
          : "insufficient-baseline-spread",
    };
  }

  return {
    ...base,
    status: "available",
    anomaly,
    baselineStandardDeviation: standardDeviation,
    standardizedAnomaly,
    direction: directionOf(anomaly),
    magnitudeBand: magnitudeBandOf(standardizedAnomaly),
    reason: null,
  };
}

function directionOf(anomaly: number): OceanAnomalyDirection {
  if (anomaly > 0) return "warmer";
  if (anomaly < 0) return "cooler";
  return "comparable";
}

function magnitudeBandOf(
  standardizedAnomaly: number
): OceanAnomalyMagnitudeBand {
  const magnitude = Math.abs(standardizedAnomaly);
  if (magnitude < OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.beyondTypicalSpread)
    return "within-typical-spread";
  if (
    magnitude < OCEAN_ANOMALY_MAGNITUDE_BAND_THRESHOLDS.wellBeyondTypicalSpread
  )
    return "beyond-typical-spread";
  return "well-beyond-typical-spread";
}

const FOOTPRINT_PHRASES: Record<UsableSstFootprint, string> = {
  water: "open-water",
  "land-mixed-coastal": "coastal (land-mixed)",
};

const DIRECTION_PHRASES: Record<OceanAnomalyDirection, string> = {
  warmer: "warmer than",
  cooler: "cooler than",
  comparable: "comparable to",
};

const BAND_PHRASES: Record<OceanAnomalyMagnitudeBand, string> = {
  "within-typical-spread": "within the typical year-to-year spread (|z| < 1)",
  "beyond-typical-spread":
    "beyond the typical year-to-year spread (1 ≤ |z| < 2)",
  "well-beyond-typical-spread":
    "well beyond the typical year-to-year spread (|z| ≥ 2)",
};

/**
 * Build a provenance-tagged, screen-reader-ready sentence for a standardized SST
 * anomaly context. It states the standardized departure in baseline
 * standard-deviation multiples, its direction and magnitude band, the footprint
 * the baseline was built on, and the number of same-calendar-month years behind
 * it. It never infers marine biology, ecosystem condition, hazard, causation, or
 * any forecast, and states withheld cases honestly instead of inventing a value.
 */
export function describeOceanSeasonalAnomaly(
  context: OceanSeasonalAnomalyContext
): string {
  const source = context.metric.source;
  const provenance = `Source: ${source.shortName} v${source.version}. This is a descriptive sea-surface-temperature departure from a short observed record, not a probability, significance test, marine-biology, ecosystem, hazard, or forecast claim.`;

  const month =
    isYearMonth(context.dataMonth) && context.calendarMonth !== null
      ? formatYm(context.dataMonth)
      : "an invalid month";
  const lead = `Standardized sea-surface-temperature anomaly for ${month}:`;

  if (context.status !== "available") {
    return `${lead} no standardized anomaly is reported (${context.reason ?? "unavailable"}). ${provenance}`;
  }

  const footprint =
    context.footprint !== null
      ? FOOTPRINT_PHRASES[context.footprint]
      : "the sampled";
  const calendarMonthName =
    context.calendarMonth !== null
      ? MONTH_NAMES[context.calendarMonth - 1]
      : "the same calendar month";
  const direction =
    DIRECTION_PHRASES[context.direction as OceanAnomalyDirection];
  const band = BAND_PHRASES[context.magnitudeBand as OceanAnomalyMagnitudeBand];
  const z = roundTo(context.standardizedAnomaly as number, 2);
  const rawAnomaly = roundTo(context.anomaly as number, 2);
  const years =
    context.baselineSampleCount === 1
      ? "1 same-calendar-month year"
      : `${context.baselineSampleCount} same-calendar-month years`;

  const magnitude =
    context.direction === "comparable"
      ? `at the ${footprint} baseline mean`
      : `${direction} the ${footprint} baseline mean by ${Math.abs(rawAnomaly)}${context.anomalyUnit} (z = ${z}), ${band}`;

  return `${lead} ${magnitude}, measured against ${years} of prior ${calendarMonthName} ${footprint} SST. ${provenance}`;
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
