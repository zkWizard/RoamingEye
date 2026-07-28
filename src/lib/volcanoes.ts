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
  /** Verbatim source identity/context retained when parsed from the GVP file. */
  sourceRecord?: VolcanoSourceRecord;
}

export interface VolcanoSourceRecord {
  /** Stable Smithsonian GVP Volcano Number. */
  volcanoNumber: number | null;
  region: string | null;
  subregion: string | null;
  /** GVP tectonic-setting label, retained verbatim rather than inferred. */
  tectonicSetting: string | null;
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
 * Marker color per recency class (recent hot orange, historic amber,
 * Holocene-only muted violet). Shared by the overlay and the legend so the
 * on-globe colors and the key can never drift apart.
 */
export const ERUPTION_CLASS_COLORS: Record<EruptionClass, string> = {
  recent: "#ff6b35",
  historic: "#ffc46b",
  holocene: "#b49ae0",
};

/**
 * Human-readable "most recent eruption" phrase, honest about the data:
 * a null year means Holocene evidence only, and negative years are BCE.
 */
export function lastEruptionLabel(lastEruptionYear: number | null): string {
  if (lastEruptionYear === null) return "Holocene evidence only";
  if (lastEruptionYear >= 1) return `last erupted ${lastEruptionYear}`;
  return `last erupted ${Math.abs(lastEruptionYear)} BCE`;
}

/**
 * Summit-elevation datum regime, read directly from the GVP elevation field
 * (metres relative to sea level):
 *  - "subaerial": summit above the 0 m datum (elevation > 0).
 *  - "sea-level": summit exactly at the 0 m datum (elevation === 0).
 *  - "submarine": summit below the 0 m datum (elevation < 0).
 *  - "unknown": elevation is missing or non-finite.
 * This is a reading of the reported datum sign, not an eruption-style,
 * edifice-morphology, or hazard inference — GVP records a summit elevation,
 * not whether an edifice erupts subaerially or under water.
 */
export type ElevationRegime =
  "subaerial" | "sea-level" | "submarine" | "unknown";

export function elevationRegime(
  elevationMeters: number | null
): ElevationRegime {
  if (elevationMeters === null || !Number.isFinite(elevationMeters)) {
    return "unknown";
  }
  if (elevationMeters > 0) return "subaerial";
  if (elevationMeters < 0) return "submarine";
  return "sea-level";
}

/**
 * Human-readable summit-elevation phrase, honest about the datum: a null or
 * non-finite elevation is "summit elevation unknown", and the sign is stated
 * relative to sea level rather than reinterpreted.
 */
export function elevationRegimeLabel(elevationMeters: number | null): string {
  switch (elevationRegime(elevationMeters)) {
    case "subaerial":
      return `subaerial summit, ${elevationMeters} m above sea level`;
    case "submarine":
      return `submarine summit, ${Math.abs(
        elevationMeters as number
      )} m below sea level`;
    case "sea-level":
      return "summit at sea level (0 m)";
    case "unknown":
      return "summit elevation unknown";
  }
}

/** Tooltip text for a hovered marker, e.g. "Etna · Stratovolcano · last erupted 2025". */
export function volcanoHoverLabel(volcano: Volcano): string {
  const parts = [volcano.name];
  if (volcano.type) parts.push(volcano.type);
  parts.push(lastEruptionLabel(volcano.lastEruptionYear));
  return parts.join(" · ");
}

/**
 * Parse the slimmed volcano list, dropping malformed entries rather than
 * throwing — a partially usable file still renders.
 */
/** Number() that cannot throw: exotic values (null-prototype objects,
 * symbols) read as NaN instead of a TypeError — found by the fuzz suite. */
const toNumber = (v: unknown): number =>
  typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;

export function parseVolcanoList(json: unknown): Volcano[] {
  if (!Array.isArray(json)) return [];

  const out: Volcano[] = [];
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
      type: typeof entry.type === "string" ? entry.type : null,
      elevation: Number.isFinite(entry.elevation)
        ? (entry.elevation as number)
        : null,
      lastEruptionYear: Number.isFinite(entry.lastEruptionYear)
        ? (entry.lastEruptionYear as number)
        : null,
      country: typeof entry.country === "string" ? entry.country : null,
      sourceRecord: {
        volcanoNumber: Number.isInteger(entry.volcanoNumber)
          ? (entry.volcanoNumber as number)
          : null,
        region: typeof entry.region === "string" ? entry.region : null,
        subregion: typeof entry.subregion === "string" ? entry.subregion : null,
        tectonicSetting:
          typeof entry.tectonicSetting === "string"
            ? entry.tectonicSetting
            : null,
      },
    });
  }
  return out;
}
