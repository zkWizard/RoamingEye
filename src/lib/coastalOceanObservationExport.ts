import { isAreaGeometry, type GeoGeometry } from "./geojson";
import {
  createCoastalOceanObservation,
  type CoastalOceanObservation,
  type CoastalOceanObservationInput,
} from "./marineObservation";

export const COASTAL_OCEAN_OBSERVATION_EXPORT_SCHEMA =
  "roamingeye-coastal-ocean-observation-export/v1" as const;

export interface CoastalOceanObservationExportInput {
  /** Exact searched or drawn area represented by the supplied observations. */
  geography: GeoGeometry;
  observation: CoastalOceanObservationInput;
  /** ISO 8601 instant when RoamingEye assembled this export. */
  generatedIso: string;
  toolVersion: string;
}

export interface CoastalOceanObservationExport {
  schema: typeof COASTAL_OCEAN_OBSERVATION_EXPORT_SCHEMA;
  kind: "coastal-ocean-observation-export";
  geography: {
    kind: "supplied-area-boundary";
    geometry: GeoGeometry;
  };
  observation: CoastalOceanObservation;
  generated: {
    iso: string;
    tool: "RoamingEye";
    version: string;
  };
  interpretation: {
    seaSurfaceTemperatureIsBiologicalEvidence: false;
    monthAlignmentEstablishesAssociation: false;
    includesForecast: false;
  };
  limitations: readonly [
    "Sea surface temperature is a physical observation, not biological evidence.",
    "The supplied boundary is retained as geography; SST does not identify habitat or organism distribution.",
    "Coverage records retain their own methods and unavailable states and must not be treated as interchangeable.",
    "Matching observation months establish timing only, not association or causation.",
  ];
}

const EXPORT_LIMITATIONS = [
  "Sea surface temperature is a physical observation, not biological evidence.",
  "The supplied boundary is retained as geography; SST does not identify habitat or organism distribution.",
  "Coverage records retain their own methods and unavailable states and must not be treated as interchangeable.",
  "Matching observation months establish timing only, not association or causation.",
] as const;

/**
 * Create a whitelist-only, JSON-ready record from RoamingEye's coastal
 * observation path. Values, units, source citations, months, coverage, and
 * unavailable reasons come from the underlying observation summaries.
 */
export function createCoastalOceanObservationExport(
  input: CoastalOceanObservationExportInput
): CoastalOceanObservationExport {
  if (!isAreaGeometry(input.geography)) {
    throw new Error(
      "A Polygon or MultiPolygon geography is required for coastal export."
    );
  }
  if (!isIsoInstant(input.generatedIso)) {
    throw new Error("generatedIso must be an ISO 8601 instant.");
  }
  if (!input.toolVersion.trim()) {
    throw new Error("toolVersion is required.");
  }

  return {
    schema: COASTAL_OCEAN_OBSERVATION_EXPORT_SCHEMA,
    kind: "coastal-ocean-observation-export",
    geography: {
      kind: "supplied-area-boundary",
      geometry: structuredClone(input.geography),
    },
    observation: createCoastalOceanObservation(input.observation),
    generated: {
      iso: input.generatedIso,
      tool: "RoamingEye",
      version: input.toolVersion,
    },
    interpretation: {
      seaSurfaceTemperatureIsBiologicalEvidence: false,
      monthAlignmentEstablishesAssociation: false,
      includesForecast: false,
    },
    limitations: EXPORT_LIMITATIONS,
  };
}

export function serializeCoastalOceanObservationExport(
  input: CoastalOceanObservationExportInput
): string {
  return `${JSON.stringify(createCoastalOceanObservationExport(input), null, 2)}\n`;
}

function isIsoInstant(value: string): boolean {
  if (!value.trim()) return false;
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) && new Date(epoch).toISOString() === value;
}
