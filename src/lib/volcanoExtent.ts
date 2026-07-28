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
  latitudeDegrees: number;
  longitudeDegrees: number;
  country: string | null;
  primaryType: string | null;
  elevationMeters: number | null;
  /** Source calendar year; negative values are BCE and null is unavailable. */
  lastEruptionYear: number | null;
  /** Human-readable companion; consumers should retain the raw year above. */
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
  /** Coverage of the native GVP summit-elevation field within matched records. */
  elevationCoverage: {
    presentCount: number;
    missingCount: number;
    /** Null when there are no matched records, rather than an invented 0%. */
    fraction: number | null;
  };
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

/**
 * Format a record's source coordinates for the place workflow. Coordinates
 * remain decimal degrees and retain hemisphere explicitly; this is a display
 * label, not a claim about positional accuracy.
 */
export function volcanoCoordinateLabel(
  record: Pick<VolcanoExtentRecord, "latitudeDegrees" | "longitudeDegrees">
): string {
  return `${coordinatePart(record.latitudeDegrees, "N", "S")}, ${coordinatePart(
    record.longitudeDegrees,
    "E",
    "W"
  )}`;
}

function contextFor(
  records: VolcanoExtentRecord[],
  suppliedRecordCount: number,
  bounds: SearchBoundingBox | null,
  crossesAntimeridian: boolean,
  status: VolcanoExtentContext["status"]
): VolcanoExtentContext {
  const presentElevationCount = records.filter(
    (record) =>
      record.elevationMeters !== null && Number.isFinite(record.elevationMeters)
  ).length;
  return {
    kind: "gvp-search-extent-context",
    status,
    suppliedRecordCount,
    matchedRecordCount: records.length,
    elevationCoverage: {
      presentCount: presentElevationCount,
      missingCount: records.length - presentElevationCount,
      fraction:
        records.length === 0 ? null : presentElevationCount / records.length,
    },
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
    latitudeDegrees: volcano.lat,
    longitudeDegrees: volcano.lon,
    country: volcano.country,
    primaryType: volcano.type,
    elevationMeters: volcano.elevation,
    lastEruptionYear: volcano.lastEruptionYear,
    lastEruptionText: lastEruptionLabel(volcano.lastEruptionYear),
    volcanoNumber,
    sourceUrl: gvpVolcanoUrl(volcanoNumber),
    region: sourceRecord?.region ?? null,
    subregion: sourceRecord?.subregion ?? null,
    tectonicSetting: sourceRecord?.tectonicSetting ?? null,
  };
}

function coordinatePart(
  value: number,
  positiveHemisphere: string,
  negativeHemisphere: string
): string {
  const hemisphere = value < 0 ? negativeHemisphere : positiveHemisphere;
  return `${Math.abs(value).toFixed(2)}° ${hemisphere}`;
}
