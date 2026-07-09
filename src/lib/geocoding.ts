import type { GeoGeometry } from "./geojson";
import { fetchJson } from "./net";

/**
 * Geocoding via OpenStreetMap Nominatim — open, and it returns real
 * administrative boundary polygons (not just a point), which we highlight on
 * the globe.
 *
 * The public endpoint is a shared commons with a formal usage policy
 * (https://operations.osmfoundation.org/policies/nominatim/): an absolute
 * maximum of 1 request/second, cached results, and no repeated queries —
 * violators get their IP range blocked, which for a NATed university lab
 * would take search away from everyone behind it. Compliance here is
 * structural, not best-effort: an LRU absorbs repeats and a single-flight
 * gate spaces network hits ≥1 s apart (do not "optimize" the delay away).
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

/**
 * Single-flight min-interval gate: callers `await gate()` before touching the
 * network. Consecutive passes are spaced ≥ `minIntervalMs` apart, and a call
 * arriving while another waits supersedes it — the queued waiter rejects with
 * an AbortError (the user has already typed past that query; SearchBox
 * ignores aborts). Pure and fake-timer-testable via the injectable clock.
 */
export function makeGate(
  minIntervalMs: number,
  now: () => number = () => Date.now()
): () => Promise<void> {
  let lastPass = -Infinity;
  let cancelQueued: (() => void) | undefined;
  return async function gate(): Promise<void> {
    cancelQueued?.(); // newest call wins; the queued one is stale
    const wait = lastPass + minIntervalMs - now();
    if (wait > 0) {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          cancelQueued = undefined;
          resolve();
        }, wait);
        cancelQueued = (): void => {
          clearTimeout(timer);
          reject(new DOMException("Superseded by a newer query", "AbortError"));
        };
      });
    }
    lastPass = now();
  };
}

/** ≥1 s between Nominatim hits — the policy's absolute maximum. */
const nominatimGate = makeGate(1000);

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
  if (cached) return cached; // cache hits bypass the gate — no network touched
  await nominatimGate();
  if (signal?.aborted) {
    throw new DOMException(
      "Aborted while awaiting the rate gate",
      "AbortError"
    );
  }
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
