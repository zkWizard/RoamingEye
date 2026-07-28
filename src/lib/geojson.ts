/**
 * Minimal GeoJSON helpers for turning boundary geometries into polylines we can
 * draw on the globe. Pure and dependency-free, so it's unit-tested directly.
 */

/** A `[longitude, latitude]` coordinate pair. */
export type Position = [number, number];

export interface GeoGeometry {
  type: string;
  coordinates: unknown;
}

/** Geographic bounds of an area geometry. */
export interface GeometryBounds {
  south: number;
  north: number;
  west: number;
  east: number;
}

/** How a boundary sample was spatially represented. */
export type GeometrySamplingStrategy = "boundary-grid" | "boundary-point";

/**
 * A bounded set of locations that can honestly represent a place boundary.
 * A single point is only permitted when the search result coordinate itself
 * lies in the boundary; callers must label it as a point estimate, not a
 * regional mean.
 */
export interface GeometrySamplingPlan {
  points: { lat: number; lon: number }[];
  strategy: GeometrySamplingStrategy;
}

/** A deterministic, masked, refined sampling layout for an area geometry. */
export interface RefinedGeometrySamplingPlan extends GeometrySamplingPlan {
  /** Grid-cell centres proven to lie inside the input geometry. */
  strategy: "boundary-grid";
  /** Cells along each axis in the grid that supplied the retained points. */
  gridSize: number;
  /** All grid cells evaluated in the final refinement pass. */
  candidatePointCount: number;
  /** Interior cells before the stable point-limit guard was applied. */
  interiorPointCount: number;
  /** True when the plan retained a representative subset for bounded work. */
  pointLimitApplied: boolean;
}

export interface GeometrySamplingOptions {
  /** Aim for at least this many masked cells when geometry permits. */
  minPoints?: number;
  /** Tighter upper bound for a refinement axis; never exceeds the hard cap. */
  maxGridSize?: number;
  /** Tighter upper bound for retained imagery-sampler points. */
  maxPoints?: number;
}

/** Minimum interior support sought before a sparse geometry grid is refined. */
export const DEFAULT_GEOMETRY_MIN_POINTS = 16;

/** A 64 x 64 geometry-mask pass is the bounded last-resort refinement. */
export const MAX_GEOMETRY_GRID_SIZE = 64;

/** Matches the existing 28 x 28 regional probing ceiling. */
export const MAX_GEOMETRY_SAMPLE_POINTS = 784;

type Polygon = Position[][];

interface PreparedPolygon {
  outer: Position[];
  holes: Position[][];
}

function areaPolygons(geometry: GeoGeometry): Polygon[] {
  if (geometry.type === "Polygon") {
    const polygon = geometry.coordinates as Polygon;
    return polygon.length > 0 ? [polygon] : [];
  }
  if (geometry.type === "MultiPolygon") {
    return (geometry.coordinates as Polygon[]).filter(
      (polygon) => polygon.length > 0
    );
  }
  return [];
}

function normalizeLon(lon: number): number {
  return ((((lon + 180) % 360) + 360) % 360) - 180;
}

function unwrapRing(ring: Position[]): Position[] {
  if (ring.length === 0) return [];
  const out: Position[] = [[normalizeLon(ring[0][0]), ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    const prevLon = out[i - 1][0];
    let lon = normalizeLon(ring[i][0]);
    while (lon - prevLon > 180) lon -= 360;
    while (lon - prevLon < -180) lon += 360;
    out.push([lon, ring[i][1]]);
  }
  return out;
}

function averageLon(ring: Position[]): number {
  return ring.reduce((sum, [lon]) => sum + lon, 0) / ring.length;
}

function shiftRingToReference(ring: Position[], reference: number): Position[] {
  if (ring.length === 0) return [];
  let shift = 0;
  const mean = averageLon(ring);
  while (mean + shift - reference > 180) shift -= 360;
  while (mean + shift - reference < -180) shift += 360;
  return ring.map(([lon, lat]) => [lon + shift, lat]);
}

function preparedPolygons(geometry: GeoGeometry): PreparedPolygon[] {
  return areaPolygons(geometry).map(([outer, ...holes]) => {
    const unwrappedOuter = unwrapRing(outer);
    const reference = averageLon(unwrappedOuter);
    return {
      outer: unwrappedOuter,
      holes: holes.map((hole) =>
        shiftRingToReference(unwrapRing(hole), reference)
      ),
    };
  });
}

function lonInFrame(lon: number, reference: number): number {
  let framed = normalizeLon(lon);
  while (framed - reference > 180) framed -= 360;
  while (framed - reference < -180) framed += 360;
  return framed;
}

function shortArcLonBounds(lons: number[]): { west: number; east: number } {
  const unique = [...new Set(lons.map(normalizeLon))];
  if (unique.length < 2) {
    const lon = unique[0] ?? 0;
    return { west: lon, east: lon };
  }
  const circle = unique
    .map((lon) => (lon < 0 ? lon + 360 : lon))
    .sort((a, b) => a - b);
  let west360 = circle[0];
  let largestGap = circle[0] + 360 - circle[circle.length - 1];
  for (let i = 0; i + 1 < circle.length; i++) {
    const gap = circle[i + 1] - circle[i];
    if (gap > largestGap) {
      largestGap = gap;
      west360 = circle[i + 1];
    }
  }
  const width = 360 - largestGap;
  const west = west360 > 180 ? west360 - 360 : west360;
  return {
    west,
    east: west + width,
  };
}

/** Whether a geometry represents an area that can be sampled meaningfully. */
export function isAreaGeometry(geometry: GeoGeometry | null): boolean {
  return !!geometry && areaPolygons(geometry).length > 0;
}

/** Bounds of all outer polygon rings, or null when no area is present. */
export function geometryBounds(geometry: GeoGeometry): GeometryBounds | null {
  const polygons = preparedPolygons(geometry);
  if (polygons.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  const lons: number[] = [];
  for (const { outer } of polygons) {
    for (const [lon, lat] of outer) {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      lons.push(lon);
    }
  }
  const lonBounds = shortArcLonBounds(lons);
  return Number.isFinite(south) &&
    south < north &&
    lonBounds.west < lonBounds.east
    ? { south, north, ...lonBounds }
    : null;
}

function pointInRing(lon: number, lat: number, ring: Position[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    const crosses =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (crosses) inside = !inside;
  }
  return inside;
}

function preparedPolygonContains(
  polygon: PreparedPolygon,
  lat: number,
  lon: number
): boolean {
  const reference = averageLon(polygon.outer);
  const framedLon = lonInFrame(lon, reference);
  return (
    pointInRing(framedLon, lat, polygon.outer) &&
    !polygon.holes.some((hole) => pointInRing(framedLon, lat, hole))
  );
}

/** Test whether a longitude/latitude point falls inside a polygon or multipolygon. */
export function geometryContains(
  geometry: GeoGeometry,
  lat: number,
  lon: number
): boolean {
  return preparedPolygons(geometry).some((polygon) =>
    preparedPolygonContains(polygon, lat, lon)
  );
}

interface GeometryGridCandidate {
  point: { lat: number; lon: number };
  polygonIndex: number;
  gridIndex: number;
}

function geometryGridCandidates(
  geometry: GeoGeometry,
  n: number
): GeometryGridCandidate[] {
  const bounds = geometryBounds(geometry);
  if (!bounds || n < 1) return [];
  const polygons = preparedPolygons(geometry);
  const candidates: GeometryGridCandidate[] = [];
  for (let row = 0; row < n; row++) {
    const lat =
      bounds.south + ((row + 0.5) / n) * (bounds.north - bounds.south);
    for (let col = 0; col < n; col++) {
      const lon = bounds.west + ((col + 0.5) / n) * (bounds.east - bounds.west);
      const polygonIndex = polygons.findIndex((polygon) =>
        preparedPolygonContains(polygon, lat, lon)
      );
      if (polygonIndex >= 0) {
        candidates.push({
          point: { lat, lon },
          polygonIndex,
          gridIndex: row * n + col,
        });
      }
    }
  }
  return candidates;
}

/**
 * Cell centres in a bounds grid, masked to the exact input geometry. For
 * antimeridian geometries, longitudes stay in the bounds' continuous frame so
 * regional pixel mapping preserves the short arc.
 */
export function geometryGridPoints(
  geometry: GeoGeometry,
  n: number
): { lat: number; lon: number }[] {
  return geometryGridCandidates(geometry, n).map(({ point }) => point);
}

function positiveInteger(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 1 ? Math.floor(value) : fallback;
}

function evenlySpacedPoints<T>(points: T[], maxPoints: number): T[] {
  if (points.length <= maxPoints) return points;
  // Selecting by evenly spaced ranks keeps the result deterministic and
  // spreads the retained samples over the row-major grid rather than taking
  // the first part of a place boundary.
  return Array.from(
    { length: maxPoints },
    (_, index) =>
      points[Math.floor(((index + 0.5) * points.length) / maxPoints)]
  );
}

function componentBalancedPoints(
  candidates: GeometryGridCandidate[],
  maxPoints: number
): { lat: number; lon: number }[] {
  if (candidates.length <= maxPoints) {
    return candidates.map(({ point }) => point);
  }
  const groups = new Map<number, GeometryGridCandidate[]>();
  for (const candidate of candidates) {
    const group = groups.get(candidate.polygonIndex) ?? [];
    group.push(candidate);
    groups.set(candidate.polygonIndex, group);
  }
  if (groups.size > maxPoints) {
    return evenlySpacedPoints(candidates, maxPoints).map(({ point }) => point);
  }

  const allocations = [...groups].map(([polygonIndex, points]) => ({
    polygonIndex,
    points,
    count: 1,
  }));
  for (
    let remaining = maxPoints - allocations.length;
    remaining > 0;
    remaining--
  ) {
    allocations.sort(
      (a, b) =>
        b.points.length / b.count - a.points.length / a.count ||
        a.polygonIndex - b.polygonIndex
    );
    allocations[0].count++;
  }
  return allocations
    .flatMap(({ points, count }) => evenlySpacedPoints(points, count))
    .sort((a, b) => a.gridIndex - b.gridIndex)
    .map(({ point }) => point);
}

/**
 * Build a bounded interior grid for sampling an exact Polygon or
 * MultiPolygon. A fixed coarse grid can miss valid narrow, fragmented, or
 * slanted boundaries entirely. This progressively refines only while fewer
 * than `minPoints` cell centres fall inside, then caps retained points at the
 * established regional probing budget. Points remain in the geometry bounds'
 * continuous longitude frame, including across the antimeridian.
 *
 * This is still a cell-centre approximation: it does not estimate fractional
 * coverage of boundary cells. Callers receive the pre-limit interior count so
 * downstream provenance can distinguish a sparse mask from a capped layout.
 */
export function geometrySamplingPlan(
  geometry: GeoGeometry,
  n: number,
  fallback: { lat: number; lon: number }
): GeometrySamplingPlan | null;
export function geometrySamplingPlan(
  geometry: GeoGeometry,
  initialGridSize: number,
  options?: GeometrySamplingOptions
): RefinedGeometrySamplingPlan | null;
export function geometrySamplingPlan(
  geometry: GeoGeometry,
  initialGridSize: number,
  fallbackOrOptions: { lat: number; lon: number } | GeometrySamplingOptions = {}
): GeometrySamplingPlan | RefinedGeometrySamplingPlan | null {
  if ("lat" in fallbackOrOptions && "lon" in fallbackOrOptions) {
    // Spatial-honesty mode: a fixed grid at the caller's resolution, with an
    // explicitly point-level fallback only when the search coordinate itself
    // lies inside the exact boundary. No refinement happens here; callers that
    // want the bounded refinement pass options (or nothing) instead.
    const fallback = fallbackOrOptions;
    const points = geometryGridPoints(geometry, initialGridSize);
    if (points.length > 0) return { points, strategy: "boundary-grid" };
    return geometryContains(geometry, fallback.lat, fallback.lon)
      ? { points: [fallback], strategy: "boundary-point" }
      : null;
  }
  const options = fallbackOrOptions;
  if (!geometryBounds(geometry)) return null;

  const maxGridSize = Math.min(
    MAX_GEOMETRY_GRID_SIZE,
    positiveInteger(
      options.maxGridSize ?? MAX_GEOMETRY_GRID_SIZE,
      MAX_GEOMETRY_GRID_SIZE
    )
  );
  const maxPoints = Math.min(
    MAX_GEOMETRY_SAMPLE_POINTS,
    positiveInteger(
      options.maxPoints ?? MAX_GEOMETRY_SAMPLE_POINTS,
      MAX_GEOMETRY_SAMPLE_POINTS
    )
  );
  const minPoints = Math.min(
    maxPoints,
    positiveInteger(
      options.minPoints ?? DEFAULT_GEOMETRY_MIN_POINTS,
      DEFAULT_GEOMETRY_MIN_POINTS
    )
  );
  let gridSize = Math.min(maxGridSize, positiveInteger(initialGridSize, 1));
  let candidates = geometryGridCandidates(geometry, gridSize);

  while (candidates.length < minPoints && gridSize < maxGridSize) {
    gridSize = Math.min(maxGridSize, gridSize * 2);
    candidates = geometryGridCandidates(geometry, gridSize);
  }

  return {
    points: componentBalancedPoints(candidates, maxPoints),
    strategy: "boundary-grid",
    gridSize,
    candidatePointCount: gridSize * gridSize,
    interiorPointCount: candidates.length,
    pointLimitApplied: candidates.length > maxPoints,
  };
}

/**
 * Flatten any Polygon / MultiPolygon / LineString / MultiLineString geometry
 * into a flat list of rings (each ring an array of [lon, lat] positions).
 */
export function geometryToRings(geom: GeoGeometry): Position[][] {
  const rings: Position[][] = [];
  switch (geom.type) {
    case "Polygon":
      for (const ring of geom.coordinates as Position[][]) rings.push(ring);
      break;
    case "MultiPolygon":
      for (const poly of geom.coordinates as Position[][][]) {
        for (const ring of poly) rings.push(ring);
      }
      break;
    case "LineString":
      rings.push(geom.coordinates as Position[]);
      break;
    case "MultiLineString":
      for (const line of geom.coordinates as Position[][]) rings.push(line);
      break;
  }
  return rings;
}
