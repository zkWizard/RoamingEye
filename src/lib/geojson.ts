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
