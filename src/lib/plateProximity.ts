import { BIRD_2003_PLATE_BOUNDARY_SOURCE } from "./plateBoundaryContext";
import {
  plateBoundaryPairLabel,
  plateBoundarySubductionReading,
} from "./plateBoundaryHover";
import type { Position } from "./geojson";
import type { PlateBoundary } from "./plates";

/**
 * Nearest-boundary distance context for the configured Bird (2003) plate-
 * boundary overlay.
 *
 * The sibling module {@link ./plateBoundaryContext} reports which supplied
 * polyline segments intersect a search bounding box; its limitations note that
 * it "does not identify a nearest boundary or calculate distance". This module
 * fills exactly that gap: given a query point it measures the great-circle
 * distance to the closest supplied polyline segment and returns the segment's
 * plate-pair label and the nearest point on that segment.
 *
 * Descriptive geometry only. The distance is to the nearest *digitized*
 * linework, not to a true plate margin, and it is never a tectonic-setting
 * classification, a seismicity/volcanism association, or a hazard statement.
 * A short distance does not imply an active or dangerous boundary.
 */

export const PLATE_PROXIMITY_UNITS = {
  coordinates: "decimal degrees",
  distance: "km (great-circle distance to nearest supplied polyline segment)",
} as const;

export interface PlateProximityQuery {
  latitude: number;
  longitude: number;
}

/**
 * Build the query a place readout uses: the coordinates the geocoder returned
 * for the searched place.
 *
 * This exists so the module owns the meaning of its own anchor. A place search
 * yields two different points — the geocoder's representative point for the
 * place, and the centre of the bounding box it also returns — and one panel
 * quotes distances from both. This module's distance and the nearest-volcano
 * distance are measured from the geocoded point; the seismicity search is
 * centred on the extent midpoint instead (see `searchExtentEarthquakeQuery` in
 * earthquakeContext.ts). The two are routinely far apart, because a bounding
 * box tracks the shape of the matched administrative boundary rather than where
 * the place itself sits: across sixteen sampled Nominatim results they were
 * more than 1 km apart for eleven and more than 10 km apart for seven, reaching
 * 982 km for "Tokyo", whose extent runs out to the Ogasawara Islands.
 *
 * {@link nearestPlateBoundaryStatement} therefore names this point instead of
 * calling it "the search centre", which reads as the extent midpoint it is not.
 */
export function placePointPlateQuery(
  latitude: number,
  longitude: number
): PlateProximityQuery {
  return { latitude, longitude };
}

export type PlateProximityQueryField = "latitude" | "longitude";

export type PlateProximityStatus =
  "available" | "no-usable-boundaries" | "invalid-query";

export interface NearestPlateBoundary {
  /** Source plate-pair label, or null when the supplied feature was unlabeled. */
  name: string | null;
  /** Great-circle distance from the query point to the nearest segment. */
  distanceKm: number;
  /** The closest point on that segment, in decimal degrees. */
  nearestPoint: {
    latitude: number;
    longitude: number;
  };
}

/**
 * Coverage is scoped to the boundaries supplied to this helper. Counts make an
 * empty or partially usable overlay explicit rather than implying completeness.
 */
export interface PlateProximityCoverage {
  status: PlateProximityStatus;
  suppliedBoundaryCount: number;
  usableBoundaryCount: number;
  evaluatedSegmentCount: number;
  invalidQueryFields: PlateProximityQueryField[];
}

export interface PlateProximityContext {
  kind: "bird-2003-nearest-plate-boundary";
  isForecast: false;
  query: PlateProximityQuery;
  nearest: NearestPlateBoundary | null;
  coverage: PlateProximityCoverage;
  provenance: typeof BIRD_2003_PLATE_BOUNDARY_SOURCE;
  units: typeof PLATE_PROXIMITY_UNITS;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Distance is to the nearest supplied Bird (2003) digitized polyline segment, not to a true plate-margin position; digitization and sampling density bound the accuracy.",
  "The configured linework marks subduction steps only; apart from that marking it supplies no boundary type, and no plate polygons, motion, deformation, activity, or data month.",
  "Proximity is descriptive geometry only; it does not classify tectonic setting or infer seismicity, volcanism, hazard, risk, cause, or a forecast. A short distance does not imply an active or dangerous boundary.",
  "Reports the nearest segment among the supplied boundaries only; an empty or partial overlay yields no or incomplete nearest-boundary context.",
] as const;

const DEG2RAD = Math.PI / 180;
const RAD2DEG = 180 / Math.PI;
const EARTH_RADIUS_KM = 6_371;

/**
 * Measure the great-circle distance from a query point to the nearest supplied
 * plate-boundary polyline segment. Ties resolve to the earliest-supplied
 * boundary and segment so the result is deterministic.
 */
export function nearestPlateBoundary(
  boundaries: readonly PlateBoundary[],
  query: PlateProximityQuery
): PlateProximityContext {
  const invalidQueryFields = queryValidationErrors(query);
  const usable = boundaries.filter(hasUsablePolyline);

  if (invalidQueryFields.length > 0) {
    return contextFor(query, null, {
      status: "invalid-query",
      suppliedBoundaryCount: boundaries.length,
      usableBoundaryCount: usable.length,
      evaluatedSegmentCount: 0,
      invalidQueryFields,
    });
  }

  const point = toUnit(query.latitude, query.longitude);
  let evaluatedSegmentCount = 0;
  let best: NearestPlateBoundary | null = null;
  let bestAngle = Infinity;

  for (const boundary of usable) {
    const name = boundary.name.trim() || null;
    for (let index = 0; index + 1 < boundary.points.length; index++) {
      evaluatedSegmentCount++;
      const start = toUnit(
        boundary.points[index][1],
        boundary.points[index][0]
      );
      const end = toUnit(
        boundary.points[index + 1][1],
        boundary.points[index + 1][0]
      );
      const { angle, foot } = angularDistanceToSegment(point, start, end);
      // Strict improvement only: on a tie the earlier boundary/segment wins,
      // which — because `usable` preserves supply order — is deterministic.
      if (angle < bestAngle - 1e-12) {
        bestAngle = angle;
        const { latitude, longitude } = fromUnit(foot);
        best = {
          name,
          distanceKm: angle * EARTH_RADIUS_KM,
          nearestPoint: { latitude, longitude },
        };
      }
    }
  }

  return contextFor(query, best, {
    status: usable.length === 0 ? "no-usable-boundaries" : "available",
    suppliedBoundaryCount: boundaries.length,
    usableBoundaryCount: usable.length,
    evaluatedSegmentCount,
    invalidQueryFields,
  });
}

/**
 * One-sentence nearest-boundary statement for a place panel.
 *
 * Returns null whenever the measurement was not made — an unusable query or an
 * empty overlay — so a caller keeps its own wording for those cases rather than
 * printing a distance that was never computed.
 *
 * The boundary is named through {@link plateBoundaryPairLabel}, the same helper
 * the globe tooltip and the panel's crossing list use, so one boundary reads
 * identically everywhere it appears. The sentence states what the distance is
 * measured to — digitized linework — because a reader will otherwise take it for
 * a distance to a mapped plate margin.
 *
 * It states what the distance is measured FROM for the same reason. The point
 * is the one {@link placePointPlateQuery} supplies — the geocoder's coordinates
 * for the place — and the panel around this sentence also quotes seismicity
 * distances measured from the centre of the search extent, a genuinely
 * different point (see that constructor for how far apart the two run). Calling
 * this one "the search centre", as it read before, made the two anchors
 * indistinguishable and named this point as the midpoint it is not.
 *
 * That label carries PB2002's subduction polarity in its delimiter, and this is
 * the one surface where nothing else decodes it: the panel's polarity paragraph
 * (subductionPolarityText in plateBoundaryContext.ts) describes the boundaries
 * that intersect the search extent, so it is silent in exactly the case this
 * sentence renders — no crossing at all, which is the common case for a
 * city-sized extent. The descent is therefore read back here, through the same
 * {@link plateBoundarySubductionReading} the tooltip uses so the two cannot
 * drift, and stated as the model's own label reading rather than a measurement.
 *
 * It also states that the search is unbounded, because the sibling proximity
 * readout in the same panel is not: nearestVolcanoStatement searches a fixed
 * NEAREST_VOLCANO_RADIUS_KM (100 km) and quotes that radius in both of its
 * branches, so a reader meeting two "nearest X" sentences side by side has no
 * way to tell that only one of them was capped. This search evaluates every
 * supplied polyline and returns the global minimum at any range, which makes
 * the figure routinely large: sampling sixteen major cities against the bundled
 * linework gives a median nearest distance of 1,514 km, ten of them beyond
 * 1,000 km, and 2,619 km for Chicago. Those are exactly the places this
 * sentence renders for — it appears only when nothing crosses the extent — so
 * without the bound stated, a four-digit distance reads as though a nearer
 * boundary was searched for and missed rather than as the model's true nearest.
 */
export function nearestPlateBoundaryStatement(
  context: PlateProximityContext
): string | null {
  const { status } = context.coverage;
  if (status === "invalid-query" || status === "no-usable-boundaries") {
    return null;
  }
  if (context.nearest === null) return null;
  const { name, distanceKm } = context.nearest;
  // Silent for a non-subducting or undecodable label rather than reporting an
  // absence: PB2002 marks subduction steps only, so no marking is no
  // assignment, not a statement that the boundary does not subduct.
  const reading = plateBoundarySubductionReading(name);
  const descent =
    reading === null
      ? ""
      : ` That label's delimiter records which plate descends: ${reading}, read back as the model wrote it rather than measured.`;
  return `Nearest supplied boundary polyline: ${plateBoundaryPairLabel(name)}, ${formatDistanceKm(distanceKm)} km from the geocoded place point.${descent} Great-circle distance to Bird (2003) digitized linework, not to a mapped plate margin, and measured from the coordinates the geocoder returned for this place rather than from the centre of its bounding box. The search applies no distance limit, so this is the closest polyline anywhere in the supplied model rather than one found within a set radius; apart from the source's own subduction marking, the model carries no boundary type, motion, activity, or hazard.`;
}

/**
 * Whole kilometres from 10 km up, one decimal below. PB2002 is supplied as
 * digitized steps sampled at a fraction of a degree, so finer precision would
 * imply a positional accuracy the linework does not carry.
 */
function formatDistanceKm(distanceKm: number): string {
  return distanceKm >= 10
    ? String(Math.round(distanceKm))
    : distanceKm.toFixed(1);
}

function contextFor(
  query: PlateProximityQuery,
  nearest: NearestPlateBoundary | null,
  coverage: PlateProximityCoverage
): PlateProximityContext {
  return {
    kind: "bird-2003-nearest-plate-boundary",
    isForecast: false,
    query,
    nearest,
    coverage,
    provenance: BIRD_2003_PLATE_BOUNDARY_SOURCE,
    units: PLATE_PROXIMITY_UNITS,
    limitations: LIMITATIONS,
  };
}

function queryValidationErrors(
  query: PlateProximityQuery
): PlateProximityQueryField[] {
  const invalid: PlateProximityQueryField[] = [];
  if (!Number.isFinite(query.latitude) || Math.abs(query.latitude) > 90) {
    invalid.push("latitude");
  }
  if (!Number.isFinite(query.longitude) || Math.abs(query.longitude) > 180) {
    invalid.push("longitude");
  }
  return invalid;
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

// ---------------------------------------------------------------------------
// Spherical geometry. Points are handled as unit vectors so distances,
// projections, and the arc-containment test are invariant to the choice of
// axes; only dot/cross products and angles between them are used.
// ---------------------------------------------------------------------------

type Vec3 = readonly [number, number, number];

function toUnit(latDeg: number, lonDeg: number): Vec3 {
  const lat = latDeg * DEG2RAD;
  const lon = lonDeg * DEG2RAD;
  const cosLat = Math.cos(lat);
  return [cosLat * Math.cos(lon), cosLat * Math.sin(lon), Math.sin(lat)];
}

function fromUnit(v: Vec3): { latitude: number; longitude: number } {
  const [x, y, z] = v;
  const latitude = Math.asin(clamp(z, -1, 1)) * RAD2DEG;
  const longitude = Math.atan2(y, x) * RAD2DEG;
  return { latitude, longitude };
}

/**
 * Angular distance (radians) from point `p` to the minor arc between unit
 * vectors `a` and `b`, plus the closest unit point on that arc. Falls back to
 * the nearer endpoint for degenerate segments (coincident/antipodal endpoints)
 * and when `p` is a pole of the segment's great circle.
 */
function angularDistanceToSegment(
  p: Vec3,
  a: Vec3,
  b: Vec3
): { angle: number; foot: Vec3 } {
  const toA = angleBetween(p, a);
  const toB = angleBetween(p, b);
  const nearerEndpoint = (): { angle: number; foot: Vec3 } =>
    toA <= toB ? { angle: toA, foot: a } : { angle: toB, foot: b };

  const normal = cross(a, b);
  const normalLength = magnitude(normal);
  if (normalLength < 1e-9) return nearerEndpoint();

  const unitNormal = scale(normal, 1 / normalLength);
  // Project p onto the segment's great-circle plane, then normalize: this is
  // the closest point on the (infinite) great circle to p, on p's own side.
  const height = dot(p, unitNormal);
  const projected = subtract(p, scale(unitNormal, height));
  const projectedLength = magnitude(projected);
  if (projectedLength < 1e-9) return nearerEndpoint();

  const foot = scale(projected, 1 / projectedLength);
  // The foot lies on the minor arc a→b iff walking a→foot→b covers exactly the
  // a→b arc length (within tolerance); otherwise the nearest point is an end.
  const arc = angleBetween(a, b);
  if (angleBetween(a, foot) + angleBetween(foot, b) <= arc + 1e-9) {
    return { angle: angleBetween(p, foot), foot };
  }
  return nearerEndpoint();
}

function angleBetween(a: Vec3, b: Vec3): number {
  return Math.acos(clamp(dot(a, b), -1, 1));
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function magnitude(a: Vec3): number {
  return Math.sqrt(dot(a, a));
}

function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}
