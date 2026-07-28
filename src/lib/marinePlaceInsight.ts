import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
  type MarineCoverageSummary,
  type SourceImageDimensions,
} from "./marineCoverage";
import { PROBE_SCALES } from "./probe";
import { formatYm, type YearMonth } from "./timeline";

/**
 * A single, source-aware SST reading for the exact boundary returned by place
 * search. It is intentionally separate from the terrestrial place metrics:
 * an SST observation says nothing about marine organisms or ecological state.
 */
export const MARINE_PLACE_METRIC = {
  id: "sst",
  label: "Sea surface temperature",
} as const;

export interface MarineBoundarySstInput {
  /** The actual monthly product time represented by the sample. */
  dataMonth: YearMonth;
  /** Physical SST in the source product's native unit, or null when unusable. */
  observedValue: number | null;
  /** Share of the searched boundary yielding usable SST pixels. */
  validFraction: number;
  /** Dimensions of the rendered source image sampled for that boundary. */
  sourceImageDimensions: SourceImageDimensions;
}

export interface MarinePlaceInsightReading {
  id: typeof MARINE_PLACE_METRIC.id;
  value: string;
  detail: string;
  kind: "observed-boundary-sea-surface-temperature";
  marineBiologyObservation: false;
  isForecast: false;
  dataMonth: YearMonth;
  observedValue: number | null;
  source: typeof SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE;
  /** Structured sampler state for UI/export consumers; null when sampling failed. */
  coverage: MarineCoverageSummary | null;
  observationStatus:
    "observed" | "no-sst-coverage" | "invalid-sample" | "source-unavailable";
}

/**
 * Format a boundary SST observation without turning partial coverage into a
 * coastal, biological, ecological, causal, or forecast claim.
 */
export function marineBoundarySstReading(
  input: MarineBoundarySstInput
): MarinePlaceInsightReading {
  const coverage = summarizeMarineCoverage({
    dataMonth: input.dataMonth,
    // A boundary can span water, land, coast, clouds, or gaps. The sampler's
    // valid fraction cannot identify which, so retain an explicit unknown
    // surface context instead of inferring a coastal footprint from SST.
    footprint: "unknown",
    validFraction: input.validFraction,
    sourceImageDimensions: input.sourceImageDimensions,
  });
  const usable =
    coverage.coverage.status !== "invalid" &&
    coverage.coverage.status !== "no-sst-coverage" &&
    isSstSourceValue(input.observedValue);
  const month = formatYm(input.dataMonth);
  const image = coverage.sourceImageDimensions
    ? `rendered source image ${coverage.sourceImageDimensions.width} x ${coverage.sourceImageDimensions.height} px`
    : "rendered source image dimensions not supplied";
  const source = `${coverage.source.source.shortName} v${coverage.source.source.version}`;
  const coverageText =
    coverage.coverage.validFraction === null
      ? "sampled coverage not supplied"
      : `${Math.round(coverage.coverage.validFraction * 100)}% sampled boundary coverage`;

  return {
    id: MARINE_PLACE_METRIC.id,
    value:
      input.observedValue !== null && usable
        ? `${input.observedValue.toFixed(1)} ${coverage.source.sourceUnit}`
        : "No usable SST observation",
    detail: `${month} approximate boundary-mean SST observation; ${coverageText}; ${image}; source ${source}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth: input.dataMonth,
    observedValue: usable ? input.observedValue : null,
    source: coverage.source,
    coverage,
    observationStatus: usable
      ? "observed"
      : coverage.coverage.status === "no-sst-coverage"
        ? "no-sst-coverage"
        : "invalid-sample",
  };
}

/** Surface a source-mapping failure without relabeling it as absent SST. */
export function unavailableMarineBoundarySstReading(
  dataMonth: YearMonth
): MarinePlaceInsightReading {
  return {
    id: MARINE_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} SST observation could not be sampled from the published source colormap; source ${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.shortName} v${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.version}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth,
    observedValue: null,
    source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
    coverage: null,
    observationStatus: "source-unavailable",
  };
}

function isSstSourceValue(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= PROBE_SCALES.sst.min &&
    value <= PROBE_SCALES.sst.max
  );
}
