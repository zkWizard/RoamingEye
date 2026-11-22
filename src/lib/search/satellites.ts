import type { SearchHit } from "./provider";

/** NORAD catalog number of the International Space Station (Zarya). */
export const ISS_NORAD_ID = 25544;

const ISS_QUERIES = new Set([
  "iss",
  "the iss",
  "where is the iss",
  "wheres the iss",
  "where is iss",
  "space station",
  "the space station",
  "where is the space station",
]);

export function normalizeSatelliteQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

/** A hit for the ISS, or null when the query is not that intent. */
export function issSearchHit(query: string): SearchHit | null {
  if (!ISS_QUERIES.has(normalizeSatelliteQuery(query))) return null;
  return {
    id: "satellite:25544",
    group: "Live",
    title: "ISS",
    subtitle: "Follow the space station",
    score: 1000,
    data: { type: "satellite", noradId: ISS_NORAD_ID, name: "ISS" },
  };
}
