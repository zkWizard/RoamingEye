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

type Polygon = Position[][];

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

/** Whether a geometry represents an area that can be sampled meaningfully. */
export function isAreaGeometry(geometry: GeoGeometry | null): boolean {
  return !!geometry && areaPolygons(geometry).length > 0;
}

/** Bounds of all outer polygon rings, or null when no area is present. */
export function geometryBounds(geometry: GeoGeometry): GeometryBounds | null {
  const polygons = areaPolygons(geometry);
  if (polygons.length === 0) return null;
  let south = Infinity;
  let north = -Infinity;
  let west = Infinity;
  let east = -Infinity;
  for (const [outer] of polygons) {
    for (const [lon, lat] of outer) {
      south = Math.min(south, lat);
      north = Math.max(north, lat);
      west = Math.min(west, lon);
      east = Math.max(east, lon);
    }
  }
  return Number.isFinite(south) && south < north && west < east
    ? { south, north, west, east }
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

/** Test whether a longitude/latitude point falls inside a polygon or multipolygon. */
export function geometryContains(
  geometry: GeoGeometry,
  lat: number,
  lon: number
): boolean {
  return areaPolygons(geometry).some(
    ([outer, ...holes]) =>
      pointInRing(lon, lat, outer) &&
      !holes.some((hole) => pointInRing(lon, lat, hole))
  );
}

/** Cell centres in a bounds grid, masked to the exact input geometry. */
export function geometryGridPoints(
  geometry: GeoGeometry,
  n: number
): { lat: number; lon: number }[] {
  const bounds = geometryBounds(geometry);
  if (!bounds || n < 1) return [];
  const points: { lat: number; lon: number }[] = [];
  for (let row = 0; row < n; row++) {
    const lat =
      bounds.south + ((row + 0.5) / n) * (bounds.north - bounds.south);
    for (let col = 0; col < n; col++) {
      const lon = bounds.west + ((col + 0.5) / n) * (bounds.east - bounds.west);
      if (geometryContains(geometry, lat, lon)) points.push({ lat, lon });
    }
  }
  return points;
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
