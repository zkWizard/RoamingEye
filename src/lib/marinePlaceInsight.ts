import {
  SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
  summarizeMarineCoverage,
  type MarineCoverageSummary,
  type MarineCoverageGeography,
  type SourceImageDimensions,
} from "./marineCoverage";
import {
  describeMarineBoundarySstSupport,
  summarizeMarineBoundarySstSupport,
  type MarineBoundarySstSupportSummary,
} from "./marineBoundarySstSupport";
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

export type MarineBoundarySstUnavailableReason =
  "source-colormap-unavailable" | "boundary-sampling-failed";

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
  /** Searched boundary identity supplied by the place-search workflow. */
  geography?: MarineCoverageGeography;
}

export interface MarinePlaceInsightReading {
  id: typeof MARINE_PLACE_METRIC.id;
  value: string;
  detail: string;
  kind: "observed-boundary-sea-surface-temperature";
  availability: "available" | "no-usable-sst" | "sampling-unavailable";
  marineBiologyObservation: false;
  isForecast: false;
  dataMonth: YearMonth;
  sampledGeography: {
    kind: "searched-area-boundary";
    label: string;
  };
  observedValue: number | null;
  /** Exact sampler coverage; null only when sampling did not complete. */
  validFraction: number | null;
  /** Rendered image provenance; null only when sampling did not complete. */
  sourceImageDimensions: SourceImageDimensions | null;
  source: typeof SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE;
  /** Searched geography retained even when SST sampling is unavailable. */
  geography: MarineCoverageGeography;
  /** Structured sampler state for UI/export consumers; null when sampling failed. */
  coverage: MarineCoverageSummary | null;
  /**
   * How much of the searched boundary actually carried SST, and what the
   * reported mean therefore averages over. SST is undefined over land, so a
   * searched place is usually mostly outside the product's domain.
   */
  spatialSupport: MarineBoundarySstSupportSummary;
  observationStatus:
    | "observed"
    | "no-sst-coverage"
    | "invalid-sample"
    | "source-unavailable"
    | "sampling-failed";
  /** Exact unavailable state for UI/export consumers; null for usable SST. */
  unavailableReason:
    | "zero-sst-coverage"
    | "invalid-month"
    | "invalid-coverage"
    | "invalid-source-image-dimensions"
    | "invalid-sst-value"
    | MarineBoundarySstUnavailableReason
    | null;
}

/**
 * Format a boundary SST observation without turning partial coverage into a
 * coastal, biological, ecological, causal, or forecast claim.
 */
export function marineBoundarySstReading(
  input: MarineBoundarySstInput
): MarinePlaceInsightReading {
  const geographyLabel = normalizedGeographyLabel(input.geographyLabel);
  const geography: MarineCoverageGeography = input.geography ?? {
    kind: "boundary",
    label: geographyLabel,
  };
  const coverage = summarizeMarineCoverage({
    dataMonth: input.dataMonth,
    // A boundary can span water, land, coast, clouds, or gaps. The sampler's
    // valid fraction cannot identify which, so retain an explicit unknown
    // surface context instead of inferring a coastal footprint from SST.
    footprint: "unknown",
    validFraction: input.validFraction,
    sourceImageDimensions: input.sourceImageDimensions,
    geography,
  });
  const unavailableReason = marineBoundaryUnavailableReason(
    input.observedValue,
    coverage
  );
  const usable =
    unavailableReason === null && isSstSourceValue(input.observedValue);
  const month = formatYm(input.dataMonth);
  const image = coverage.sourceImageDimensions
    ? `rendered source image ${coverage.sourceImageDimensions.width} x ${coverage.sourceImageDimensions.height} px`
    : unavailableReason === "invalid-source-image-dimensions"
      ? "rendered source image dimensions invalid"
      : "rendered source image dimensions not supplied";
  const source = `${coverage.source.source.shortName} v${coverage.source.source.version}`;
  // Grade the share as the sampler supplied it, not as `summarizeMarineCoverage`
  // nulls it out on rejection: an invalid fraction was still supplied, and
  // reporting it as "not supplied" would hide which of the two happened.
  const spatialSupport = summarizeMarineBoundarySstSupport(input.validFraction);

  return {
    id: MARINE_PLACE_METRIC.id,
    value:
      input.observedValue !== null && usable
        ? `${input.observedValue.toFixed(1)} ${coverage.source.sourceUnit}`
        : "No usable SST observation",
    detail: `${month} approximate mean SST observation sampled within ${geographyLabel}; ${describeMarineBoundarySstSupport(spatialSupport)}; ${image}; source ${source}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    availability: usable ? "available" : "no-usable-sst",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth: input.dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: geographyLabel,
    },
    observedValue: usable ? input.observedValue : null,
    validFraction: coverage.coverage.validFraction,
    sourceImageDimensions: coverage.sourceImageDimensions,
    source: coverage.source,
    geography,
    coverage,
    spatialSupport,
    observationStatus: usable
      ? "observed"
      : coverage.coverage.status === "no-sst-coverage"
        ? "no-sst-coverage"
        : "invalid-sample",
    unavailableReason,
  };
}

/** Surface a workflow failure without relabeling it as absent SST. */
export function unavailableMarineBoundarySstReading(
  dataMonth: YearMonth,
  geographyInput: string | MarineCoverageGeography,
  reason: MarineBoundarySstUnavailableReason = "source-colormap-unavailable"
): MarinePlaceInsightReading {
  const geography: MarineCoverageGeography =
    typeof geographyInput === "string"
      ? {
          kind: "boundary",
          label: normalizedGeographyLabel(geographyInput),
        }
      : geographyInput;
  const sampledGeographyLabel = normalizedGeographyLabel(
    geography.label ?? geography.kind
  );
  const place =
    typeof geographyInput === "string"
      ? sampledGeographyLabel
      : geography.label === null
        ? geography.kind
        : `${geography.kind} “${geography.label}”`;
  const unavailableDetail =
    reason === "source-colormap-unavailable"
      ? "could not be sampled from the published source colormap"
      : "could not be sampled for the searched boundary";
  return {
    id: MARINE_PLACE_METRIC.id,
    value: "Unavailable",
    detail: `${formatYm(dataMonth)} SST observation for ${place} ${unavailableDetail}; source ${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.shortName} v${SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE.source.version}; not a marine-biology observation`,
    kind: "observed-boundary-sea-surface-temperature",
    availability: "sampling-unavailable",
    marineBiologyObservation: false,
    isForecast: false,
    dataMonth,
    sampledGeography: {
      kind: "searched-area-boundary",
      label: sampledGeographyLabel,
    },
    observedValue: null,
    validFraction: null,
    sourceImageDimensions: null,
    source: SEA_SURFACE_TEMPERATURE_COVERAGE_SOURCE,
    geography,
    coverage: null,
    // Sampling never produced a share, so none is reported. A failed workflow
    // must not be recorded as a boundary that held no water.
    spatialSupport: summarizeMarineBoundarySstSupport(null),
    observationStatus:
      reason === "source-colormap-unavailable"
        ? "source-unavailable"
        : "sampling-failed",
    unavailableReason: reason,
  };
}

function normalizedGeographyLabel(label: string): string {
  const normalized = label.trim();
  return normalized || "unknown searched area";
}

function marineBoundaryUnavailableReason(
  observedValue: number | null,
  coverage: MarineCoverageSummary
): MarinePlaceInsightReading["unavailableReason"] {
  if (coverage.coverage.reason === "zero-sst-coverage") {
    return "zero-sst-coverage";
  }
  if (coverage.coverage.reason === "invalid-month") {
    return "invalid-month";
  }
  if (coverage.coverage.status === "invalid") {
    return "invalid-coverage";
  }
  if (coverage.sourceImageDimensions === null) {
    return "invalid-source-image-dimensions";
  }
  if (!isSstSourceValue(observedValue)) {
    return "invalid-sst-value";
  }
  return null;
}

function isSstSourceValue(value: number | null): value is number {
  return (
    value !== null &&
    Number.isFinite(value) &&
    value >= PROBE_SCALES.sst.min &&
    value <= PROBE_SCALES.sst.max
  );
}
