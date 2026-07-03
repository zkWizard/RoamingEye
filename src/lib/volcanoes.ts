/**
 * Holocene volcanoes from the Smithsonian Global Volcanism Program's
 * "Volcanoes of the World" database, slimmed into public/data/volcanoes.json
 * by scripts/prepare-data.mjs.
 *
 * Pure, render-free parsing and classification (see volcanoes.test.ts); the
 * overlay in overlays/VolcanoesOverlay.ts renders what this module extracts.
 */

export interface Volcano {
  name: string;
  lat: number;
  lon: number;
  /** GVP primary volcano type, e.g. "Stratovolcano". */
  type: string | null;
  /** Summit elevation in metres (negative for submarine). */
  elevation: number | null;
  /** Calendar year of the most recent known eruption (negative = BCE). */
  lastEruptionYear: number | null;
  country: string | null;
}

/**
 * Activity recency classes, used to color markers:
 *  - "recent": erupted in the satellite/instrumental era (since 1900).
 *  - "historic": eruption known from the written record (1 CE – 1899).
 *  - "holocene": Holocene evidence only — no dated eruption since 1 CE.
 */
export type EruptionClass = "recent" | "historic" | "holocene";

export function eruptionClass(lastEruptionYear: number | null): EruptionClass {
  if (lastEruptionYear === null) return "holocene";
  if (lastEruptionYear >= 1900) return "recent";
  if (lastEruptionYear >= 1) return "historic";
  return "holocene";
}

/**
 * Parse the slimmed volcano list, dropping malformed entries rather than
 * throwing — a partially usable file still renders.
 */
export function parseVolcanoList(json: unknown): Volcano[] {
  if (!Array.isArray(json)) return [];

  const out: Volcano[] = [];
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
      type: typeof entry.type === "string" ? entry.type : null,
      elevation: Number.isFinite(entry.elevation)
        ? (entry.elevation as number)
        : null,
      lastEruptionYear: Number.isFinite(entry.lastEruptionYear)
        ? (entry.lastEruptionYear as number)
        : null,
      country: typeof entry.country === "string" ? entry.country : null,
    });
  }
  return out;
}
