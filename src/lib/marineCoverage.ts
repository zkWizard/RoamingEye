import { PROBE_SCALES } from "./probe";
import { formatYm, LAYERS, type DatasetRef, type YearMonth } from "./timeline";

/**
 * Provenance-first coverage descriptions for the existing MODIS/Aqua SST
 * layer. These helpers report supplied sampling context only. They do not
 * describe marine organisms, abundance, habitat, ecosystem health, causes,
 * risk, or future ocean conditions.
 */

const sstSource = LAYERS.sst.dataset;
if (!sstSource) {
  throw new Error("RoamingEye: the SST layer must retain a cited dataset");
}

export const SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE = {
  observationKind: "sea-surface-temperature",
  layerId: "sst",
  label: "Sea surface temperature coverage",
  sourceUnit: PROBE_SCALES.sst.unit,
  source: sstSource,
} as const satisfies {
  observationKind: "sea-surface-temperature";
  layerId: "sst";
  label: string;
  sourceUnit: string;
  source: DatasetRef;
};

/** Surface context is supplied by the sampler; it is never inferred from SST. */
export type MarineFootprint =
  "water" | "coastal-or-land-mixed" | "land" | "unknown";

export interface SourceImageDimensions {
  width: number;
  height: number;
}

export interface MarineCoverageInput {
  /** Calendar month represented by the sampled SST image. */
  dataMonth: YearMonth;
  /** Supplied water/land context for the sampled boundary or point. */
  footprint: MarineFootprint;
  /** Usable share of the sampled footprint, when the sampler provides it. */
  validFraction?: number;
  /** Dimensions of the rendered source image, when sampling provides them. */
  sourceImageDimensions?: SourceImageDimensions;
}

export type MarineCoverageStatus =
  | "water"
  | "coastal-or-land-mixed"
  | "land"
  | "no-sst-coverage"
  | "unknown"
  | "invalid";

export interface MarineCoverageSummary {
  kind: "sea-surface-temperature-coverage";
  /** Prevents this SST coverage record from being mistaken for biology data. */
  marineBiologyObservation: false;
  /** This record describes one supplied observation month, never a forecast. */
  isForecast: false;
  source: typeof SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE;
  dataMonth: YearMonth;
  coverage: {
    status: MarineCoverageStatus;
    footprint: MarineFootprint;
    /** Null means spatial coverage was not supplied by the sampler. */
    validFraction: number | null;
    reason: string | null;
  };
  sourceImageDimensions: SourceImageDimensions | null;
  /** Distinguishes absent image provenance from malformed sampler metadata. */
  sourceImageDimensionsStatus: "supplied" | "not-supplied" | "invalid";
  /** Ready for an aria-label or other screen-reader-visible presentation. */
  accessibleText: string;
}

/**
 * Describe SST spatial coverage while preserving the caller's footprint and
 * image provenance. A valid fraction is not treated as a biological measure.
 */
export function summarizeMarineCoverage(
  input: MarineCoverageInput
): MarineCoverageSummary {
  const coverage = coverageFor(input);
  const sourceImageDimensions = dimensionsFor(input.sourceImageDimensions);
  const sourceImageDimensionsStatus = dimensionsStatusFor(
    input.sourceImageDimensions,
    sourceImageDimensions
  );

  return {
    kind: "sea-surface-temperature-coverage",
    marineBiologyObservation: false,
    isForecast: false,
    source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
    dataMonth: input.dataMonth,
    coverage,
    sourceImageDimensions,
    sourceImageDimensionsStatus,
    accessibleText: accessibleTextFor(
      input.dataMonth,
      coverage,
      sourceImageDimensions,
      sourceImageDimensionsStatus
    ),
  };
}

function coverageFor(
  input: MarineCoverageInput
): MarineCoverageSummary["coverage"] {
  const validFraction = input.validFraction;
  const base = {
    footprint: input.footprint,
    validFraction: validFraction ?? null,
  };
  if (!isYearMonth(input.dataMonth)) {
    return { ...base, status: "invalid", reason: "invalid-month" };
  }
  if (
    validFraction !== undefined &&
    (!Number.isFinite(validFraction) || validFraction < 0 || validFraction > 1)
  ) {
    return {
      ...base,
      validFraction: null,
      status: "invalid",
      reason: "invalid-coverage",
    };
  }
  if (input.footprint === "land") {
    return { ...base, status: "land", reason: "land-footprint" };
  }
  if (validFraction === 0) {
    return { ...base, status: "no-sst-coverage", reason: "zero-sst-coverage" };
  }
  if (input.footprint === "unknown") {
    return { ...base, status: "unknown", reason: "unknown-footprint" };
  }
  return { ...base, status: input.footprint, reason: null };
}

function dimensionsFor(
  dimensions: SourceImageDimensions | undefined
): SourceImageDimensions | null {
  if (!dimensions) return null;
  return Number.isInteger(dimensions.width) &&
    Number.isInteger(dimensions.height) &&
    dimensions.width > 0 &&
    dimensions.height > 0
    ? dimensions
    : null;
}

function dimensionsStatusFor(
  supplied: SourceImageDimensions | undefined,
  normalized: SourceImageDimensions | null
): MarineCoverageSummary["sourceImageDimensionsStatus"] {
  if (supplied === undefined) return "not-supplied";
  return normalized === null ? "invalid" : "supplied";
}

function accessibleTextFor(
  dataMonth: YearMonth,
  coverage: MarineCoverageSummary["coverage"],
  dimensions: SourceImageDimensions | null,
  dimensionsStatus: MarineCoverageSummary["sourceImageDimensionsStatus"]
): string {
  const month = isYearMonth(dataMonth)
    ? formatYm(dataMonth)
    : "an invalid month";
  const fraction =
    coverage.validFraction === null
      ? "Spatial coverage was not supplied."
      : `${Math.round(coverage.validFraction * 100)}% of the supplied footprint had usable SST samples.`;
  const footprint =
    coverage.status === "land"
      ? "The supplied footprint is land, so it has no sea-surface-temperature coverage."
      : coverage.status === "no-sst-coverage"
        ? "No usable sea-surface-temperature samples were supplied."
        : coverage.status === "unknown"
          ? "The supplied footprint type is unknown."
          : coverage.status === "invalid"
            ? "Coverage metadata is invalid."
            : fraction;
  const image = dimensions
    ? ` Source image dimensions: ${dimensions.width} by ${dimensions.height} pixels.`
    : dimensionsStatus === "invalid"
      ? " Supplied source image dimensions were invalid."
      : " Source image dimensions were not supplied.";

  return `Sea surface temperature coverage for ${month}: ${footprint} Source: ${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.shortName} v${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.version}. This is an SST observation, not a marine-biology observation.${image}`;
}

function isYearMonth(value: YearMonth): boolean {
  return (
    Number.isInteger(value.year) &&
    Number.isInteger(value.month) &&
    value.month >= 1 &&
    value.month <= 12
  );
}
