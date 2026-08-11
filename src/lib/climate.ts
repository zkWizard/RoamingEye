import {
  DATA_LATEST,
  LAYERS,
  type DatasetRef,
  type LayerId,
  type YearMonth,
} from "./timeline";
import type { GeometrySamplingStrategy } from "./geojson";

/**
 * Source-aware descriptions of supplied monthly climate observations.
 *
 * Values stay in the source product's native units. These helpers describe
 * supplied observations and their coverage only; they do not estimate weather,
 * diagnose conditions, attribute causes, or forecast future values.
 */

export type ClimateMetricId =
  "precipitation-rate" | "air-temperature-2m" | "soil-moisture";

export interface ClimateMetric {
  id: ClimateMetricId;
  layerId: LayerId;
  label: string;
  /** Unit of the source product value, before any display conversion. */
  nativeUnit: string;
  /** Exact GIBS variable/layer sampled for this metric. */
  sourceLayer: string;
  source: DatasetRef;
}

function citedMetric(
  id: ClimateMetricId,
  layerId: LayerId,
  label: string,
  nativeUnit: string
): ClimateMetric {
  const source = LAYERS[layerId].dataset;
  if (!source) {
    throw new Error(`RoamingEye: ${layerId} must retain a cited dataset`);
  }
  return {
    id,
    layerId,
    label,
    nativeUnit,
    sourceLayer: LAYERS[layerId].wmsLayer,
    source,
  };
}

/** Cited product metadata and native units for each climate observation. */
export const CLIMATE_METRICS: Record<ClimateMetricId, ClimateMetric> = {
  "precipitation-rate": citedMetric(
    "precipitation-rate",
    "precip",
    "Precipitation rate",
    "kg/m²/s"
  ),
  "air-temperature-2m": citedMetric(
    "air-temperature-2m",
    "airtemp",
    "2 m air temperature",
    "K"
  ),
  "soil-moisture": citedMetric(
    "soil-moisture",
    "soil",
    "Underground soil moisture",
    "kg/m²"
  ),
};

export interface MonthlyClimateObservation {
  metricId: ClimateMetricId;
  /** Month represented by the supplied source observation. */
  dataMonth: YearMonth;
  /** Source value in the metric's `nativeUnit`; null is no usable data. */
  value: number | null;
  /** Usable share of the sampled area, when spatial sampling provides it. */
  validFraction?: number;
  /**
   * Dimensions of a rendered source image when the observation was sampled
   * from imagery. This is provenance, not a ground-resolution claim.
   */
  sourceImageDimensions?: { width: number; height: number } | null;
  /** Spatial method used to derive this rendered observation. */
  geometrySamplingStrategy?: GeometrySamplingStrategy;
}

export type ClimateCoverageStatus = "available" | "no-data" | "invalid";

export interface ClimateCoverage {
  status: ClimateCoverageStatus;
  /** Null means the sampler did not provide spatial coverage. */
  validFraction: number | null;
  /** Why a value cannot be described as a usable monthly observation. */
  reason: string | null;
}

export interface MonthlyClimateSummary {
  kind: "observed-monthly-climate";
  /** Explicitly prevents consumers from treating this as a forecast. */
  isForecast: false;
  metric: ClimateMetric;
  dataMonth: YearMonth;
  /** Earliest monthly observation published by the metric's cited layer. */
  firstAvailableMonth: YearMonth;
  /**
   * Latest monthly observation the metric's cited layer *declares* — its
   * `latest`, falling back to the global timeline end. This is a floor, not a
   * ceiling: it is a conservative compiled-in baseline until freshness.ts
   * verifies the product against GIBS at boot and extends it forward.
   */
  lastAvailableMonth: YearMonth;
  /** Month through which the caller had confirmed source availability. */
  availableThrough: YearMonth;
  /**
   * True when `dataMonth` sits past `lastAvailableMonth` — the caller supplied
   * a value for a month the cited product does not declare as published.
   *
   * This does not by itself make the value wrong, which is why it is reported
   * rather than used to withhold: before boot verification `lastAvailableMonth`
   * is a conservative baseline, so a real observation can legitimately outrun
   * it. But `availableThrough` is the caller's own claim, and nothing else in
   * this summary checks it against the source. Reanalysis and land-model
   * products lag the MODIS composites (that lag is exactly what `latest`
   * records), so a caller driving off the global timeline end reaches months
   * MERRA-2 and GLDAS have never distributed and is told only "published".
   * Consumers that must not overstate the record should treat a flagged
   * observation as unverified against its source.
   */
  beyondDeclaredRecord: boolean;
  /** Whether this data month is within the cited source's known record. */
  publicationStatus:
    | "published"
    | "before-source-record"
    | "not-yet-published"
    | "invalid-reference-month";
  /** Calendar-month difference, or null when data month is not yet published. */
  publicationLagMonths: number | null;
  coverage: ClimateCoverage;
  /** Rendered-image provenance, or null when it was not supplied or invalid. */
  sourceImageDimensions: { width: number; height: number } | null;
  /** Retained so a point sample cannot be presented as a regional mean. */
  geometrySamplingStrategy: GeometrySamplingStrategy | null;
  /**
   * Retained unchanged in `metric.nativeUnit` only for a published, usable
   * observation; null for unavailable, missing, or invalid records.
   */
  observedValue: number | null;
}

/**
 * Describe a single supplied monthly value and publication lag at month
 * precision. `availableThrough` is an availability checkpoint, not a promise
 * that a future monthly value will be published.
 *
 * The cited layer's record bounds this on both ends. A month before `start` is
 * withheld as `before-source-record`. A month past the layer's declared
 * `latest` is reported through `beyondDeclaredRecord` rather than withheld,
 * because that end of the record is a conservative baseline until boot
 * verification extends it — see the field's note.
 */
export function summarizeMonthlyClimate(
  observation: MonthlyClimateObservation,
  availableThrough: YearMonth
): MonthlyClimateSummary {
  const metric = CLIMATE_METRICS[observation.metricId];
  const firstAvailableMonth = LAYERS[metric.layerId].start;
  // Read at call time: freshness.ts extends both bindings at boot, so a
  // summary must reflect the record as verified then, not as compiled in.
  const lastAvailableMonth = LAYERS[metric.layerId].latest ?? DATA_LATEST;
  const dataMonth = observation.dataMonth;
  const validMonths =
    isYearMonth(dataMonth) &&
    isYearMonth(firstAvailableMonth) &&
    isYearMonth(lastAvailableMonth) &&
    isYearMonth(availableThrough);
  const lag = validMonths ? monthDistance(dataMonth, availableThrough) : null;
  const publicationStatus =
    lag === null
      ? "invalid-reference-month"
      : monthDistance(firstAvailableMonth, dataMonth) < 0
        ? "before-source-record"
        : lag < 0
          ? "not-yet-published"
          : "published";
  const coverage = coverageFor(observation, validMonths);

  return {
    kind: "observed-monthly-climate",
    isForecast: false,
    metric,
    // Snapshot every month value at the contract boundary. Timeline month
    // objects are reused by callers, and later mutation must not re-date an
    // observation that has already been paired with a source value.
    dataMonth: { ...dataMonth },
    firstAvailableMonth: { ...firstAvailableMonth },
    lastAvailableMonth: { ...lastAvailableMonth },
    availableThrough: { ...availableThrough },
    beyondDeclaredRecord:
      validMonths && monthDistance(lastAvailableMonth, dataMonth) > 0,
    publicationStatus,
    publicationLagMonths: lag === null || lag < 0 ? null : lag,
    coverage,
    sourceImageDimensions: validImageDimensions(
      observation.sourceImageDimensions
    )
      ? { ...observation.sourceImageDimensions }
      : null,
    geometrySamplingStrategy:
      observation.geometrySamplingStrategy === "boundary-grid" ||
      observation.geometrySamplingStrategy === "boundary-point"
        ? observation.geometrySamplingStrategy
        : null,
    observedValue:
      publicationStatus === "published" && coverage.status === "available"
        ? observation.value
        : null,
  };
}

function coverageFor(
  observation: MonthlyClimateObservation,
  validMonths: boolean
): ClimateCoverage {
  if (!validMonths) {
    return { status: "invalid", validFraction: null, reason: "invalid-month" };
  }
  const fraction = observation.validFraction;
  if (
    fraction !== undefined &&
    (!Number.isFinite(fraction) || fraction < 0 || fraction > 1)
  ) {
    return {
      status: "invalid",
      validFraction: null,
      reason: "invalid-coverage",
    };
  }
  if (observation.value === null || fraction === 0) {
    return {
      status: "no-data",
      validFraction: fraction ?? null,
      reason: observation.value === null ? "missing-value" : "zero-coverage",
    };
  }
  if (!Number.isFinite(observation.value) || !isPhysicalValue(observation)) {
    return {
      status: "invalid",
      validFraction: fraction ?? null,
      reason: "invalid-value",
    };
  }
  return { status: "available", validFraction: fraction ?? null, reason: null };
}

function isPhysicalValue(observation: MonthlyClimateObservation): boolean {
  const value = observation.value;
  if (value === null) return false;
  switch (observation.metricId) {
    case "air-temperature-2m":
      return value > 0;
    case "precipitation-rate":
    case "soil-moisture":
      return value >= 0;
  }
}

function validImageDimensions(
  dimensions: MonthlyClimateObservation["sourceImageDimensions"]
): dimensions is { width: number; height: number } {
  return (
    dimensions != null &&
    Number.isInteger(dimensions.width) &&
    Number.isInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
  );
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}

function monthDistance(earlier: YearMonth, later: YearMonth): number {
  return (later.year - earlier.year) * 12 + later.month - earlier.month;
}
