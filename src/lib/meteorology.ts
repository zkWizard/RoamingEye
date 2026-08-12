import {
  CLIMATE_METRICS,
  summarizeMonthlyClimate,
  type ClimateMetricId,
  type MonthlyClimateObservation,
  type MonthlyClimateSummary,
} from "./climate";
import { SCALE_CONVERSIONS } from "./colormap";
import { classifyModality } from "./observationModality";
import { compareYm, type LayerId, type YearMonth } from "./timeline";
import { toConventionalClimateValue } from "./climateConventionalUnits";
import {
  airTemperaturePlausibility,
  formatAirTemperaturePlausibility,
  type AirTemperaturePlausibilityStatus,
} from "./airTemperaturePlausibility";
import {
  formatPrecipitationRatePlausibility,
  precipitationRatePlausibility,
  type PrecipitationRatePlausibilityStatus,
} from "./precipitationRatePlausibility";
import type { GeometrySamplingStrategy } from "./geojson";
import type {
  PlaceObservationInput,
  PlaceObservationUnavailableReason,
} from "./placeObservationExport";

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

const CLIMATE_LAYER_BY_METRIC: Record<
  ClimateMetricId,
  "precip" | "airtemp" | "soil"
> = {
  "precipitation-rate": "precip",
  "air-temperature-2m": "airtemp",
  "soil-moisture": "soil",
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
  /**
   * Month-aligned rendered source-image dimensions. Null explicitly records
   * that dimensions were unavailable for that month. When supplied, this
   * takes precedence over the series-level fallback above.
   */
  sourceImageDimensionsByMonth?: readonly ({
    width: number;
    height: number;
  } | null)[];
  /** Spatial method used by the place sampler for every supplied month. */
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
  const {
    months,
    sampledValues,
    validFractions,
    sourceImageDimensionsByMonth,
    nativeToSampledValueFactor,
  } = input;
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
    sourceImageDimensionsByMonth &&
    sourceImageDimensionsByMonth.length !== months.length
  ) {
    throw new Error(
      "RoamingEye: rendered climate months and image provenance must have matching lengths"
    );
  }
  assertStrictlyIncreasingMonths(months);
  if (
    !Number.isFinite(nativeToSampledValueFactor) ||
    nativeToSampledValueFactor <= 0
  ) {
    throw new Error(
      "RoamingEye: native-to-sampled climate value factor must be positive"
    );
  }
  const layerId = CLIMATE_LAYER_BY_METRIC[input.metricId];
  const expectedFactor = SCALE_CONVERSIONS[layerId]?.factor ?? 1;
  if (nativeToSampledValueFactor !== expectedFactor) {
    throw new Error(
      `RoamingEye: ${input.metricId} rendered samples require native-to-sampled factor ${expectedFactor}`
    );
  }

  return {
    kind: "rendered-monthly-climate-observations",
    isForecast: false,
    metric: CLIMATE_METRICS[input.metricId],
    nativeToSampledValueFactor,
    observations: months.map((dataMonth, index) => {
      const monthDimensions = sourceImageDimensionsByMonth
        ? sourceImageDimensionsByMonth[index]
        : input.sourceImageDimensions;
      return {
        metricId: input.metricId,
        // Keep the sampled value bound to the month supplied at sampling time,
        // even when a caller later reuses or advances its timeline month object.
        dataMonth: { ...dataMonth },
        value:
          sampledValues[index] === null
            ? null
            : sampledValues[index] / nativeToSampledValueFactor,
        ...(validFractions ? { validFraction: validFractions[index] } : {}),
        ...(monthDimensions === undefined
          ? {}
          : {
              sourceImageDimensions: monthDimensions
                ? { ...monthDimensions }
                : null,
            }),
        ...(input.geometrySamplingStrategy
          ? { geometrySamplingStrategy: input.geometrySamplingStrategy }
          : {}),
      };
    }),
  };
}

function assertStrictlyIncreasingMonths(months: readonly YearMonth[]): void {
  let previousOrdinal: number | null = null;
  for (const month of months) {
    if (
      !Number.isInteger(month.year) ||
      !Number.isInteger(month.month) ||
      month.month < 1 ||
      month.month > 12
    ) {
      throw new Error(
        "RoamingEye: rendered climate series contains an invalid data month"
      );
    }

    const ordinal = month.year * 12 + month.month - 1;
    if (previousOrdinal !== null && ordinal <= previousOrdinal) {
      throw new Error(
        "RoamingEye: rendered climate data months must be unique and strictly increasing"
      );
    }
    previousOrdinal = ordinal;
  }
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

/**
 * Prepare rendered climate months for the place-observation export contract.
 *
 * Values remain in sampled/display units here because
 * `placeObservationProductFromSample` performs the cited native-unit
 * conversion exactly once. Unusable observations are withheld instead of
 * allowing a non-finite or physically impossible value to invalidate the
 * entire download.
 */
export function exportObservationsFromRenderedClimateSample(
  input: RenderedClimateSampleInput,
  availableThrough: YearMonth
): PlaceObservationInput[] {
  const summaries = summarizeRenderedClimateSample(input, availableThrough);

  return summaries.map((summary, index) => {
    if (
      summary.publicationStatus === "published" &&
      summary.coverage.status === "available" &&
      summary.observedValue !== null
    ) {
      return {
        dataMonth: summary.dataMonth,
        value: input.sampledValues[index],
        ...(summary.coverage.validFraction !== null
          ? { validFraction: summary.coverage.validFraction }
          : {}),
      };
    }

    return {
      dataMonth: summary.dataMonth,
      value: null,
      unavailableReason: exportUnavailableReason(summary),
      ...(summary.coverage.validFraction !== null
        ? { validFraction: summary.coverage.validFraction }
        : {}),
    };
  });
}

export type ClimatePlausibilityStatus =
  "plausible" | "implausible" | "not-checked";

export interface ClimatePlausibilityVerdict {
  status: ClimatePlausibilityStatus;
  /**
   * The band verdict with its cited source, or why no band was applied.
   * Callers surface this verbatim rather than restating the bounds.
   */
  statement: string;
}

/**
 * Apply the metric-appropriate gross-error plausibility band to one rendered
 * monthly observation.
 *
 * Rendered-imagery sampling can fail in ways `climate.ts` cannot catch: it only
 * guards sign and finiteness, so an unconverted °C figure, a mm/day rate left
 * unscaled, or a colormap decode error still arrives as a "usable" native
 * value. The atmospheric bands are deliberately far wider than any real monthly
 * mean, so a genuine extreme is never flagged — only physically impossible
 * readings are.
 *
 * `not-checked` is returned for soil moisture, which has no band defined here,
 * and for observations with no usable value to check. It is never a pass:
 * a `plausible` result is a gross-error sanity pass, not a correctness claim.
 */
export function climateObservationPlausibility(
  summary: MonthlyClimateSummary
): ClimatePlausibilityVerdict {
  const airTemperature = airTemperaturePlausibility(summary);
  if (airTemperature) {
    return {
      status: bandStatus(airTemperature.status),
      statement: formatAirTemperaturePlausibility(airTemperature),
    };
  }

  const precipitation = precipitationRatePlausibility(summary);
  if (precipitation) {
    return {
      status: bandStatus(precipitation.status),
      statement: formatPrecipitationRatePlausibility(precipitation),
    };
  }

  return {
    status: "not-checked",
    statement: `No gross-error plausibility band is defined for ${summary.metric.label}`,
  };
}

/**
 * Collapse a metric-specific band verdict onto the shared status. Every
 * non-`plausible`, checkable verdict is treated as implausible, so a new
 * failure mode added to a band is withheld by default rather than displayed.
 */
function bandStatus(
  status: AirTemperaturePlausibilityStatus | PrecipitationRatePlausibilityStatus
): ClimatePlausibilityStatus {
  if (status === "not-usable") return "not-checked";
  return status === "plausible" ? "plausible" : "implausible";
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
  const sourceVariable = `GIBS layer ${current.metric.sourceLayer}`;
  const month = formatMonth(current.dataMonth);
  const modality = climateModalityText(current);
  const provenance = imageProvenance(current.sourceImageDimensions);
  const coverage = coverageText(current.coverage.validFraction);
  const sampling = samplingText(current.geometrySamplingStrategy);
  if (
    current.publicationStatus !== "published" ||
    current.coverage.status !== "available" ||
    current.observedValue === null
  ) {
    return {
      value: "Unavailable",
      detail: `No usable ${month} ${modality.field} (${unavailableReason(
        current
      )}); ${sampling}; ${coverage}; ${provenance}; ${
        modality.limit
      }; ${sourceVariable}; source ${source}`,
    };
  }

  // A value outside the metric's gross-error band is a unit/decode failure,
  // not an observation, so it is withheld rather than shown as a measurement.
  const plausibility = climateObservationPlausibility(current);
  if (plausibility.status === "implausible") {
    return {
      value: "Unavailable",
      detail: `Withheld ${month} ${modality.field}: ${plausibility.statement}; ${sampling}; ${coverage}; ${provenance}; ${modality.limit}; ${sourceVariable}`,
    };
  }

  const conventional = toConventionalClimateValue(current);
  const value =
    conventional?.value !== null && conventional
      ? formatNativeValue(conventional.value, conventional.conventionalUnit)
      : formatNativeValue(current.observedValue, current.metric.nativeUnit);
  const previousUsable =
    previous?.publicationStatus === "published" &&
    previous.coverage.status === "available" &&
    previous.observedValue !== null;
  const comparisonIssue = previous
    ? climateComparisonIssue(previous, current)
    : null;
  const nativeDelta =
    previousUsable &&
    previous?.observedValue !== null &&
    comparisonIssue === null
      ? current.observedValue - previous.observedValue
      : null;
  const comparison =
    nativeDelta !== null
      ? `; ${formatNativeDelta(
          conventional
            ? nativeDelta * conventional.conversion.scale
            : nativeDelta,
          conventional?.conventionalUnit ?? current.metric.nativeUnit
        )} vs ${formatMonth(previous!.dataMonth)}`
      : comparisonIssue
        ? `; comparison unavailable (${comparisonIssue})`
        : "";
  const nativeProvenance = conventional
    ? `; native source value ${formatNativeValue(
        current.observedValue,
        current.metric.nativeUnit
      )} (${conventional.conversion.basis})`
    : "";
  return {
    value,
    detail: `${month} ${modality.field}${comparison}${nativeProvenance}; ${coverage}; ${provenance}; ${sampling}; ${modality.limit}; ${sourceVariable}; source ${source}`,
  };
}

function samplingText(strategy: GeometrySamplingStrategy | null): string {
  switch (strategy) {
    case "boundary-grid":
      return "approximate regional mean from a boundary grid";
    case "boundary-point":
      return "single in-boundary image sample, not a regional mean";
    default:
      return "sampling strategy not supplied";
  }
}

function climateModalityText(summary: MonthlyClimateSummary): {
  field: string;
  limit: string;
} {
  switch (classifyModality(summary.metric.source)) {
    case "land-surface-model":
      return {
        field: "land-surface-model field",
        limit: "model-derived, not a direct measurement",
      };
    case "atmospheric-reanalysis":
      return {
        field: "atmospheric reanalysis field",
        limit: "reanalysis-derived, not a direct measurement",
      };
    case "satellite-derived-index":
      return {
        field: "satellite-derived field",
        limit: "remotely sensed, not a direct in-situ measurement",
      };
    case "unclassified":
      return {
        field: "source field",
        limit: "production method not classified",
      };
  }
}

function climateComparisonIssue(
  previous: MonthlyClimateSummary,
  current: MonthlyClimateSummary
): string | null {
  if (
    previous.metric.id !== current.metric.id ||
    previous.metric.nativeUnit !== current.metric.nativeUnit
  ) {
    return "different climate metric or native unit";
  }
  if (
    previous.metric.source.shortName !== current.metric.source.shortName ||
    previous.metric.source.version !== current.metric.source.version
  ) {
    return "different source product";
  }
  if (compareYm(previous.dataMonth, current.dataMonth) >= 0) {
    return "comparison month is not earlier";
  }
  // A change computed against an impossible value would itself be impossible.
  if (climateObservationPlausibility(previous).status === "implausible") {
    return "comparison month failed the gross-error plausibility band";
  }
  return null;
}

function unavailableReason(summary: MonthlyClimateSummary): string {
  if (summary.publicationStatus !== "published") {
    return summary.publicationStatus;
  }
  return summary.coverage.reason ?? "unspecified";
}

function exportUnavailableReason(
  summary: MonthlyClimateSummary
): PlaceObservationUnavailableReason {
  if (
    summary.publicationStatus !== "published" ||
    summary.coverage.status === "invalid"
  ) {
    return "sampling-failed";
  }
  return (summary.coverage.validFraction ?? 0) > 0
    ? "insufficient-valid-coverage"
    : "source-no-data";
}

function coverageText(validFraction: number | null): string {
  return validFraction === null
    ? "sampled coverage not supplied"
    : `${formatNumber(validFraction * 100)}% sampled coverage`;
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
