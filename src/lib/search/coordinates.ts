export interface ParsedCoordinate {
  lat: number;
  lon: number;
}

/**
 * A query that is only a lat, lon pair: "40.7, -74" or "40.7 -74".
 * The first number is latitude. Values outside the geographic ranges are
 * rejected rather than swapped.
 */
export function parseCoordinateQuery(query: string): ParsedCoordinate | null {
  const match = query
    .trim()
    .match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lon = Number(match[2]);
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}
