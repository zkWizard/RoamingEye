import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetricId,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import type { LayerId, YearMonth } from "./timeline";
import type { GeometrySamplingStrategy } from "./geojson";

/**
 * Bridges sampled GIBS rendered imagery into the climate contracts.
 *
 * Some rendered colormaps are multiplied for display (GLDAS precipitation,
 * for example, is shown as mm/day). This adapter reverses that explicit
 * multiplier before constructing observations, so climate consumers always
 * receive the cited product's native units. It never fills a missing sample
 * or infers a value from a neighbouring month.
 */

const CLIMATE_METRIC_BY_LAYER: Partial<Record<LayerId, ClimateMetricId>> = {
  precip: "precipitation-rate",
  airtemp: "air-temperature-2m",
  soil: "soil-moisture",
};

export interface RenderedClimateSampleInput {
  metricId: ClimateMetricId;
  months: readonly YearMonth[];
  /** Values decoded from rendered imagery, before conversion back to native units. */
  sampledValues: readonly (number | null)[];
  /**
   * Explicit multiplier used from native product units to sampled values.
   * A value of 86,400 means kg/mÂ²/s was sampled as mm/day; one means native.
   */
  nativeToSampledValueFactor: number;
  /** Area-weighted usable share for each corresponding month, if supplied. */
  validFractions?: readonly number[];
  /** Rendered source-image dimensions; provenance only, never resolution. */
  sourceImageDimensions?: { width: number; height: number };
  /** Geography represented by the rendered sample. */
  geometrySamplingStrategy?: GeometrySamplingStrategy;
}

export interface RenderedClimateSeries {
  kind: "rendered-monthly-climate-observations";
  /** Explicitly prevents callers from treating image samples as forecasts. */
  isForecast: false;
  metric: (typeof CLIMATE_METRICS)[ClimateMetricId];
  nativeToSampledValueFactor: number;
  observations: MonthlyClimateObservation[];
}

/** Map a RoamingEye layer to a climate metric, or null for non-climate layers. */
export function climateMetricForLayer(
  layerId: LayerId
): ClimateMetricId | null {
  return CLIMATE_METRIC_BY_LAYER[layerId] ?? null;
}

/**
 * Convert one rendered monthly series into native-unit climate observations.
 * Positional arrays are deliberately required to have matching lengths to
 * prevent accidentally attaching one month's coverage or value to another.
 */
export function observationsFromRenderedClimateSample(
  input: RenderedClimateSampleInput
): RenderedClimateSeries {
  const { months, sampledValues, validFractions, nativeToSampledValueFactor } =
    input;
  if (months.length !== sampledValues.length) {
    throw new Error(
      "RoamingEye: rendered climate months and sampled values must have matching lengths"
    );
  }
  if (validFractions && validFractions.length !== months.length) {
    throw new Error(
      "RoamingEye: rendered climate months and coverage must have matching lengths"
    );
  }
  if (
    !Number.isFinite(nativeToSampledValueFactor) ||
    nativeToSampledValueFactor <= 0
  ) {
    throw new Error(
      "RoamingEye: native-to-sampled climate value factor must be positive"
    );
  }

  return {
    kind: "rendered-monthly-climate-observations",
    isForecast: false,
    metric: CLIMATE_METRICS[input.metricId],
    nativeToSampledValueFactor,
    observations: months.map((dataMonth, index) => ({
      metricId: input.metricId,
      dataMonth,
      value:
        sampledValues[index] === null
          ? null
          : sampledValues[index] / nativeToSampledValueFactor,
      ...(validFractions ? { validFraction: validFractions[index] } : {}),
      ...(input.sourceImageDimensions
        ? { sourceImageDimensions: { ...input.sourceImageDimensions } }
        : {}),
      ...(input.geometrySamplingStrategy
        ? { geometrySamplingStrategy: input.geometrySamplingStrategy }
        : {}),
    })),
  };
}

/** Summarize every supplied image-sampled month against one availability checkpoint. */
export function summarizeRenderedClimateSample(
  input: RenderedClimateSampleInput,
  availableThrough: YearMonth
): MonthlyClimateSummary[] {
  return observationsFromRenderedClimateSample(input).observations.map(
    (observation) => summarizeMonthlyClimate(observation, availableThrough)
  );
}

export interface ClimateInsightText {
  value: string;
  detail: string;
}

/**
 * Format one current and optional previous native-unit monthly observation for
 * the place panel. This is a measurement readout only: no forecast, anomaly,
 * diagnosis, or risk interpretation is added.
 */
export function climateInsightText(
  previous: MonthlyClimateSummary | undefined,
  current: MonthlyClimateSummary
): ClimateInsightText {
  const source = `${current.metric.source.shortName} v${current.metric.source.version}`;
  const month = formatMonth(current.dataMonth);
  const provenance = imageProvenance(current.sourceImageDimensions);
  const coverage = coverageText(
    current.coverage.validFraction,
    current.geometrySamplingStrategy
  );
  const geography = samplingGeography(current.geometrySamplingStrategy);
  if (
    current.publicationStatus !== "published" ||
    current.coverage.status !== "available" ||
    current.observedValue === null
  ) {
    return {
      value: "Unavailable",
      detail: `No usable ${month} observation (${unavailableReason(current)}); ${coverage}; ${provenance}; ${geography}; source ${source}`,
    };
  }

  const value = formatNativeValue(
    current.observedValue,
    current.metric.nativeUnit
  );
  const previousUsable =
    previous?.publicationStatus === "published" &&
    previous.coverage.status === "available" &&
    previous.observedValue !== null;
  const comparison =
    previousUsable && previous?.observedValue !== null
      ? `; ${formatNativeDelta(
          current.observedValue - previous.observedValue,
          current.metric.nativeUnit
        )} vs ${formatMonth(previous.dataMonth)}`
      : "";
  return {
    value,
    detail: `${month} observed${comparison}; ${coverage}; ${provenance}; ${geography}; source ${source}`,
  };
}

function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

function coverageText(
  validFraction: number | null,
  strategy: MonthlyClimateSummary["geometrySamplingStrategy"]
): string {
  if (strategy === "boundary-point") {
    return validFraction === null
      ? "single in-boundary image sample status not supplied"
      : `single in-boundary image sample ${validFraction === 1 ? "has data" : "has no data"}`;
  }
  return validFraction === null
    ? "sampled coverage not supplied"
    : `${Math.round(validFraction * 100)}% sampled coverage`;
}

function samplingGeography(
  strategy: MonthlyClimateSummary["geometrySamplingStrategy"]
): string {
  return strategy === "boundary-point"
    ? "single boundary point estimate, not a regional mean"
    : "approximate regional mean";
}

function imageProvenance(
  dimensions: MonthlyClimateSummary["sourceImageDimensions"]
): string {
  return dimensions
    ? `rendered source image ${dimensions.width} x ${dimensions.height} px`
    : "rendered source image dimensions not supplied";
}

function formatNativeValue(value: number, unit: string): string {
  return `${formatNumber(value)} ${unit}`;
}

function formatNativeDelta(value: number, unit: string): string {
  return `${value >= 0 ? "+" : ""}${formatNumber(value)} ${unit}`;
}

function formatNumber(value: number): string {
  return Number(value.toPrecision(5)).toString();
}

function formatMonth(month: YearMonth): string {
  return `${month.year}-${String(month.month).padStart(2, "0")}`;
}
