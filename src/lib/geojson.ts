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

/** Test whether a longitude/latitude point falls inside a polygon or multipolygon. */
export function geometryContains(
  geometry: GeoGeometry,
  lat: number,
  lon: number
): boolean {
  return preparedPolygons(geometry).some(({ outer, holes }) => {
    const reference = averageLon(outer);
    const framedLon = lonInFrame(lon, reference);
    return (
      pointInRing(framedLon, lat, outer) &&
      !holes.some((hole) => pointInRing(framedLon, lat, hole))
    );
  });
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
