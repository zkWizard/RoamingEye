import type { Position } from "./geojson";
import { distinctPlateBoundaries } from "./plateBoundaryDuplication";
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
  /**
   * The digitization credited for this step, passed through verbatim from
   * PB2002's `Source` field. Null when the supplied feature carried no credit,
   * which is the absence of a credit rather than a claim that Bird digitized
   * the step himself.
   */
  sourceCitation: string | null;
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
  /**
   * Distinct `Source` credits carried by the matched boundaries. PB2002 is a
   * compilation of separately sourced digitizations, so this counts the
   * surveys behind the matched linework, not the boundaries themselves.
   */
  distinctSourceCitationCount: number;
  /** Matched boundaries whose supplied feature carried no `Source` credit. */
  matchedUncreditedBoundaryCount: number;
  /**
   * Supplied features that crossed the extent but repeat a trace already
   * counted, verbatim. These are excluded from `matchedBoundaryCount`,
   * `matchedSegmentCount`, and `matchingBoundaries`: the bundled file's
   * antimeridian split supplies a few steps twice, which is a redundancy in the
   * data rather than a second boundary. `suppliedBoundaryCount` and
   * `usableBoundaryCount` stay per-feature and are unaffected.
   */
  repeatedMatchedFeatureCount: number;
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
  const matched = usable
    .map((boundary) => ({
      boundary,
      matchedSegmentCount: matchingSegmentCount(boundary.points, bounds),
    }))
    .filter((entry) => entry.matchedSegmentCount > 0);

  // The bundled GeoJSON supplies six antimeridian-crossing steps twice, byte
  // for byte (see plateBoundaryDuplication.ts). Both copies match whatever the
  // first one matches, so counting per supplied feature listed one mapped trace
  // as two boundaries and doubled its segment total. Count each distinct trace
  // once; the supplied and usable totals below stay per-feature, because those
  // describe the file rather than the geology.
  //
  // Geometry alone is not enough to call two features one trace. PB2002's own
  // attributes match across all six bundled repeats, but a copy filed under a
  // different plate pair or credited to a different survey is a source-labelling
  // question, not a redundancy — collapsing it would silently drop a credit the
  // panel is meant to show. Such a pair is kept as two, exactly as before.
  //
  // distinctPlateBoundaries keeps first occurrences in supply order, so walking
  // it with a cursor identifies the repeats without relying on object identity
  // being unique across the supplied array.
  const distinct = distinctPlateBoundaries(
    matched.map((entry) => entry.boundary)
  );
  let cursor = 0;
  let repeatedMatchedFeatureCount = 0;
  const distinctMatches: typeof matched = [];
  for (const entry of matched) {
    if (cursor < distinct.length && entry.boundary === distinct[cursor]) {
      cursor += 1;
      distinctMatches.push(entry);
      continue;
    }
    const twin = distinctMatches.find(
      (candidate) =>
        isSameTrace(candidate.boundary, entry.boundary) &&
        isSameAttribution(candidate.boundary, entry.boundary)
    );
    if (twin) {
      repeatedMatchedFeatureCount += 1;
      continue;
    }
    distinctMatches.push(entry);
  }

  const matchingBoundaries = distinctMatches
    .map(({ boundary, matchedSegmentCount }) => ({
      name: boundary.name.trim() || null,
      matchedSegmentCount,
      // Carried through from the supplied step rather than recomputed: the
      // marking is the source's, and the extent test must not appear to have
      // classified anything.
      sourceClass: plateBoundaryClass(boundary),
      // Also a passthrough: PB2002 compiles separately sourced digitizations,
      // so the credit belongs to the step, not to the compilation.
      sourceCitation: boundary.step?.sourceCitation ?? null,
    }))
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
    usable.length === 0 ? "no-usable-boundaries" : "available",
    repeatedMatchedFeatureCount
  );
}

/**
 * Whether two supplied features carry the same vertex sequence, in either
 * direction. Delegates to the duplication helper so there is one definition of
 * trace identity in the codebase rather than a second, drifting copy.
 */
function isSameTrace(first: PlateBoundary, second: PlateBoundary): boolean {
  return distinctPlateBoundaries([first, second]).length === 1;
}

/**
 * Whether the source filed two features identically in everything this panel
 * renders: the plate-pair label, the `Type` marking, and the `Source` credit.
 * Only then is a shared trace a redundancy in the distribution rather than a
 * disagreement in the source worth showing.
 */
function isSameAttribution(
  first: PlateBoundary,
  second: PlateBoundary
): boolean {
  return (
    first.name.trim() === second.name.trim() &&
    plateBoundaryClass(first) === plateBoundaryClass(second) &&
    (first.step?.sourceCitation ?? null) ===
      (second.step?.sourceCitation ?? null)
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

/**
 * Name the digitizations credited for the matched linework.
 *
 * PB2002 is a compilation: its `Source` field credits a different survey per
 * step, and 129 of the 241 bundled features (53.5%) are credited to work other
 * than Bird's own digitizing, spanning 1978-2002. Every other surface in the
 * app cites Bird (2003), which is the compilation credit rather than the
 * survey that drew the lines a reader is looking at, so this restores the
 * per-step credit the parser already carries.
 *
 * Credits are listed most-used first (ties alphabetical) and quoted verbatim:
 * they are source strings, not normalized names, and several embed their own
 * punctuation. At most two are named, because a wide extent can match eleven.
 *
 * Returns null when nothing matched or when no matched boundary carried a
 * credit at all, so the panel never implies a credit it was not given.
 */
export function digitizationCreditText(
  context: PlateBoundaryExtentContext
): string | null {
  const { coverage, matchingBoundaries } = context;
  if (coverage.status !== "available" || coverage.matchedBoundaryCount === 0) {
    return null;
  }
  const tally = creditTally(matchingBoundaries);
  if (tally.length === 0) return null;

  const named = tally.slice(0, 2).map((entry) => `"${entry.citation}"`);
  const credits = named.length === 1 ? named[0] : `${named[0]} and ${named[1]}`;
  const attribution =
    tally.length > 2
      ? `the matched linework here carries ${tally.length} distinct source credits, most often ${credits}`
      : `the matched linework here is credited to ${credits}`;
  // Only stated when some matched boundary does carry a credit: an entirely
  // uncredited match returns null above rather than reporting a shortfall.
  const uncredited = coverage.matchedUncreditedBoundaryCount;
  const shortfall =
    uncredited > 0
      ? ` ${uncredited} matched ${uncredited === 1 ? "boundary carries" : "boundaries carry"} no source credit.`
      : "";
  // No "not Bird (2003) alone" tail: roughly half the steps are credited to
  // Bird's own earlier digitizing, where that clause reads as a contradiction
  // ('credited to "by Peter Bird, 1999", not Bird (2003) alone'). Naming the
  // credit already lets a reader see whose survey drew these lines.
  return `Bird (2003) compiles separately sourced digitizations rather than one uniform survey; ${attribution}.${shortfall}`;
}

/**
 * Say when the bundled file supplied a crossing trace more than once.
 *
 * PB2002 is distributed here as GeoJSON, and that conversion splits every
 * boundary step that crosses the antimeridian into an eastern and a western
 * half. For six steps it emits a second, byte-identical copy of the western
 * half; all of the source's own attributes match across the copies, so these
 * are one mapped trace supplied twice rather than two digitizations of the same
 * margin (see plateBoundaryDuplication.ts). The extent match now collapses
 * them, which is why a reader is told: the counts above would otherwise differ
 * from the boundaries actually drawn on the globe, and the difference belongs
 * to the file rather than to the geology.
 *
 * Reported as a supplied-data observation only. It says nothing about boundary
 * type, motion, deformation, activity, or hazard, and a repeat is not an error
 * in the PB2002 model — the redundancy is in this distribution of it.
 *
 * Returns null when nothing repeated, so the common extent stays silent.
 */
export function suppliedRepeatText(
  context: PlateBoundaryExtentContext
): string | null {
  const { coverage } = context;
  if (coverage.status !== "available") return null;
  const repeats = coverage.repeatedMatchedFeatureCount;
  if (repeats === 0) return null;
  // Names what was set aside rather than only that something was: a bare
  // "duplicates were removed" leaves a reader unable to tell whether the trace
  // itself was dropped.
  const features =
    repeats === 1
      ? "1 supplied feature here repeats"
      : `${repeats} supplied features here repeat`;
  return `The bundled GeoJSON splits antimeridian-crossing steps and supplies a few of the halves twice: ${features} a trace already listed, verbatim, and ${repeats === 1 ? "was" : "were"} counted once rather than twice.`;
}

/**
 * Distinct `Source` credits among matched boundaries, most-used first with
 * alphabetical ties, so the order never depends on input order.
 */
function creditTally(
  matchingBoundaries: readonly MatchedPlateBoundary[]
): { citation: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { sourceCitation } of matchingBoundaries) {
    if (!sourceCitation) continue;
    counts.set(sourceCitation, (counts.get(sourceCitation) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([citation, count]) => ({ citation, count }))
    .sort(
      (first, second) =>
        second.count - first.count ||
        first.citation.localeCompare(second.citation, "en-US")
    );
}

function contextFor(
  suppliedBoundaryCount: number,
  usableBoundaryCount: number,
  bounds: SearchBoundingBox | null,
  crossesAntimeridian: boolean,
  matchingBoundaries: MatchedPlateBoundary[],
  status: PlateBoundaryExtentStatus,
  repeatedMatchedFeatureCount = 0
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
      distinctSourceCitationCount: creditTally(matchingBoundaries).length,
      matchedUncreditedBoundaryCount: matchingBoundaries.filter(
        ({ sourceCitation }) => !sourceCitation
      ).length,
      repeatedMatchedFeatureCount,
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
