import type { GeoGeometry } from "./geojson";
import { fetchJson } from "./net";
import { NOMINATIM_OSM_ID } from "./viewState";

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

const PUBLIC_ENDPOINT = "https://nominatim.openstreetmap.org/search";
const LOOKUP_ENDPOINT = "https://nominatim.openstreetmap.org/lookup";

/**
 * Where place search sends an explicit query. The public Nominatim service is
 * the default; `VITE_NOMINATIM_ENDPOINT` or {@link setGeocoderEndpoint} points
 * the same request at another Nominatim-compatible server.
 */
function defaultEndpoint(): string {
  const fromEnv = import.meta.env.VITE_NOMINATIM_ENDPOINT;
  if (typeof fromEnv === "string" && fromEnv.trim() !== "")
    return fromEnv.trim();
  return PUBLIC_ENDPOINT;
}

let endpoint = defaultEndpoint();

/** The endpoint the next explicit place search will call. */
export function geocoderEndpoint(): string {
  return endpoint;
}

/**
 * Point explicit place search at another endpoint. `null` or a blank string
 * restores the default (the env override, or the public Nominatim service).
 */
export function setGeocoderEndpoint(url: string | null): void {
  const trimmed = url?.trim() ?? "";
  endpoint = trimmed !== "" ? trimmed : defaultEndpoint();
}

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
  /**
   * Nominatim object id (`N`/`W`/`R` + digits), when the response carried one.
   * A shared link uses it for a single `/lookup` of the outline.
   */
  osm?: string;
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
  osm_type?: string;
  osm_id?: number | string;
}

const OSM_PREFIX: Record<string, string> = {
  node: "N",
  way: "W",
  relation: "R",
};

/** Nominatim's `osm_type` + `osm_id` as the id `/lookup` accepts. */
export function nominatimOsmId(
  type: string | undefined,
  id: number | string | undefined
): string | undefined {
  if (!type || id == null) return undefined;
  const prefix = OSM_PREFIX[type];
  if (!prefix) return undefined;
  const code = `${prefix}${id}`;
  return NOMINATIM_OSM_ID.test(code) ? code : undefined;
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

/**
 * Build the Nominatim search URL (pure — unit-tested).
 */
export function buildSearchUrl(query: string, limit = 5): string {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    polygon_geojson: "1",
    addressdetails: "1",
    "accept-language": "en",
    limit: String(limit),
  });
  return `${endpoint}?${params.toString()}`;
}

/** Build a one-object Nominatim `/lookup` URL (pure — unit-tested). */
export function buildLookupUrl(osmId: string): string {
  const params = new URLSearchParams({
    osm_ids: osmId,
    format: "jsonv2",
    polygon_geojson: "1",
    "accept-language": "en",
  });
  return `${LOOKUP_ENDPOINT}?${params.toString()}`;
}

/**
 * A closed ring around a bounding box, for when `/lookup` cannot return the
 * real outline. A span wider than 180° (Nominatim's -180..180 antimeridian
 * failure) is not a box anyone can see, so it yields nothing rather than a
 * line around the world.
 *
 * One lookup is the lighter way to restore an outline: the bundled admin-1
 * file is about 1.3 MB gzipped and still has no cities, while `/lookup`
 * returns the single polygon the sender searched. This ring is only the
 * fallback when that request fails and the link still carried a box.
 */
export function bboxOutline(
  bbox: readonly [number, number, number, number]
): GeoGeometry | null {
  const [south, north, west, east] = bbox;
  if (![south, north, west, east].every((n) => Number.isFinite(n))) return null;
  if (north - south < 0.01) return null;
  let lonSpan = east - west;
  if (lonSpan <= 0) lonSpan += 360;
  if (lonSpan < 0.01 || lonSpan > 180) return null;
  const ring: [number, number][] = [
    [west, south],
    [east, south],
    [east, north],
    [west, north],
    [west, south],
  ];
  return { type: "Polygon", coordinates: [ring] };
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

/**
 * One Nominatim `/lookup` for a shared place's outline. Shares the search
 * gate, so a link open cannot break the 1 request/second policy. Returns
 * null when the id is not a Nominatim id or the object no longer exists.
 */
export async function lookupPlace(
  osmId: string,
  signal?: AbortSignal
): Promise<GeoResult | null> {
  if (!NOMINATIM_OSM_ID.test(osmId)) return null;
  const key = `lookup:${osmId}`;
  const cached = resultCache.get(key);
  if (cached) return cached[0] ?? null;
  await nominatimGate();
  if (signal?.aborted) {
    throw new DOMException(
      "Aborted while awaiting the rate gate",
      "AbortError"
    );
  }
  const payload = await fetchJson<NominatimItem[] | NominatimItem>(
    buildLookupUrl(osmId),
    { signal, retries: 1, timeoutMs: 12000 }
  );
  const items = Array.isArray(payload) ? payload : [payload];
  const item = items[0];
  if (!item?.display_name) return null;
  const result = toResult(item);
  resultCache.set(key, [result]);
  return result;
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
    osm: nominatimOsmId(item.osm_type, item.osm_id),
  };
}
