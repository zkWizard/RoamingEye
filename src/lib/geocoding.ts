import type { GeoGeometry } from "./geojson";

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
  const res = await fetch(buildSearchUrl(query), {
    signal,
    headers: { Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`geocode: ${res.status}`);
  const items = (await res.json()) as NominatimItem[];
  return items.map(toResult);
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
