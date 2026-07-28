import type { PlateBoundary } from "./plates";

export const PLATE_LINEWORK_SOURCE = {
  title: "An updated digital model of plate boundaries",
  author: "Peter Bird",
  publicationYear: 2003,
  doi: "10.1029/2001GC000252",
  derivedDataset: "open tectonicplates GeoJSON, slimmed for RoamingEye",
} as const;

export interface PlateBoundaryCoordinateRange {
  min: number | null;
  max: number | null;
}

export type PlateBoundaryCoverageStatus = "available" | "unavailable";

/**
 * Describes the supplied linework, not plate-motion rate, boundary type,
 * seismic hazard, or completeness beyond the configured Bird (2003) dataset.
 */
export interface PlateBoundaryContext {
  kind: "plate-boundary-linework-context";
  coverage: {
    status: PlateBoundaryCoverageStatus;
    suppliedLineCount: number;
    usableLineCount: number;
    namedLineCount: number;
    unnamedLineCount: number;
    pointCount: number;
    segmentCount: number;
    longitude: PlateBoundaryCoordinateRange;
    latitude: PlateBoundaryCoordinateRange;
  };
  boundaryNames: string[];
  provenance: typeof PLATE_LINEWORK_SOURCE;
  units: {
    coordinates: "decimal degrees";
    counts: "line, point, and segment counts";
  };
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Coverage describes only the supplied, usable Bird (2003) linework and does not establish present-day boundary completeness.",
  "Line and segment counts depend on source digitization and are not measures of boundary length or tectonic activity.",
  "The source linework does not provide a hazard assessment, forecast, plate-motion rate, or boundary-type classification in this contract.",
] as const;

/** Build source-aware coverage for parsed plate-boundary linework. */
export function plateLineworkCoverage(
  boundaries: readonly PlateBoundary[]
): PlateBoundaryContext {
  const usable = boundaries.filter(isUsableBoundary);
  const coordinates = usable.flatMap((boundary) => boundary.points);
  const named = usable.filter((boundary) => boundary.name.trim().length > 0);

  return {
    kind: "plate-boundary-linework-context",
    coverage: {
      status: usable.length > 0 ? "available" : "unavailable",
      suppliedLineCount: boundaries.length,
      usableLineCount: usable.length,
      namedLineCount: named.length,
      unnamedLineCount: usable.length - named.length,
      pointCount: coordinates.length,
      segmentCount: usable.reduce(
        (count, boundary) => count + boundary.points.length - 1,
        0
      ),
      longitude: rangeFor(coordinates.map(([longitude]) => longitude)),
      latitude: rangeFor(coordinates.map(([, latitude]) => latitude)),
    },
    boundaryNames: [
      ...new Set(named.map((boundary) => boundary.name.trim())),
    ].sort((first, second) => first.localeCompare(second)),
    provenance: PLATE_LINEWORK_SOURCE,
    units: {
      coordinates: "decimal degrees",
      counts: "line, point, and segment counts",
    },
    limitations: LIMITATIONS,
  };
}

function isUsableBoundary(boundary: PlateBoundary): boolean {
  return (
    boundary.points.length >= 2 &&
    boundary.points.every(
      ([longitude, latitude]) =>
        Number.isFinite(longitude) &&
        Math.abs(longitude) <= 180 &&
        Number.isFinite(latitude) &&
        Math.abs(latitude) <= 90
    )
  );
}

function rangeFor(values: readonly number[]): PlateBoundaryCoordinateRange {
  if (values.length === 0) return { min: null, max: null };
  return { min: Math.min(...values), max: Math.max(...values) };
}
