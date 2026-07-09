/**
 * Major populated places from Natural Earth (public domain), slimmed into
 * public/data/cities.json by scripts/prepare-data.mjs.
 *
 * Pure, render-free parsing and formatting (see cities.test.ts); the overlay
 * in overlays/CitiesOverlay.ts renders what this module extracts.
 */

export interface City {
  name: string;
  lat: number;
  lon: number;
  country: string | null;
  /** Population estimate, when Natural Earth carries one. */
  pop: number | null;
  capital: boolean;
}

/**
 * Parse the slimmed city list, dropping malformed entries rather than
 * throwing — a partially usable file still renders.
 */
/** Number() that cannot throw: exotic values (null-prototype objects,
 * symbols) read as NaN instead of a TypeError — found by the fuzz suite. */
const toNumber = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;

export function parseCityList(json: unknown): City[] {
  if (!Array.isArray(json)) return [];

  const out: City[] = [];
  for (const entry of json as Record<string, unknown>[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = entry.name;
    const lat = toNumber(entry.lat);
    const lon = toNumber(entry.lon);
    if (
      typeof name !== "string" ||
      name.length === 0 ||
      !Number.isFinite(lat) ||
      !Number.isFinite(lon) ||
      Math.abs(lat) > 90 ||
      Math.abs(lon) > 180
    ) {
      continue;
    }
    out.push({
      name,
      lat,
      lon,
      country: typeof entry.country === "string" ? entry.country : null,
      pop: Number.isFinite(entry.pop) ? (entry.pop as number) : null,
      capital: entry.capital === true,
    });
  }
  return out;
}

/** Tooltip text for a hovered city dot, e.g. "Tokyo · Japan". */
export function cityHoverLabel(city: City): string {
  return city.country ? `${city.name} · ${city.country}` : city.name;
}

/** How many cities get a name label at close zoom (the biggest N by population). */
export const LABEL_COUNT = 30;

/**
 * Opacity for the city-name labels at a camera distance (globe radius 1):
 * fully visible when close, gone when zoomed out, a linear fade between —
 * so the globe never becomes label soup from orbit.
 */
export function labelOpacity(
  cameraDistance: number,
  near = 1.7,
  far = 2.15
): number {
  if (cameraDistance >= far) return 0;
  if (cameraDistance <= near) return 1;
  return (far - cameraDistance) / (far - near);
}
