import type { Position } from "./geojson";
import { plateBoundaryClass, type PlateBoundary } from "./plates";
import type { PlateBoundaryClass } from "./plates";
import type { SearchBoundingBox } from "./volcanoExtent";

/**
 * Source-aware geographic context for the configured plate-boundary overlay.
 *
 * Bird's model is supplied here as digitized linework, rather than plate
 * polygons or a boundary-type classification. A match says only that one or
 * more supplied line segments intersect the search result's bounding box.
 */
export const BIRD_2003_PLATE_BOUNDARY_SOURCE = {
  name: "Bird (2003) plate-boundary model",
  citation:
    "Bird, P. (2003), An updated digital model of plate boundaries, Geochemistry, Geophysics, Geosystems 4(3)",
  doi: "10.1029/2001GC000252",
  url: "https://doi.org/10.1029/2001GC000252",
  digitization: "open tectonicplates GeoJSON digitization",
  digitizationUrl: "https://github.com/fraxen/tectonicplates",
  localFile: "public/data/plate-boundaries.geojson",
  geometry: "supplied GeoJSON polyline segments",
  dataMonth: null,
  temporalCoverage: "static source; no data month",
} as const;

export const PLATE_BOUNDARY_CONTEXT_UNITS = {
  coordinates: "decimal degrees (longitude, latitude)",
  matchedSegments: "count of supplied polyline segments",
} as const;

export type PlateBoundaryExtentStatus =
  "available" | "no-usable-boundaries" | "invalid-bounds";

export interface MatchedPlateBoundary {
  /** Source plate-pair label, or null when the supplied feature was unlabeled. */
  name: string | null;
  /** Number of source segments that intersect the search bounding box. */
  matchedSegmentCount: number;
  /**
   * The source's own boundary-type marking for this step, passed through from
   * PB2002's `Type` field. Never derived from geometry: "not-marked" is the
   * source leaving the field blank, and "unavailable" is a supplied feature
   * that carried no step attributes at all.
   */
  sourceClass: PlateBoundaryClass;
}

export interface PlateBoundaryExtentCoverage {
  status: PlateBoundaryExtentStatus;
  suppliedBoundaryCount: number;
  usableBoundaryCount: number;
  matchedBoundaryCount: number;
  matchedSegmentCount: number;
  /**
   * Matched boundaries the source itself marked as subduction steps. PB2002
   * marks subduction only and leaves the field blank on every other step, so
   * the remainder is "not marked by the source", never "measured as
   * non-subduction".
   */
  matchedSubductionBoundaryCount: number;
  /** True only when the supplied polylines were compared with valid bounds. */
  boundsTested: boolean;
}

export interface PlateBoundaryExtentContext {
  kind: "bird-2003-plate-boundary-extent";
  isForecast: false;
  bounds: SearchBoundingBox | null;
  crossesAntimeridian: boolean;
  matchingBoundaries: readonly MatchedPlateBoundary[];
  coverage: PlateBoundaryExtentCoverage;
  geographicCoverage: string;
  provenance: typeof BIRD_2003_PLATE_BOUNDARY_SOURCE;
  units: typeof PLATE_BOUNDARY_CONTEXT_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Uses the search result bounding box, not the exact selected boundary.",
  "Reports only intersections with the supplied Bird (2003) digitized polyline segments; it does not identify a nearest boundary or calculate distance.",
  "The configured linework marks subduction steps only and leaves that field blank elsewhere; it supplies no further boundary type, and no plate polygons, motion, deformation, activity, or a data month.",
  "A match is descriptive map context only and does not infer tectonic setting, seismicity, volcanism, hazard, risk, cause, or a forecast.",
] as const;

/**
 * Select configured Bird (2003) overlay segments that intersect a search
 * bounding box. The comparison includes segment crossings whose endpoints are
 * both outside the box and supports conventional antimeridian-spanning bounds.
 */
export function plateBoundariesInSearchExtent(
  boundaries: readonly PlateBoundary[],
  bounds: SearchBoundingBox | null
): PlateBoundaryExtentContext {
  const usable = boundaries.filter(hasUsablePolyline);
  if (!isValidBounds(bounds)) {
    return contextFor(
      boundaries.length,
      usable.length,
      null,
      false,
      [],
      "invalid-bounds"
    );
  }

  const [, , west, east] = bounds;
  const matchingBoundaries = usable
    .map((boundary) => ({
      name: boundary.name.trim() || null,
      matchedSegmentCount: matchingSegmentCount(boundary.points, bounds),
      // Carried through from the supplied step rather than recomputed: the
      // marking is the source's, and the extent test must not appear to have
      // classified anything.
      sourceClass: plateBoundaryClass(boundary),
    }))
    .filter((boundary) => boundary.matchedSegmentCount > 0)
    .sort(
      (first, second) =>
        (first.name ?? "").localeCompare(second.name ?? "", "en-US") ||
        second.matchedSegmentCount - first.matchedSegmentCount
    );

  return contextFor(
    boundaries.length,
    usable.length,
    bounds,
    west > east,
    matchingBoundaries,
    usable.length === 0 ? "no-usable-boundaries" : "available"
  );
}

/**
 * Say how many matched boundaries carry the source's own subduction marking.
 *
 * PB2002 sets its `Type` field to "subduction" on subduction steps and leaves
 * it blank on every other step, so the blank is the absence of a marking, not
 * a measurement of a non-subduction boundary. The sentence states that second
 * half explicitly: a reader given only "2 of 5" would otherwise complete the
 * dichotomy themselves and read the other three as divergent or transform,
 * which the supplied model does not say.
 *
 * Returns null when no boundary matched, or when every matched feature carried
 * no step attributes at all (a hand-built or older file), so the panel never
 * reports a marking tally it has no field to support.
 */
export function subductionMarkingText(
  context: PlateBoundaryExtentContext
): string | null {
  const { coverage, matchingBoundaries } = context;
  if (coverage.status !== "available" || coverage.matchedBoundaryCount === 0) {
    return null;
  }
  if (
    matchingBoundaries.every(({ sourceClass }) => sourceClass === "unavailable")
  ) {
    return null;
  }
  const total = coverage.matchedBoundaryCount;
  const noun = total === 1 ? "boundary" : "boundaries";
  return `Bird (2003) applies its subduction marking to ${coverage.matchedSubductionBoundaryCount} of ${total} matched ${noun}; PB2002 marks subduction steps only and leaves the field blank elsewhere, so an unmarked boundary records no assignment rather than a non-subduction boundary.`;
}

function contextFor(
  suppliedBoundaryCount: number,
  usableBoundaryCount: number,
  bounds: SearchBoundingBox | null,
  crossesAntimeridian: boolean,
  matchingBoundaries: MatchedPlateBoundary[],
  status: PlateBoundaryExtentStatus
): PlateBoundaryExtentContext {
  const matchedSegmentCount = matchingBoundaries.reduce(
    (total, boundary) => total + boundary.matchedSegmentCount,
    0
  );
  return {
    kind: "bird-2003-plate-boundary-extent",
    isForecast: false,
    bounds,
    crossesAntimeridian,
    matchingBoundaries,
    coverage: {
      status,
      suppliedBoundaryCount,
      usableBoundaryCount,
      matchedBoundaryCount: matchingBoundaries.length,
      matchedSegmentCount,
      matchedSubductionBoundaryCount: matchingBoundaries.filter(
        ({ sourceClass }) => sourceClass === "subduction"
      ).length,
      boundsTested: status !== "invalid-bounds",
    },
    geographicCoverage:
      status === "invalid-bounds"
        ? "Search result bounding box was missing or invalid; supplied linework was not compared geographically."
        : "Supplied polyline segments were tested against the search result bounding box; the exact selected boundary is not tested.",
    provenance: BIRD_2003_PLATE_BOUNDARY_SOURCE,
    units: PLATE_BOUNDARY_CONTEXT_UNITS,
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

function hasUsablePolyline(boundary: PlateBoundary): boolean {
  return (
    Array.isArray(boundary.points) &&
    boundary.points.length >= 2 &&
    boundary.points.every(isValidPosition)
  );
}

function isValidPosition(position: Position): boolean {
  return (
    Array.isArray(position) &&
    Number.isFinite(position[0]) &&
    Number.isFinite(position[1]) &&
    Math.abs(position[0]) <= 180 &&
    Math.abs(position[1]) <= 90
  );
}

function matchingSegmentCount(
  points: readonly Position[],
  [south, north, west, east]: SearchBoundingBox
): number {
  const right = east < west ? east + 360 : east;
  let count = 0;
  for (let index = 0; index + 1 < points.length; index++) {
    const [start, end] = continuousSegment(
      points[index],
      points[index + 1],
      west
    );
    if (
      [-360, 0, 360].some((shift) =>
        segmentIntersectsBox(
          [start[0] + shift, start[1]],
          [end[0] + shift, end[1]],
          west,
          right,
          south,
          north
        )
      )
    ) {
      count++;
    }
  }
  return count;
}

function continuousSegment(
  start: Position,
  end: Position,
  west: number
): [Position, Position] {
  const framedStart: Position = [longitudeInFrame(start[0], west), start[1]];
  const framedEnd: Position = [
    longitudeInFrame(end[0], framedStart[0]),
    end[1],
  ];
  return [framedStart, framedEnd];
}

function longitudeInFrame(longitude: number, reference: number): number {
  let framed = longitude;
  while (framed - reference > 180) framed -= 360;
  while (framed - reference < -180) framed += 360;
  return framed;
}

function segmentIntersectsBox(
  start: Position,
  end: Position,
  west: number,
  east: number,
  south: number,
  north: number
): boolean {
  if (pointInBox(start, west, east, south, north)) return true;
  if (pointInBox(end, west, east, south, north)) return true;

  const southwest: Position = [west, south];
  const southeast: Position = [east, south];
  const northeast: Position = [east, north];
  const northwest: Position = [west, north];
  return (
    segmentsIntersect(start, end, southwest, southeast) ||
    segmentsIntersect(start, end, southeast, northeast) ||
    segmentsIntersect(start, end, northeast, northwest) ||
    segmentsIntersect(start, end, northwest, southwest)
  );
}

function pointInBox(
  [longitude, latitude]: Position,
  west: number,
  east: number,
  south: number,
  north: number
): boolean {
  return (
    longitude >= west &&
    longitude <= east &&
    latitude >= south &&
    latitude <= north
  );
}

function segmentsIntersect(
  firstStart: Position,
  firstEnd: Position,
  secondStart: Position,
  secondEnd: Position
): boolean {
  const first = orientation(firstStart, firstEnd, secondStart);
  const second = orientation(firstStart, firstEnd, secondEnd);
  const third = orientation(secondStart, secondEnd, firstStart);
  const fourth = orientation(secondStart, secondEnd, firstEnd);

  return (
    (((first > 0 && second < 0) || (first < 0 && second > 0)) &&
      ((third > 0 && fourth < 0) || (third < 0 && fourth > 0))) ||
    (first === 0 && pointOnSegment(secondStart, firstStart, firstEnd)) ||
    (second === 0 && pointOnSegment(secondEnd, firstStart, firstEnd)) ||
    (third === 0 && pointOnSegment(firstStart, secondStart, secondEnd)) ||
    (fourth === 0 && pointOnSegment(firstEnd, secondStart, secondEnd))
  );
}

function orientation(start: Position, end: Position, point: Position): number {
  const cross =
    (end[0] - start[0]) * (point[1] - start[1]) -
    (end[1] - start[1]) * (point[0] - start[0]);
  return Math.abs(cross) < 1e-12 ? 0 : Math.sign(cross);
}

function pointOnSegment(
  point: Position,
  start: Position,
  end: Position
): boolean {
  return (
    point[0] >= Math.min(start[0], end[0]) &&
    point[0] <= Math.max(start[0], end[0]) &&
    point[1] >= Math.min(start[1], end[1]) &&
    point[1] <= Math.max(start[1], end[1])
  );
}
