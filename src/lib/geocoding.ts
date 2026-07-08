import type { GeoGeometry } from "./geojson";
import { fetchJson } from "./net";

/**
 * Geocoding via OpenStreetMap Nominatim — open, and it returns real
 * administrative boundary polygons (not just a point), which we highlight on
 * the globe. Note: the public endpoint has a fair-use limit (~1 req/s); a
 * production deployment should self-host or use a provider.
 */

const ENDPOINT = "https://nominatim.openstreetmap.org/search";

export interface GeoResult {
  name: string;
  displayName: string;
  lat: number;
  lon: number;
  type: string;
  category: string;
  /** [south, north, west, east] in degrees, or null. */
  boundingBox: [number, number, number, number] | null;
  geometry: GeoGeometry | null;
}

interface NominatimItem {
  name?: string;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  category?: string;
  boundingbox?: [string, string, string, string];
  geojson?: GeoGeometry;
}

/**
 * Tiny LRU used to cache successful query results — the public Nominatim
 * endpoint is rate-limited (~1 req/s), so repeats (back-and-forth typing)
 * should never re-hit it. Pure and unit-tested.
 */
export function makeLru<K, V>(
  capacity: number
): {
  get(key: K): V | undefined;
  set(key: K, value: V): void;
  readonly size: number;
} {
  const map = new Map<K, V>();
  return {
    get(key) {
      if (!map.has(key)) return undefined;
      const value = map.get(key) as V;
      map.delete(key); // re-insert = most recently used
      map.set(key, value);
      return value;
    },
    set(key, value) {
      map.delete(key);
      map.set(key, value);
      if (map.size > capacity) {
        map.delete(map.keys().next().value as K);
      }
    },
    get size() {
      return map.size;
    },
  };
}

const resultCache = makeLru<string, GeoResult[]>(50);

/** Build the Nominatim search URL (pure — unit-tested). */
export function buildSearchUrl(query: string, limit = 5): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    polygon_geojson: "1",
    addressdetails: "1",
    "accept-language": "en",
    limit: String(limit),
  });
  return `${ENDPOINT}?${params.toString()}`;
}

export async function geocode(
  query: string,
  signal?: AbortSignal
): Promise<GeoResult[]> {
  const key = query.trim().toLowerCase();
  const cached = resultCache.get(key);
  if (cached) return cached;
  // One retry only — Nominatim's public endpoint is rate-limited.
  const items = await fetchJson<NominatimItem[]>(buildSearchUrl(query), {
    signal,
    retries: 1,
    timeoutMs: 12000,
  });
  const results = items.map(toResult);
  resultCache.set(key, results); // successful responses only
  return results;
}

function toResult(item: NominatimItem): GeoResult {
  return {
    name: item.name ?? item.display_name.split(",")[0],
    displayName: item.display_name,
    lat: Number(item.lat),
    lon: Number(item.lon),
    type: item.type ?? "",
    category: item.category ?? "",
    boundingBox: item.boundingbox
      ? (item.boundingbox.map(Number) as [number, number, number, number])
      : null,
    geometry: item.geojson ?? null,
  };
}
