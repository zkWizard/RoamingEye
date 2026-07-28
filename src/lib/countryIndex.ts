import type { Position } from "./geojson";
import { fetchJson } from "./net";

/**
 * Fast point-in-region lookups built from the bundled Natural Earth borders:
 * countries (admin-0) and states/provinces (admin-1). Used by the hover
 * readout to name the territory under the cursor without a network
 * round-trip. Pure logic (the ray-casting test and index builder) is
 * unit-tested.
 */

interface Polygon {
  outer: Position[];
  holes: Position[][];
  bbox: [number, number, number, number]; // [minLon, minLat, maxLon, maxLat]
}

interface IndexedFeature<T> {
  value: T;
  polygons: Polygon[];
}

export interface RegionIndex<T> {
  /** Value of the region containing the point, or null. */
  lookup(lat: number, lon: number): T | null;
}

/** Name of the country containing a point, or null. */
export type CountryIndex = RegionIndex<string>;

/** An admin-1 hit: the province/state and the country it belongs to. */
export interface Admin1Region {
  name: string;
  country: string;
}

interface RawGeometry {
  type: string;
  coordinates: unknown;
}
interface RawFeature {
  properties?: { name?: string; admin?: string };
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
    polygons.push(indexPolygon(rings));
  } else if (geometry.type === "MultiPolygon") {
    for (const poly of geometry.coordinates as Position[][][]) {
      polygons.push(indexPolygon(poly));
    }
  }
  return polygons;
}

function unwrapRing(ring: Position[], reference?: number): Position[] {
  if (ring.length === 0) return [];
  const unwrapped: Position[] = [[ring[0][0], ring[0][1]]];
  for (let i = 1; i < ring.length; i++) {
    let lon = ring[i][0];
    const previous = unwrapped[i - 1][0];
    while (lon - previous > 180) lon -= 360;
    while (lon - previous < -180) lon += 360;
    unwrapped.push([lon, ring[i][1]]);
  }

  if (reference !== undefined) {
    const centre =
      unwrapped.reduce((sum, [lon]) => sum + lon, 0) / unwrapped.length;
    const turns = Math.round((reference - centre) / 360);
    return unwrapped.map(([lon, lat]) => [lon + turns * 360, lat]);
  }
  return unwrapped;
}

function bboxOfRing(ring: Position[]): [number, number, number, number] {
  let minLon = Infinity;
  let minLat = Infinity;
  let maxLon = -Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of ring) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }
  return [minLon, minLat, maxLon, maxLat];
}

function indexPolygon(rings: Position[][]): Polygon {
  const outer = unwrapRing(rings[0]);
  const bbox = bboxOfRing(outer);
  const reference = (bbox[0] + bbox[2]) / 2;
  return {
    outer,
    holes: rings.slice(1).map((ring) => unwrapRing(ring, reference)),
    bbox,
  };
}

function longitudeInFrame(longitude: number, reference: number): number {
  return longitude + Math.round((reference - longitude) / 360) * 360;
}

/**
 * Generic region index: bbox prefilter, then even-odd ray casting per
 * polygon. `valueOf` extracts the lookup result from a feature (returning
 * null skips it).
 */
export function buildRegionIndex<T>(
  collection: RawCollection,
  valueOf: (feature: RawFeature) => T | null
): RegionIndex<T> {
  const features: IndexedFeature<T>[] = [];
  for (const f of collection.features) {
    if (!f.geometry) continue;
    const value = valueOf(f);
    if (value === null) continue;
    const polygons = polygonsFromGeometry(f.geometry);
    if (polygons.length === 0) continue;
    features.push({ value, polygons });
  }

  return {
    lookup(lat, lon) {
      for (const feature of features) {
        for (const poly of feature.polygons) {
          const [minLon, minLat, maxLon, maxLat] = poly.bbox;
          const framedLon = longitudeInFrame(lon, (minLon + maxLon) / 2);
          if (
            framedLon < minLon ||
            framedLon > maxLon ||
            lat < minLat ||
            lat > maxLat
          ) {
            continue;
          }
          if (
            pointInRing(framedLon, lat, poly.outer) &&
            !poly.holes.some((hole) => pointInRing(framedLon, lat, hole))
          ) {
            return feature.value;
          }
        }
      }
      return null;
    },
  };
}

export function buildCountryIndex(collection: RawCollection): CountryIndex {
  return buildRegionIndex(collection, (f) => f.properties?.name ?? null);
}

/** Admin-1 (province/state) index from the bundled Natural Earth 10m data. */
export function buildAdmin1Index(
  collection: RawCollection
): RegionIndex<Admin1Region> {
  return buildRegionIndex(collection, (f) =>
    f.properties?.name && f.properties?.admin
      ? { name: f.properties.name, country: f.properties.admin }
      : null
  );
}

export async function loadCountryIndex(
  // BASE_URL-aware so the fetch works when the site is hosted on a subpath.
  url = `${import.meta.env.BASE_URL}data/countries.geojson`
): Promise<CountryIndex> {
  const collection = await fetchJson<RawCollection>(url);
  return buildCountryIndex(collection);
}

/**
 * Load the admin-1 index. An order of magnitude bigger than countries
 * (~1.3 MB gzipped), so callers load it lazily after boot — hover degrades
 * gracefully (country only, then bare coordinates) until it lands.
 */
export async function loadAdmin1Index(
  url = `${import.meta.env.BASE_URL}data/admin1.geojson`
): Promise<RegionIndex<Admin1Region>> {
  const collection = await fetchJson<RawCollection>(url);
  return buildAdmin1Index(collection);
}
