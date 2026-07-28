import { GVP_VOLCANO_SOURCE, VOLCANO_CONTEXT_UNITS } from "./volcanoContext";
import { lastEruptionLabel, type Volcano } from "./volcanoes";

/**
 * Descriptive GVP volcano records whose coordinates fall in a searched
 * geographic extent. This is a spatial inventory, not a hazard assessment or
 * a statement about conditions inside the selected boundary.
 */

export type SearchBoundingBox = readonly [
  south: number,
  north: number,
  west: number,
  east: number,
];

export interface VolcanoExtentRecord {
  name: string;
  country: string | null;
  primaryType: string | null;
  elevationMeters: number | null;
  lastEruptionText: string;
  volcanoNumber: number | null;
  sourceUrl: string | null;
  region: string | null;
  subregion: string | null;
  /** Verbatim GVP label; not a causal interpretation. */
  tectonicSetting: string | null;
}

export interface VolcanoExtentContext {
  kind: "gvp-search-extent-context";
  status: "available" | "invalid-bounds";
  /** All valid records in the supplied local GVP-derived dataset. */
  suppliedRecordCount: number;
  /** Records whose coordinates lie inside the search bounding box. */
  matchedRecordCount: number;
  records: readonly VolcanoExtentRecord[];
  bounds: SearchBoundingBox | null;
  crossesAntimeridian: boolean;
  geographicCoverage: string;
  provenance: typeof GVP_VOLCANO_SOURCE;
  units: typeof VOLCANO_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Uses the search result bounding box, not the exact selected boundary.",
  "Includes only volcano records supplied by the bundled GVP-derived file.",
  "Does not forecast eruptions, rank hazards, score risk, or infer causes.",
  "Region, subregion, and tectonic setting are retained GVP catalog labels, not classifications inferred by RoamingEye.",
] as const;

export function gvpVolcanoUrl(volcanoNumber: number | null): string | null {
  return volcanoNumber === null || !Number.isInteger(volcanoNumber)
    ? null
    : `https://volcano.si.edu/volcano.cfm?vn=${volcanoNumber}`;
}

/**
 * Filter GVP-derived records to a Nominatim search bounding box. Longitude
 * membership intentionally supports west > east, the conventional way to
 * represent a box that crosses the antimeridian.
 */
export function volcanoesInSearchExtent(
  volcanoes: readonly Volcano[],
  bounds: SearchBoundingBox | null
): VolcanoExtentContext {
  if (!isValidBounds(bounds)) {
    return contextFor([], volcanoes.length, null, false, "invalid-bounds");
  }

  const [south, north, west, east] = bounds;
  const crossesAntimeridian = west > east;
  const records = volcanoes
    .filter(
      (volcano) =>
        volcano.lat >= south &&
        volcano.lat <= north &&
        longitudeInBounds(volcano.lon, west, east)
    )
    .map(toExtentRecord)
    .sort((a, b) => a.name.localeCompare(b.name, "en-US"));

  return contextFor(
    records,
    volcanoes.length,
    bounds,
    crossesAntimeridian,
    "available"
  );
}

function contextFor(
  records: VolcanoExtentRecord[],
  suppliedRecordCount: number,
  bounds: SearchBoundingBox | null,
  crossesAntimeridian: boolean,
  status: VolcanoExtentContext["status"]
): VolcanoExtentContext {
  return {
    kind: "gvp-search-extent-context",
    status,
    suppliedRecordCount,
    matchedRecordCount: records.length,
    records,
    bounds,
    crossesAntimeridian,
    geographicCoverage:
      status === "available"
        ? "Coordinates inside the search result bounding box; the exact selected boundary is not tested."
        : "Search result bounding box was missing or invalid; no geographic comparison was made.",
    provenance: GVP_VOLCANO_SOURCE,
    units: VOLCANO_CONTEXT_UNITS,
    limitations: LIMITATIONS,
  };
}

function isValidBounds(
  bounds: SearchBoundingBox | null
): bounds is SearchBoundingBox {
  if (!bounds) return false;
  const [south, north, west, east] = bounds;
  return (
    [south, north, west, east].every(Number.isFinite) &&
    south >= -90 &&
    north <= 90 &&
    west >= -180 &&
    west <= 180 &&
    east >= -180 &&
    east <= 180 &&
    south <= north
  );
}

function longitudeInBounds(lon: number, west: number, east: number): boolean {
  return west <= east ? lon >= west && lon <= east : lon >= west || lon <= east;
}

function toExtentRecord(volcano: Volcano): VolcanoExtentRecord {
  const sourceRecord = volcano.sourceRecord;
  const volcanoNumber = sourceRecord?.volcanoNumber ?? null;
  return {
    name: volcano.name,
    country: volcano.country,
    primaryType: volcano.type,
    elevationMeters: volcano.elevation,
    lastEruptionText: lastEruptionLabel(volcano.lastEruptionYear),
    volcanoNumber,
    sourceUrl: gvpVolcanoUrl(volcanoNumber),
    region: sourceRecord?.region ?? null,
    subregion: sourceRecord?.subregion ?? null,
    tectonicSetting: sourceRecord?.tectonicSetting ?? null,
  };
}
