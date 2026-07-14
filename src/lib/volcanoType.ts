import { GVP_VOLCANO_SOURCE } from "./volcanoContext";
import type { Volcano } from "./volcanoes";

/**
 * Canonicalize the Smithsonian GVP "Primary Volcano Type" string.
 *
 * The GVP-derived local file records a free-text morphology label per volcano
 * (see volcanoes.ts). Across the bundled dataset the same landform appears with
 * surface variations that carry real, but easily-lost, provenance:
 *  - a trailing "(s)"/"(es)" marks a record that denotes *multiple* landforms of
 *    that type (e.g. "Pyroclastic cone(s)", "Stratovolcano(es)"), and
 *  - a trailing "?" marks a morphology GVP considers *uncertain*
 *    (e.g. "Stratovolcano?").
 *
 * This module peels those markers into explicit boolean flags so callers can
 * aggregate by landform without either treating "Stratovolcano" and
 * "Stratovolcano(es)" as different classes or silently discarding the
 * multiplicity/uncertainty the source encoded. It is pure normalization of the
 * GVP label: it never invents a morphology, and it always retains the original
 * string. Unrecognized trailing parentheticals (e.g. "Shield(pyroclastic)") are
 * left untouched rather than guessed at.
 */

export interface CanonicalVolcanoType {
  /**
   * GVP landform label with any trailing multiplicity/uncertainty marker
   * removed, e.g. "Stratovolcano". Null when no usable type was recorded.
   */
  base: string | null;
  /** GVP appended "(s)"/"(es)": the record denotes multiple landforms of this type. */
  isMultiple: boolean;
  /** GVP appended "?": the morphology assignment is uncertain. */
  isUncertain: boolean;
  /** The original, unmodified GVP type string (null when absent). Always retained. */
  raw: string | null;
}

const PLURAL_SUFFIX = /\((?:es|s)\)$/i;

/**
 * Split a GVP primary-volcano-type string into a canonical base landform plus
 * multiplicity and uncertainty flags. Markers are peeled from the end in either
 * order (e.g. "Stratovolcano(es)?" and "Stratovolcano?(es)" both canonicalize
 * to base "Stratovolcano", multiple, uncertain).
 */
export function canonicalVolcanoType(
  type: string | null | undefined
): CanonicalVolcanoType {
  const raw = typeof type === "string" ? type : null;
  let working = raw === null ? "" : raw.trim();
  let isMultiple = false;
  let isUncertain = false;

  let changed = true;
  while (changed && working.length > 0) {
    changed = false;
    if (working.endsWith("?")) {
      isUncertain = true;
      working = working.slice(0, -1).trimEnd();
      changed = true;
      continue;
    }
    const plural = working.match(PLURAL_SUFFIX);
    if (plural) {
      isMultiple = true;
      working = working.slice(0, working.length - plural[0].length).trimEnd();
      changed = true;
    }
  }

  return {
    base: working.length > 0 ? working : null,
    isMultiple,
    isUncertain,
    raw,
  };
}

/**
 * Human-readable label for a canonical type, honest about what the source did
 * and did not commit to. Examples: "Stratovolcano",
 * "Pyroclastic cone (multiple landforms)",
 * "Stratovolcano (type uncertain)",
 * "Volcano type not recorded".
 */
export function canonicalVolcanoTypeLabel(
  canonical: CanonicalVolcanoType
): string {
  if (canonical.base === null) return "Volcano type not recorded";
  const qualifiers: string[] = [];
  if (canonical.isMultiple) qualifiers.push("multiple landforms");
  if (canonical.isUncertain) qualifiers.push("type uncertain");
  return qualifiers.length === 0
    ? canonical.base
    : `${canonical.base} (${qualifiers.join("; ")})`;
}

export interface VolcanoTypeTally {
  /** Canonical base landform label shared by every counted record. */
  base: string;
  count: number;
}

/**
 * A descriptive inventory of GVP landform labels, not a hazard, activity, or
 * behavior classification. Multiplicity and uncertainty markers are folded into
 * the base landform so counts group like morphologies together.
 */
export interface VolcanoTypeSummary {
  kind: "gvp-volcano-type-summary";
  totalCount: number;
  /** Records with no usable type string, excluded from the base-type tallies. */
  recordsWithoutType: number;
  /** Base-landform counts, ordered by count descending then label ascending. */
  tallies: VolcanoTypeTally[];
  provenance: typeof GVP_VOLCANO_SOURCE;
  limitations: readonly string[];
}

const SUMMARY_LIMITATIONS = [
  "Counts the supplied, locally bundled GVP-derived volcano records only.",
  'Folds "(s)"/"(es)" multiplicity and "?" uncertainty markers into the base landform for counting.',
  "Describes recorded morphology; it is not a hazard, activity, or behavior classification.",
] as const;

/**
 * Tally supplied volcanoes by canonical base landform, retaining source
 * provenance. Records whose type is absent or blank are reported separately as
 * recordsWithoutType rather than bucketed under a guessed label.
 */
export function summarizeVolcanoTypes(
  volcanoes: readonly Volcano[]
): VolcanoTypeSummary {
  const counts = new Map<string, number>();
  let recordsWithoutType = 0;

  for (const volcano of volcanoes) {
    const { base } = canonicalVolcanoType(volcano.type);
    if (base === null) {
      recordsWithoutType += 1;
      continue;
    }
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const tallies = [...counts.entries()]
    .map(([base, count]) => ({ base, count }))
    .sort((a, b) => b.count - a.count || a.base.localeCompare(b.base, "en-US"));

  return {
    kind: "gvp-volcano-type-summary",
    totalCount: volcanoes.length,
    recordsWithoutType,
    tallies,
    provenance: GVP_VOLCANO_SOURCE,
    limitations: SUMMARY_LIMITATIONS,
  };
}
