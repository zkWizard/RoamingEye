import {
  canonicalVolcanoType,
  canonicalVolcanoTypeLabel,
} from "./volcanoMorphology";
import {
  parseVolcanoTectonicSetting,
  tectonicSettingLabel,
} from "./volcanoTectonicSetting";

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

export interface VolcanoDatasetProvenance {
  source: string;
  sourceUrl: string;
  service: string;
  /** ISO 8601 instant when the bundled snapshot was retrieved from GVP. */
  retrievedAt: string;
}

export interface VolcanoDataset {
  volcanoes: Volcano[];
  provenance: VolcanoDatasetProvenance | null;
  /** UTC calendar month derived from retrievedAt, or null when unavailable. */
  dataMonth: string | null;
}

/**
 * Activity recency classes, used to color markers:
 *  - "recent": erupted in the satellite/instrumental era (since 1900).
 *  - "historic": eruption dated by GVP from source year 0 through 1899.
 *  - "holocene": Holocene evidence only — no dated eruption since source year 0.
 */
export type EruptionClass = "recent" | "historic" | "holocene";

export function eruptionClass(lastEruptionYear: number | null): EruptionClass {
  if (lastEruptionYear === null) return "holocene";
  if (lastEruptionYear >= 1900) return "recent";
  // GVP reports Arxan-Chaihe with source year zero. Preserve that dated record
  // in the historic class without converting it to a civil-calendar era.
  if (lastEruptionYear >= 0) return "historic";
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
 * The eruption-year band each class actually covers, phrased for the legend
 * key. Shared with the legend for the same reason as the colors above: the key
 * can never claim a band that {@link eruptionClass} does not assign.
 *
 * The "holocene" bucket is deliberately NOT called "Holocene only". It holds
 * two distinct evidence states that the class cannot separate: a record dated
 * BCE (a known eruption, GVP source year < 0) and a record with no dated
 * eruption at all. In the bundled GVP snapshot 169 of the 533 records in this
 * class carry a dated BCE year (−9450 to −50), so "Holocene only" — which
 * reads as "no dated eruption" — misdescribes about a third of them. Callers
 * needing the two states apart should use the dated/undated counts in
 * volcanoRecency.ts rather than the class label.
 *
 * "year 0" is stated verbatim rather than as "1 CE": GVP reports one record
 * (Arxan-Chaihe) with source year zero, which eruptionClass keeps in the
 * historic band without converting it to a civil-calendar era.
 */
export const ERUPTION_CLASS_LABELS: Record<EruptionClass, string> = {
  recent: "since 1900",
  historic: "year 0–1899",
  holocene: "BCE or undated",
};

/**
 * Human-readable "most recent eruption" phrase, honest about the data:
 * a null year means Holocene evidence only, and negative years are BCE.
 */
export function lastEruptionLabel(lastEruptionYear: number | null): string {
  if (lastEruptionYear === null || !Number.isFinite(lastEruptionYear)) {
    return "Holocene evidence only";
  }
  if (lastEruptionYear >= 1) return `last erupted ${lastEruptionYear}`;
  if (lastEruptionYear === 0) {
    return "last eruption year 0 (source value; era not converted)";
  }
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

/**
 * Summit elevation in the hover readout's compact voice, decoding the sign GVP
 * reports instead of leaving a bare negative number on screen.
 *
 * GVP supplies summit elevation as a signed height against the sea-level datum
 * (see lib/volcanoElevationProfile.ts), and 110 of the 1196 bundled records sit
 * below it — down to -5700 m. Rendered raw, a marker over open ocean reads
 * "summit elevation -1410 m", which is a summit 1410 m under water, not a
 * missing or erroneous height. A summit above the datum needs no qualifier and
 * keeps its existing form, so the common marker gains no extra text.
 *
 * This reads the reported datum sign only. It is not a statement about whether
 * the volcano erupts under water: GVP records where the summit sits, not the
 * eruptive environment.
 */
export function summitElevationHoverLabel(
  elevationMeters: number | null
): string {
  switch (elevationRegime(elevationMeters)) {
    case "subaerial":
      return `summit elevation ${elevationMeters} m`;
    case "submarine":
      return `summit elevation ${Math.abs(
        elevationMeters as number
      )} m below sea level`;
    case "sea-level":
      return "summit elevation 0 m (sea level)";
    case "unknown":
      return "summit elevation not recorded";
  }
}

/**
 * Source-faithful tooltip text for a hovered marker. Country, summit
 * elevation, and the tectonic setting come directly from the bundled GVP
 * snapshot; missing values stay explicit instead of being mistaken for zero or
 * silently disappearing. The tectonic setting is GVP's catalog assignment for
 * the site, not an inference RoamingEye drew from the marker's position.
 */
export function volcanoHoverLabel(volcano: Volcano): string {
  const morphology = canonicalVolcanoType(volcano.type);
  const parts = [
    volcano.name,
    morphology.base === null
      ? "volcano type not recorded"
      : canonicalVolcanoTypeLabel(morphology),
    volcano.country ?? "country/territory not recorded",
    summitElevationHoverLabel(volcano.elevation),
    lastEruptionLabel(volcano.lastEruptionYear),
    tectonicSettingLabel(
      parseVolcanoTectonicSetting(volcano.sourceRecord?.tectonicSetting)
    ),
  ];
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

export function parseVolcanoDataset(json: unknown): VolcanoDataset {
  const envelope = isRecord(json) ? json : null;
  const records = Array.isArray(json)
    ? json
    : envelope && Array.isArray(envelope.records)
      ? envelope.records
      : [];
  const provenance = parseDatasetProvenance(envelope?.provenance);

  const out: Volcano[] = [];
  for (const entry of records as Record<string, unknown>[]) {
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
  return {
    volcanoes: out,
    provenance,
    dataMonth: provenance ? provenance.retrievedAt.slice(0, 7) : null,
  };
}

/** Parse records for renderers that do not need snapshot metadata. */
export function parseVolcanoList(json: unknown): Volcano[] {
  return parseVolcanoDataset(json).volcanoes;
}

function parseDatasetProvenance(
  value: unknown
): VolcanoDatasetProvenance | null {
  if (!isRecord(value)) return null;
  const { source, sourceUrl, service, retrievedAt } = value;
  if (
    typeof source !== "string" ||
    typeof sourceUrl !== "string" ||
    typeof service !== "string" ||
    typeof retrievedAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T/.test(retrievedAt) ||
    !Number.isFinite(Date.parse(retrievedAt))
  ) {
    return null;
  }
  return { source, sourceUrl, service, retrievedAt };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
