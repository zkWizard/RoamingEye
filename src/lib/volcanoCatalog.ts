import { GVP_VOLCANO_SOURCE } from "./volcanoContext";
import {
  parseVolcanoDataset,
  type Volcano,
  type VolcanoDatasetProvenance,
} from "./volcanoes";

/**
 * Audit snapshot for the locally bundled GVP-derived catalog used by the
 * volcano overlay. Counts describe parser coverage, not global volcanic
 * completeness or activity.
 */
export interface VolcanoCatalogSnapshot {
  kind: "gvp-volcano-catalog-snapshot";
  status: "available" | "invalid-root";
  /**
   * Records supplied by the source root, in either shape the bundled file may
   * take. Null when no record array was supplied, so no source count exists.
   */
  suppliedRecordCount: number | null;
  parsedRecordCount: number;
  /** Null when no source array was supplied; otherwise supplied minus parsed. */
  droppedRecordCount: number | null;
  records: readonly Volcano[];
  /**
   * UTC calendar month the bundled snapshot was retrieved from GVP, read from
   * the file's own provenance. Null when the file supplies none (a bare record
   * array), rather than substituted with the static citation's month.
   */
  dataMonth: string | null;
  /**
   * Retrieval provenance published inside the bundled file, describing the
   * snapshot these records actually came from. Null when the file carries none.
   * Distinct from `provenance`, which is the static catalog citation.
   */
  snapshotProvenance: VolcanoDatasetProvenance | null;
  temporalCoverage: "static-bundled-snapshot";
  geographicCoverage: string;
  provenance: typeof GVP_VOLCANO_SOURCE;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Counts describe records in the bundled GVP-derived file and parser acceptance only; they do not establish catalog completeness.",
  "A dropped record failed required name or coordinate validation; this snapshot does not infer or repair missing source values.",
  "Retrieval month reports when the bundled snapshot was taken, not when any volcano was last active.",
  "This static catalog snapshot does not forecast eruptions, rank hazards, score risk, or infer causes.",
] as const;

/**
 * Parse the exact catalog consumed by the live overlay while retaining whether
 * the source root was usable and how many supplied records were rejected.
 *
 * Accepts both shapes the bundled file may take — a bare record array, and the
 * provenance envelope `{ provenance, records }` that scripts/prepare-data.mjs
 * has written since the GVP snapshot metadata was retained. Testing only for a
 * bare array would report the shipped envelope as an unusable root while the
 * overlay rendered every one of its records, and would silently disable the
 * dropped-record audit for the only shape the app actually ships.
 */
export function parseVolcanoCatalog(json: unknown): VolcanoCatalogSnapshot {
  const suppliedRecordCount = suppliedRecords(json);
  const dataset = parseVolcanoDataset(json);

  return {
    kind: "gvp-volcano-catalog-snapshot",
    status: suppliedRecordCount === null ? "invalid-root" : "available",
    suppliedRecordCount,
    parsedRecordCount: dataset.volcanoes.length,
    droppedRecordCount:
      suppliedRecordCount === null
        ? null
        : suppliedRecordCount - dataset.volcanoes.length,
    records: dataset.volcanoes,
    dataMonth: dataset.dataMonth,
    snapshotProvenance: dataset.provenance,
    temporalCoverage: "static-bundled-snapshot",
    geographicCoverage:
      "Coordinates supplied in the bundled worldwide GVP-derived catalog; geographic completeness is not independently assessed.",
    provenance: GVP_VOLCANO_SOURCE,
    limitations: LIMITATIONS,
  };
}

/**
 * Count the records the source root offered the parser, mirroring the shapes
 * parseVolcanoDataset accepts. Null means no record array was supplied at all,
 * which is the one case where a dropped-record count cannot be computed.
 */
function suppliedRecords(json: unknown): number | null {
  if (Array.isArray(json)) return json.length;
  if (typeof json !== "object" || json === null) return null;
  const records = (json as { records?: unknown }).records;
  return Array.isArray(records) ? records.length : null;
}
