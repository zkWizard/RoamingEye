import { GVP_VOLCANO_SOURCE } from "./volcanoContext";
import { parseVolcanoList, type Volcano } from "./volcanoes";

/**
 * Audit snapshot for the locally bundled GVP-derived catalog used by the
 * volcano overlay. Counts describe parser coverage, not global volcanic
 * completeness or activity.
 */
export interface VolcanoCatalogSnapshot {
  kind: "gvp-volcano-catalog-snapshot";
  status: "available" | "invalid-root";
  /** Null when the fetched value is not an array, so no source count exists. */
  suppliedRecordCount: number | null;
  parsedRecordCount: number;
  /** Null when no source array was supplied; otherwise supplied minus parsed. */
  droppedRecordCount: number | null;
  records: readonly Volcano[];
  dataMonth: null;
  temporalCoverage: "static-bundled-snapshot";
  geographicCoverage: string;
  provenance: typeof GVP_VOLCANO_SOURCE;
  limitations: readonly string[];
}

const LIMITATIONS = [
  "Counts describe records in the bundled GVP-derived file and parser acceptance only; they do not establish catalog completeness.",
  "A dropped record failed required name or coordinate validation; this snapshot does not infer or repair missing source values.",
  "This static catalog snapshot does not forecast eruptions, rank hazards, score risk, or infer causes.",
] as const;

/**
 * Parse the exact catalog consumed by the live overlay while retaining whether
 * the source root was usable and how many supplied records were rejected.
 */
export function parseVolcanoCatalog(json: unknown): VolcanoCatalogSnapshot {
  const isArray = Array.isArray(json);
  const records = parseVolcanoList(json);
  const suppliedRecordCount = isArray ? json.length : null;

  return {
    kind: "gvp-volcano-catalog-snapshot",
    status: isArray ? "available" : "invalid-root",
    suppliedRecordCount,
    parsedRecordCount: records.length,
    droppedRecordCount:
      suppliedRecordCount === null
        ? null
        : suppliedRecordCount - records.length,
    records,
    dataMonth: null,
    temporalCoverage: "static-bundled-snapshot",
    geographicCoverage:
      "Coordinates supplied in the bundled worldwide GVP-derived catalog; geographic completeness is not independently assessed.",
    provenance: GVP_VOLCANO_SOURCE,
    limitations: LIMITATIONS,
  };
}
