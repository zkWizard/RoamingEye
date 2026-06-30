import type { Position } from "./geojson";

/**
 * A fast point-in-country lookup built from the bundled Natural Earth borders.
 * Used by the hover readout to name the territory under the cursor without a
 * network round-trip. Pure logic (the ray-casting test and index builder) is
 * unit-tested.
 */

interface Polygon {
  outer: Position[];
  holes: Position[][];
}

interface CountryFeature {
  name: string;
  polygons: Polygon[];
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

export interface CountryIndex {
  /** Name of the country containing the point, or null. */
  lookup(lat: number, lon: number): string | null;
}

interface RawGeometry {
  type: string;
  coordinates: unknown;
}
interface RawFeature {
  properties?: { name?: string };
  geometry?: RawGeometry;
}
interface RawCollection {
  features: RawFeature[];
}

/** Standard even-odd ray-casting test for a point inside a ring of [lon, lat]. */
export function pointInRing(
  lon: number,
  lat: number,
  ring: Position[]
): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const xi = ring[i][0];
    const yi = ring[i][1];
    const xj = ring[j][0];
    const yj = ring[j][1];
    const intersect =
      yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi;
    if (intersect) inside = !inside;
  }
  return inside;
}

function polygonsFromGeometry(geometry: RawGeometry): Polygon[] {
  const polygons: Polygon[] = [];
  if (geometry.type === "Polygon") {
    const rings = geometry.coordinates as Position[][];
    polygons.push({ outer: rings[0], holes: rings.slice(1) });
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates as Position[][][]) {
      polygons.push({ outer: poly[0], holes: poly.slice(1) });
    }
  }
  return polygons;
}

function bboxOf(polygons: Polygon[]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const poly of polygons) {
    for (const [lon, lat] of poly.outer) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  return [minLon, minLat, maxLon, maxLat];
}

export function buildCountryIndex(collection: RawCollection): CountryIndex {
  const features: CountryFeature[] = collection.features
    .filter((f): f is Required<RawFeature> =>
      Boolean(f.properties?.name && f.geometry)
    )
    .map((f) => {
      const polygons = polygonsFromGeometry(f.geometry);
      return {
        name: f.properties.name as string,
        polygons,
        bbox: bboxOf(polygons),
      };
    });

  return {
    lookup(lat, lon) {
      for (const feature of features) {
        const [minLon, minLat, maxLon, maxLat] = feature.bbox;
        if (lon < minLon || lon > maxLon || lat < minLat || lat > maxLat) {
          continue;
        }
        for (const poly of feature.polygons) {
          if (
            pointInRing(lon, lat, poly.outer) &&
            !poly.holes.some((hole) => pointInRing(lon, lat, hole))
          ) {
            return feature.name;
          }
        }
      }
      return null;
    },
  };
}

export async function loadCountryIndex(
  url = "/data/countries.geojson"
): Promise<CountryIndex> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`country index: ${res.status}`);
  const collection = (await res.json()) as RawCollection;
  return buildCountryIndex(collection);
}
