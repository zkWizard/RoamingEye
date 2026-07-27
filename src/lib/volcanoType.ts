import { GVP_VOLCANO_SOURCE } from "./volcanoContext";
import type { Volcano } from "./volcanoes";
import { canonicalVolcanoType } from "./volcanoMorphology";

export {
  canonicalVolcanoType,
  canonicalVolcanoTypeLabel,
  type CanonicalVolcanoType,
} from "./volcanoMorphology";

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
