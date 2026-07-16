import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
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
  /** Searched area label supplied by geocoding; never inferred from SST. */
  geographyLabel: string;
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
  sampledGeography: {
    kind: "searched-area-boundary";
    label: string;
  };
  observedValue: number | null;
  source: typeof SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE;
}

/**
 * Format a boundary SST observation without turning partial coverage into a
 * coastal, biological, ecological, causal, or forecast claim.
 */
export function marineBoundarySstReading(
  input: MarineBoundarySstInput
): MarinePlaceInsightReading {
  const geographyLabel = normalizedGeographyLabel(input.geographyLabel);
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
      : `${Math.round(
          coverage.coverage.validFraction * 100
        )}% sampled boundary coverage`;

  return {
    id: MARINE_PLACE_METRIC.id,
    value:
      input.observedValue !== null && usable
        ? `${input.observedValue.toFixed(1)} ${coverage.source.sourceUnit}`
        : "No usable SST observation",
    detail: `${month} approximate boundary-mean SST observation for ${geographyLabel}; ${coverageText}; ${image}; source ${source}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth: input.dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: geographyLabel,
    },
    observedValue: usable ? input.observedValue : null,
    source: coverage.source,
  };
}

/** Surface a source-mapping failure without relabeling it as absent SST. */
export function unavailableMarineBoundarySstReading(
  dataMonth: YearMonth,
  geographyLabel: string
): MarinePlaceInsightReading {
  const sampledGeographyLabel = normalizedGeographyLabel(geographyLabel);
  return {
    id: MARINE_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(
      dataMonth
    )} SST observation for ${sampledGeographyLabel} could not be sampled from the published source colormap; source ${
      SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.shortName
    } v${
      SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.version
    }; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: sampledGeographyLabel,
    },
    observedValue: null,
    source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  };
}

function normalizedGeographyLabel(label: string): string {
  const normalized = label.trim();
  return normalized || "unknown searched area";
}

function isSstSourceValue(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= PROBE_SCALES.sst.min &&
    value <= PROBE_SCALES.sst.max
  );
}
