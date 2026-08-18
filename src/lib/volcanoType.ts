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
  /**
   * Counted records whose supplied type carried a GVP multiplicity ("(s)"/
   * "(es)") or uncertainty ("?") marker that this summary folded away. Callers
   * that print both a per-record label and these tallies need it: the record
   * label spells the marker out, so without the count a reader comparing
   * "Stratovolcano (multiple landforms)" against "Stratovolcano 34" cannot tell
   * whether the tally included that record.
   */
  foldedRecordCount: number;
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
  volcanoes: readonly Pick<Volcano, "type">[]
): VolcanoTypeSummary {
  const counts = new Map<string, number>();
  let recordsWithoutType = 0;
  let foldedRecordCount = 0;

  for (const volcano of volcanoes) {
    const { base, isMultiple, isUncertain } = canonicalVolcanoType(
      volcano.type
    );
    if (base === null) {
      recordsWithoutType += 1;
      continue;
    }
    // Only records that reached a tally are counted as folded: a type string
    // that is nothing but a marker yields no base landform and is already
    // reported as recordsWithoutType.
    if (isMultiple || isUncertain) foldedRecordCount += 1;
    counts.set(base, (counts.get(base) ?? 0) + 1);
  }

  const tallies = [...counts.entries()]
    .map(([base, count]) => ({ base, count }))
    .sort((a, b) => b.count - a.count || a.base.localeCompare(b.base, "en-US"));

  return {
    kind: "gvp-volcano-type-summary",
    totalCount: volcanoes.length,
    recordsWithoutType,
    foldedRecordCount,
    tallies,
    provenance: GVP_VOLCANO_SOURCE,
    limitations: SUMMARY_LIMITATIONS,
  };
}

/** Landform tallies named in the sentence before the remainder is counted. */
const NAMED_TALLY_LIMIT = 3;

/**
 * One-line landform composition of a matched set, or null when there is
 * nothing to describe.
 *
 * A place panel lists only its first few records, so the landforms a reader
 * can see are whichever ones the list order happened to surface — for a wide
 * extent that is a badly skewed sample of the matched set. This sentence
 * describes every matched record instead.
 *
 * The remainder is counted rather than named, so the sentence stays one line
 * for a 10-landform extent. The ordering is stated as "ordered by count"
 * rather than "most common first": ties are ordinary here — a small extent
 * commonly holds one record of each landform — and the tie-break is
 * alphabetical, so a superlative would misdescribe that case.
 * GVP's own qualifier markers are folded into the base landform by
 * summarizeVolcanoTypes; the folded count is disclosed only when it is
 * non-zero, so an extent whose records carry no marker never reads as though
 * some were reinterpreted.
 *
 * Strictly descriptive: GVP's primary volcano type is a recorded morphology
 * label, so this is never reported as size, activity, eruptive style, or
 * hazard.
 */
export function volcanoTypeCompositionText(
  summary: VolcanoTypeSummary
): string | null {
  if (summary.totalCount === 0) return null;
  const records = (count: number) => (count === 1 ? "record" : "records");
  if (summary.tallies.length === 0) {
    return (
      `No landform label is recorded for the ${summary.totalCount} matched ` +
      `${records(summary.totalCount)}.`
    );
  }

  // Naming all four is shorter than naming three and counting one, so the
  // remainder below is never 1 and needs no singular form.
  const named =
    summary.tallies.length <= NAMED_TALLY_LIMIT + 1
      ? summary.tallies
      : summary.tallies.slice(0, NAMED_TALLY_LIMIT);
  const remainder = summary.tallies.length - named.length;
  const listed = named.map(({ base, count }) => `${base} ${count}`).join(", ");
  const further =
    remainder === 0 ? "" : `, and ${remainder} further landform types`;
  const untyped =
    summary.recordsWithoutType === 0
      ? ""
      : ` ${summary.recordsWithoutType} matched ` +
        `${records(summary.recordsWithoutType)} supplied no landform label.`;
  // Agreement here runs off two different counts: the noun names the tallied
  // set, the verbs name the folded subset inside it. Reading both off the
  // folded count printed "1 of the tallied record carry ... and are counted".
  // Neither singular is an edge case — 223 of the 1196 bundled records carry a
  // marker, so a small extent routinely folds exactly one, and that one is
  // often the extent's only tallied record.
  const talliedCount = summary.totalCount - summary.recordsWithoutType;
  const oneFolded = summary.foldedRecordCount === 1;
  const folded =
    summary.foldedRecordCount === 0
      ? ""
      : talliedCount === 1
        ? " The single tallied record carries GVP's multiplicity or " +
          "uncertainty marker and is counted under the base landform."
        : ` ${summary.foldedRecordCount} of the tallied records ` +
          `${oneFolded ? "carries" : "carry"} GVP's multiplicity or ` +
          `uncertainty marker and ${oneFolded ? "is" : "are"} counted under ` +
          `the base landform.`;
  // A single landform has no order to describe.
  const order = summary.tallies.length === 1 ? "" : ", ordered by count";

  return (
    `Recorded landforms across all ${summary.totalCount} matched ` +
    `${records(summary.totalCount)}${order}: ${listed}${further}.` +
    `${untyped}${folded} These are catalogued morphology labels, not a ` +
    `measure of size, activity, or hazard.`
  );
}
