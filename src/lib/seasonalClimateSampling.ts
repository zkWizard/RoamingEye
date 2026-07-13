import {
  CLIMATE_METRICS,
  type ClimateMetric,
  type ClimateMetricId,
} from "./climate";
import { MINIMUM_SEASONAL_BASELINE_SAMPLES } from "./seasonalBaseline";
import {
  DATA_LATEST,
  LAYERS,
  compareYm,
  isAvailable,
  type LayerConfig,
  type LayerId,
  type YearMonth,
} from "./timeline";

/**
 * Source-available sampling requests for a same-calendar-month comparison.
 *
 * The plan is deliberately separate from image sampling: it selects only
 * months published by the cited product and leaves values and coverage null
 * until the geometry sampler has actually observed them. It does not fill
 * missing months, estimate values, or forecast future observations.
 */

const CLIMATE_LAYER_IDS: Record<ClimateMetricId, LayerId> = {
  "precipitation-rate": "precip",
  "air-temperature-2m": "airtemp",
  "soil-moisture": "soil",
};

export type SeasonalClimateSamplingStatus =
  | "ready"
  | "insufficient-source-history"
  | "target-before-source-record"
  | "target-not-yet-published"
  | "invalid-configuration";

export interface SeasonalClimateSamplingOptions {
  /** Inclusive first calendar year to consider for baseline sampling. */
  baselineStartYear?: number;
  /** Inclusive final calendar year to consider; defaults before the target. */
  baselineEndYear?: number;
  /** Number of same-calendar-month observations required by the comparison. */
  minimumSamples?: number;
}

export interface ClimateSamplingRequest {
  /** Month passed unchanged to the GIBS geometry sampler. */
  dataMonth: YearMonth;
  /** This request has not yet been sampled; no value or coverage is implied. */
  observationStatus: "not-sampled";
}

export interface ClimateSourceAvailability {
  /** Earliest monthly observation offered by this product layer. */
  firstAvailableMonth: YearMonth;
  /** Latest product month known available when this plan was created. */
  availableThrough: YearMonth;
  /** Dataset citation that must accompany all observations returned later. */
  source: ClimateMetric["source"];
}

export interface SeasonalClimateSamplingPlan {
  kind: "same-calendar-month-climate-sampling-plan";
  /** Sampling requests only; this plan never represents a forecast. */
  isForecast: false;
  status: SeasonalClimateSamplingStatus;
  metric: ClimateMetric;
  layer: LayerConfig;
  sourceAvailability: ClimateSourceAvailability;
  /** Month requested for the current observation, when source-available. */
  target: ClimateSamplingRequest | null;
  /** Source-available historical months, oldest first, excluding target year. */
  baselineRequests: ClimateSamplingRequest[];
  /** Target followed by baseline requests for `ProbeSampler.sampleGeometryPhysical`. */
  sampleMonths: YearMonth[];
  baselineStartYear: number | null;
  baselineEndYear: number | null;
  requiredSampleCount: number;
  /** Why this plan cannot yield a complete comparison without more source data. */
  reason: string | null;
}

/**
 * Build an auditable request list for `ProbeSampler.sampleGeometryPhysical`.
 *
 * Only the selected metric's own layer availability is consulted. In
 * particular, a newer product must never make an unpublished GLDAS or
 * MERRA-2 month appear sampleable.
 */
export function planSeasonalClimateSampling(
  metricId: ClimateMetricId,
  targetMonth: YearMonth,
  options: SeasonalClimateSamplingOptions = {}
): SeasonalClimateSamplingPlan {
  const metric = CLIMATE_METRICS[metricId];
  const layer = LAYERS[CLIMATE_LAYER_IDS[metricId]];
  const availableThrough = layer.latest ?? DATA_LATEST;
  const sourceAvailability: ClimateSourceAvailability = {
    firstAvailableMonth: { ...layer.start },
    availableThrough: { ...availableThrough },
    source: metric.source,
  };
  const minimumSamples =
    options.minimumSamples ?? MINIMUM_SEASONAL_BASELINE_SAMPLES;
  const baselineEndYear = options.baselineEndYear ?? targetMonth.year - 1;
  const baselineStartYear = options.baselineStartYear ?? null;

  if (
    !isYearMonth(targetMonth) ||
    !Number.isInteger(minimumSamples) ||
    minimumSamples <= 0 ||
    !validYearBound(options.baselineStartYear) ||
    !validYearBound(options.baselineEndYear) ||
    (options.baselineStartYear !== undefined &&
      options.baselineEndYear !== undefined &&
      options.baselineStartYear > options.baselineEndYear)
  ) {
    return planFor(
      "invalid-configuration",
      metric,
      layer,
      sourceAvailability,
      null,
      [],
      baselineStartYear,
      Number.isInteger(baselineEndYear) ? baselineEndYear : null,
      minimumSamples,
      "invalid-sampling-configuration"
    );
  }

  if (compareYm(targetMonth, layer.start) < 0) {
    return planFor(
      "target-before-source-record",
      metric,
      layer,
      sourceAvailability,
      null,
      [],
      baselineStartYear,
      baselineEndYear,
      minimumSamples,
      "target-before-source-record"
    );
  }
  if (!isAvailable(layer, targetMonth)) {
    return planFor(
      "target-not-yet-published",
      metric,
      layer,
      sourceAvailability,
      null,
      [],
      baselineStartYear,
      baselineEndYear,
      minimumSamples,
      "target-not-yet-published"
    );
  }

  const target: ClimateSamplingRequest = {
    dataMonth: { ...targetMonth },
    observationStatus: "not-sampled",
  };
  const baselineRequests = availableSameCalendarMonths(
    layer,
    targetMonth,
    baselineStartYear,
    baselineEndYear
  ).map((dataMonth): ClimateSamplingRequest => ({
    dataMonth,
    observationStatus: "not-sampled",
  }));
  const status =
    baselineRequests.length >= minimumSamples
      ? "ready"
      : "insufficient-source-history";

  return planFor(
    status,
    metric,
    layer,
    sourceAvailability,
    target,
    baselineRequests,
    baselineStartYear,
    baselineEndYear,
    minimumSamples,
    status === "ready" ? null : "too-few-source-available-baseline-months"
  );
}

function planFor(
  status: SeasonalClimateSamplingStatus,
  metric: ClimateMetric,
  layer: LayerConfig,
  sourceAvailability: ClimateSourceAvailability,
  target: ClimateSamplingRequest | null,
  baselineRequests: ClimateSamplingRequest[],
  baselineStartYear: number | null,
  baselineEndYear: number | null,
  requiredSampleCount: number,
  reason: string | null
): SeasonalClimateSamplingPlan {
  return {
    kind: "same-calendar-month-climate-sampling-plan",
    isForecast: false,
    status,
    metric,
    layer,
    sourceAvailability,
    target,
    baselineRequests,
    sampleMonths: target
      ? [
          target.dataMonth,
          ...baselineRequests.map(({ dataMonth }) => dataMonth),
        ]
      : [],
    baselineStartYear,
    baselineEndYear,
    requiredSampleCount,
    reason,
  };
}

function availableSameCalendarMonths(
  layer: LayerConfig,
  targetMonth: YearMonth,
  baselineStartYear: number | null,
  baselineEndYear: number
): YearMonth[] {
  const start = Math.max(
    layer.start.year,
    baselineStartYear ?? layer.start.year
  );
  const end = Math.min(baselineEndYear, targetMonth.year - 1);
  const months: YearMonth[] = [];
  for (let year = start; year <= end; year++) {
    const month = { year, month: targetMonth.month };
    if (isAvailable(layer, month)) months.push(month);
  }
  return months;
}

function isYearMonth(month: YearMonth): boolean {
  return (
    Number.isInteger(month.year) &&
    Number.isInteger(month.month) &&
    month.month >= 1 &&
    month.month <= 12
  );
}

function validYearBound(year: number | undefined): boolean {
  return year === undefined || Number.isInteger(year);
}
