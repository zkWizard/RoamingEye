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
export function parseCityList(json: unknown): City[] {
  if (!Array.isArray(json)) return [];

  const out: City[] = [];
  for (const entry of json as Record<string, unknown>[]) {
    if (typeof entry !== "object" || entry === null) continue;
    const name = entry.name;
    const lat = Number(entry.lat);
    const lon = Number(entry.lon);
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
